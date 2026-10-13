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
    });
    expect(done).toEqual({
      state: 'idle',
      lastSyncedAt: '2026-09-02T10:00:00.000Z',
      pendingCount: 0,
      errorKey: null,
      attempt: 0,
      refusedCount: 0,
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
    });
    const errored = reduceSyncStatus(done, { type: 'failed', errorKey: 'network' });
    expect(errored.lastSyncedAt).toBe('2026-09-02T10:00:00.000Z');
  });

  it('updates the pending count on its own', () => {
    const updated = reduceSyncStatus(initialSyncStatus, {
      type: 'pendingChanged',
      pendingCount: 4,
    });
    expect(updated.pendingCount).toBe(4);
    expect(updated.state).toBe('idle');
  });

  // docs/specs/sync-payload-validation-spec.md P12.
  it('adds up the changes the server refused, across cycles, and a failure keeps the sum', () => {
    const at = '2026-09-02T10:00:00.000Z';
    let status = reduceSyncStatus(initialSyncStatus, {
      type: 'succeeded',
      at,
      result: { ...ok, invalid: 2 },
      pendingCount: 0,
    });
    status = reduceSyncStatus(status, {
      type: 'succeeded',
      at,
      result: { ...ok, invalid: 1 },
      pendingCount: 0,
    });
    expect(status.refusedCount).toBe(3);
    status = reduceSyncStatus(status, { type: 'failed', errorKey: 'network' });
    status = reduceSyncStatus(status, { type: 'started' });
    status = reduceSyncStatus(status, { type: 'pendingChanged', pendingCount: 2 });
    expect(status.refusedCount).toBe(3);
  });

  it('starts with nothing refused', () => {
    expect(initialSyncStatus.refusedCount).toBe(0);
  });
});
