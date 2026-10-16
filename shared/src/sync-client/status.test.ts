import { describe, expect, it } from 'vitest';

import type { SyncCycleResult } from './engine';
import { initialSyncStatus, reduceSyncStatus } from './status';

const ok: SyncCycleResult = {
  status: 'ok',
  pulled: 2,
  shadowed: 0,
  pushed: 1,
  rejected: 0,
  invalid: 0,
  held: 0,
  duplicates: 0,
};

describe('reduceSyncStatus', () => {
  it('marks a cycle as running without clearing the previous error', () => {
    const errored = reduceSyncStatus(initialSyncStatus, { type: 'failed', errorKey: 'network' });
    const running = reduceSyncStatus(errored, { type: 'started' });
    expect(running.state).toBe('syncing');
    expect(running.errorKey).toBe('network');
  });

  it('clears the error and resets the attempt counter on success', () => {
    const errored = reduceSyncStatus(initialSyncStatus, { type: 'failed', errorKey: 'network' });
    const done = reduceSyncStatus(errored, {
      type: 'succeeded',
      at: '2026-09-02T10:00:00.000Z',
      result: ok,
      pendingCount: 0,
      heldCount: 0,
    });
    expect(done).toEqual({
      state: 'idle',
      lastSyncedAt: '2026-09-02T10:00:00.000Z',
      pendingCount: 0,
      errorKey: null,
      attempt: 0,
      refusedCount: 0,
      heldCount: 0,
    });
  });

  it('counts consecutive failures', () => {
    let status = reduceSyncStatus(initialSyncStatus, { type: 'failed', errorKey: 'network' });
    status = reduceSyncStatus(status, { type: 'failed', errorKey: 'unknown' });
    expect(status.attempt).toBe(2);
    expect(status.errorKey).toBe('unknown');
    expect(status.state).toBe('error');
  });

  it('keeps the last synced time visible while an error is showing', () => {
    const done = reduceSyncStatus(initialSyncStatus, {
      type: 'succeeded',
      at: '2026-09-02T10:00:00.000Z',
      result: ok,
      pendingCount: 0,
      heldCount: 0,
    });
    const errored = reduceSyncStatus(done, { type: 'failed', errorKey: 'network' });
    expect(errored.lastSyncedAt).toBe('2026-09-02T10:00:00.000Z');
  });

  it('updates the pending count on its own', () => {
    const updated = reduceSyncStatus(initialSyncStatus, {
      type: 'pendingChanged',
      pendingCount: 4,
      heldCount: 0,
    });
    expect(updated.pendingCount).toBe(4);
    expect(updated.state).toBe('idle');
  });

  // docs/specs/sync-payload-validation-spec.md P12.
  it('adds up the refusals as they arrive; no cycle outcome changes the sum', () => {
    const at = '2026-09-02T10:00:00.000Z';
    let status = reduceSyncStatus(initialSyncStatus, { type: 'refused' });
    status = reduceSyncStatus(status, { type: 'refused' });
    expect(status.refusedCount).toBe(2);
    expect(status.state).toBe('idle');
    // The result's own count is reported already, refusal by refusal.
    status = reduceSyncStatus(status, {
      type: 'succeeded',
      at,
      result: { ...ok, invalid: 2 },
      pendingCount: 0,
      heldCount: 0,
    });
    expect(status.refusedCount).toBe(2);
    status = reduceSyncStatus(status, { type: 'refused' });
    status = reduceSyncStatus(status, { type: 'failed', errorKey: 'network' });
    status = reduceSyncStatus(status, { type: 'started' });
    status = reduceSyncStatus(status, { type: 'pendingChanged', pendingCount: 2, heldCount: 0 });
    expect(status.refusedCount).toBe(3);
  });

  it('starts with nothing refused', () => {
    expect(initialSyncStatus.refusedCount).toBe(0);
  });

  // docs/specs/sync-family-refusal-spec.md §2.4, C5: the held count is read
  // from the outbox, so each event carries it whole rather than adding to it.
  it('takes the held count from each succeeded cycle and each pending refresh', () => {
    expect(initialSyncStatus.heldCount).toBe(0);
    let status = reduceSyncStatus(initialSyncStatus, {
      type: 'pendingChanged',
      pendingCount: 5,
      heldCount: 3,
    });
    expect(status).toMatchObject({ pendingCount: 5, heldCount: 3 });
    status = reduceSyncStatus(status, { type: 'started' });
    status = reduceSyncStatus(status, { type: 'failed', errorKey: 'network' });
    expect(status.heldCount).toBe(3);
    status = reduceSyncStatus(status, {
      type: 'succeeded',
      at: '2026-10-14T10:00:00.000Z',
      result: { ...ok, held: 1 },
      pendingCount: 1,
      heldCount: 1,
    });
    expect(status).toMatchObject({ pendingCount: 1, heldCount: 1 });
    status = reduceSyncStatus(status, { type: 'pendingChanged', pendingCount: 0, heldCount: 0 });
    expect(status.heldCount).toBe(0);
  });
});
