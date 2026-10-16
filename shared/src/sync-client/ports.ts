import type {
  ChangeRow,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncTableName,
} from '../sync/protocol';
import type { RowRef } from '../sync/family';

/**
 * The two I/O seams of the client sync engine (docs/specs/sync-app-spec.md
 * §3). Everything in `shared/src/sync-client/` talks to storage and network
 * only through these, so nothing here imports SQLite, `fetch`, or any
 * React Native / Expo module (spec N1).
 */

/** One pending local change, as recorded by the outbox triggers (spec §2). */
export interface OutboxEntry {
  tableName: SyncTableName;
  rowId: string;
  /** Monotonic local revision — the concurrency guard for the ack delete. */
  rev: number;
  /** Assigned on the first push attempt of this rev, then replayed on retry. */
  clientChangeId: string | null;
}

/** Current local state of one row, as the push needs to see it. */
export interface LocalRowSnapshot {
  payload: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LocalStore {
  /** Cursor per synced table; a table never synced reads as 0. */
  readCursors(): Promise<Record<SyncTableName, number>>;
  setCursor(tableName: SyncTableName, cursor: number): Promise<void>;
  /**
   * Apply pulled rows in one transaction with the outbox triggers
   * suppressed, so applying never re-queues what we just received.
   */
  applyChanges(changes: ChangeRow[]): Promise<void>;
  /**
   * Queued entries in `rev` order, up to `limit`. A **held** entry is
   * skipped: it stays queued, unsent, until `releaseHeld`
   * (docs/specs/sync-family-refusal-spec.md §2.3).
   */
  readOutbox(limit: number): Promise<OutboxEntry[]>;
  /**
   * `${tableName}:${rowId}` for every queued change — the set a pulled page
   * is filtered against so the server's older state cannot overwrite an
   * unsent local edit (see shadow.ts).
   */
  pendingRowKeys(): Promise<ReadonlySet<string>>;
  readRow(tableName: SyncTableName, rowId: string): Promise<LocalRowSnapshot | undefined>;
  assignClientChangeId(entry: OutboxEntry, clientChangeId: string): Promise<void>;
  /** Deletes only when the entry's `rev` still matches (spec §2). */
  clearOutboxEntry(entry: OutboxEntry): Promise<void>;
  pendingCount(): Promise<number>;

  // Family refusal (docs/specs/sync-family-refusal-spec.md §2.3): local
  // state, never synced.
  /** Rows whose latest pushed version the server refused as `invalid_payload`. */
  readRefused(): Promise<RowRef[]>;
  addRefused(ref: RowRef): Promise<void>;
  removeRefused(refs: readonly RowRef[]): Promise<void>;
  /**
   * Marks the entry held, only while its `rev` still matches (a write that
   * landed mid-push already reset it). `resetClientChangeId` also clears its
   * id, so it is sent as a new change once released.
   */
  holdOutboxEntry(entry: OutboxEntry, resetClientChangeId: boolean): Promise<void>;
  /** Un-holds every held entry, to be judged again on the next read. */
  releaseHeld(): Promise<void>;
  /** Held entries; what Account & Sync shows as waiting on a refused change. */
  heldCount(): Promise<number>;
  /**
   * The held entries themselves. A pulled change that replaces a held edit
   * drops its entry instead of being shadowed (Revision 2 items 8 and 9).
   */
  readHeld(): Promise<OutboxEntry[]>;
}

export interface SyncTransport {
  pull(request: PullRequest): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
}
