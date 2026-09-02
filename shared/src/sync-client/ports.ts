import type {
  ChangeRow,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncTableName,
} from '../sync/protocol';

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
  readOutbox(limit: number): Promise<OutboxEntry[]>;
  readRow(tableName: SyncTableName, rowId: string): Promise<LocalRowSnapshot | undefined>;
  assignClientChangeId(entry: OutboxEntry, clientChangeId: string): Promise<void>;
  /** Deletes only when the entry's `rev` still matches (spec §2). */
  clearOutboxEntry(entry: OutboxEntry): Promise<void>;
  pendingCount(): Promise<number>;
}

export interface SyncTransport {
  pull(request: PullRequest): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
}
