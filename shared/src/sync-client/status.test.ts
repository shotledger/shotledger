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
      counts: { pendingCount: 0, refusedCount: 1, heldCount: 2 },
    });
    expect(done).toEqual({
      state: 'idle',
      lastSyncedAt: '2026-09-02T10:00:00.000Z',
      pendingCount: 0,
      errorKey: null,
      attempt: 0,
      refusedCount: 1,
      heldCount: 2,
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
      counts: { pendingCount: 0, refusedCount: 0, heldCount: 0 },
    });
    const errored = reduceSyncStatus(done, { type: 'failed', errorKey: 'network' });
    expect(errored.lastSyncedAt).toBe('2026-09-02T10:00:00.000Z');
  });

  it('updates the counts on their own', () => {
    const updated = reduceSyncStatus(initialSyncStatus, {
      type: 'countsChanged',
      counts: { pendingCount: 4, refusedCount: 1, heldCount: 3 },
    });
    expect(updated).toMatchObject({ pendingCount: 4, refusedCount: 1, heldCount: 3 });
    expect(updated.state).toBe('idle');
  });

  // docs/specs/sync-family-refusal-spec.md §11.6 (H11'): the refused and
  // waiting counts are read from durable marks, so they replace, never add
  // up; this supersedes the app-session sum of sync-payload-validation-spec
  // P12.
  it('takes the refused and waiting counts as read, and keeps them through a failure', () => {
    const at = '2026-09-02T10:00:00.000Z';
    let status = reduceSyncStatus(initialSyncStatus, {
      type: 'succeeded',
      at,
      result: { ...ok, invalid: 2 },
      counts: { pendingCount: 0, refusedCount: 2, heldCount: 3 },
    });
    expect(status).toMatchObject({ refusedCount: 2, heldCount: 3 });
    status = reduceSyncStatus(status, { type: 'failed', errorKey: 'network' });
    status = reduceSyncStatus(status, { type: 'started' });
    expect(status).toMatchObject({ refusedCount: 2, heldCount: 3 });
    status = reduceSyncStatus(status, {
      type: 'countsChanged',
      counts: { pendingCount: 2, refusedCount: 1, heldCount: 0 },
    });
    expect(status).toMatchObject({ pendingCount: 2, refusedCount: 1, heldCount: 0 });
  });

  it('starts with nothing refused or waiting', () => {
    expect(initialSyncStatus).toMatchObject({ refusedCount: 0, heldCount: 0 });
  });
});
