import { describe, expect, it } from 'vitest';

import type { SyncCycleResult } from './engine';
import { initialSyncStatus, reduceSyncStatus } from './status';

const ok: SyncCycleResult = { status: 'ok', pulled: 2, pushed: 1, rejected: 0, duplicates: 0 };

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
    const updated = reduceSyncStatus(initialSyncStatus, { type: 'pendingChanged', pendingCount: 4 });
    expect(updated.pendingCount).toBe(4);
    expect(updated.state).toBe('idle');
  });
});
