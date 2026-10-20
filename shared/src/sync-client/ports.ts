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

/**
 * What the server holds back for one row (docs/specs/sync-family-refusal-spec.md
 * §11.6): an `invalid` row it refused, or a `waiting` row it keeps until its
 * family is released. A mark stops a pull from overwriting the local version
 * with an older one; it decides nothing else.
 */
export interface RefusalMark {
  tableName: SyncTableName;
  rowId: string;
  kind: 'waiting' | 'invalid';
  /** The server record's arrival. */
  arrival: number;
  /** For `waiting`: the bad row that blocks it. */
  blocker: RowRef | null;
}

/**
 * What an ack does to its row's mark: `set` upserts it, keeping the greater
 * arrival; `drop` deletes it unless the mark arrived after `upTo`.
 */
export type MarkUpdate = { set: RefusalMark } | { drop: RowRef; upTo: number };

/**
 * What an ack leaves to write, in the same transaction as the rev-matched
 * clear (§11.6): its mark, and on a `duplicate` the row as the server stores
 * it now, applied by the shadowing rules (`shadowPull`).
 */
export interface AckOutcome {
  mark: MarkUpdate;
  current?: ChangeRow;
}

export interface LocalStore {
  /** Cursor per synced table; a table never synced reads as 0. */
  readCursors(): Promise<Record<SyncTableName, number>>;
  setCursor(tableName: SyncTableName, cursor: number): Promise<void>;
  /**
   * Apply pulled rows in one transaction with the outbox triggers
   * suppressed, so applying never re-queues what we just received. `marks`,
   * when given, replaces every refusal mark in that same transaction, before
   * the rows are applied (§11.6).
   */
  applyChanges(changes: ChangeRow[], marks?: readonly RefusalMark[]): Promise<void>;
  /** Queued entries in `rev` order, up to `limit`. */
  readOutbox(limit: number): Promise<OutboxEntry[]>;
  /**
   * `${tableName}:${rowId}` for every queued change — the set a pulled page
   * is filtered against so the server's older state cannot overwrite an
   * unsent local edit (see shadow.ts).
   */
  pendingRowKeys(): Promise<ReadonlySet<string>>;
  readRow(tableName: SyncTableName, rowId: string): Promise<LocalRowSnapshot | undefined>;
  assignClientChangeId(entry: OutboxEntry, clientChangeId: string): Promise<void>;
  /**
   * Deletes the entry only when its `rev` still matches (spec §2), then
   * writes `outcome` whatever the rev, in one transaction: the server's
   * verdict stands either way.
   */
  clearOutboxEntry(entry: OutboxEntry, outcome?: AckOutcome): Promise<void>;
  pendingCount(): Promise<number>;
  /** Every refusal mark (§11.6). */
  readMarks(): Promise<RefusalMark[]>;
  /** What Account & Sync shows: `invalid` and `waiting` marks. */
  markCounts(): Promise<{ invalid: number; waiting: number }>;
}

export interface SyncTransport {
  pull(request: PullRequest): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
}
