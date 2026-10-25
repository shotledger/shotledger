import type { SyncErrorKey } from './backoff';
import type { SyncCycleResult } from './engine';

/**
 * The status the Account & sync screen renders, as a pure reducer
 * (docs/specs/sync-app-spec.md §7) — so what the user sees is testable
 * without a device.
 */

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** ISO-8601, or null when this device has never completed a cycle. */
  lastSyncedAt: string | null;
  pendingCount: number;
  errorKey: SyncErrorKey | null;
  /** Consecutive failures; drives nextBackoffMs, resets on any success. */
  attempt: number;
  /**
   * The account's rows the server refused as malformed: its `invalid` marks
   * (docs/specs/sync-family-refusal-spec.md §11.6). Durable.
   */
  refusedCount: number;
  /** The account's rows the server holds back behind a refused one: `waiting` marks. */
  heldCount: number;
}

/** What Account & Sync counts, read from the outbox and the marks. */
export type SyncCounts = Pick<SyncStatus, 'pendingCount' | 'refusedCount' | 'heldCount'>;

export const initialSyncStatus: SyncStatus = {
  state: 'idle',
  lastSyncedAt: null,
  pendingCount: 0,
  errorKey: null,
  attempt: 0,
  refusedCount: 0,
  heldCount: 0,
};

export type SyncEvent =
  | { type: 'started' }
  | { type: 'succeeded'; at: string; result: SyncCycleResult; counts: SyncCounts }
  | { type: 'failed'; errorKey: SyncErrorKey }
  | { type: 'countsChanged'; counts: SyncCounts };

export function reduceSyncStatus(status: SyncStatus, event: SyncEvent): SyncStatus {
  switch (event.type) {
    case 'started':
      // The previous error is kept until the outcome is known, so a retry in
      // flight does not flash the screen back to "all good".
      return { ...status, state: 'syncing' };
    case 'succeeded':
      return {
        state: 'idle',
        // A `partial` cycle still moved data and still counts as synced —
        // more pages simply remain, and the controller re-runs immediately.
        lastSyncedAt: event.at,
        ...event.counts,
        errorKey: null,
        attempt: 0,
      };
    case 'failed':
      return { ...status, state: 'error', errorKey: event.errorKey, attempt: status.attempt + 1 };
    case 'countsChanged':
      return { ...status, ...event.counts };
  }
}
