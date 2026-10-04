import { and, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { BatchItem } from 'drizzle-orm/batch';

import {
  PULL_PAGE_SIZE,
  REJECTED_TOMBSTONED,
  type ClientChange,
  type PushAck,
  type StoredRow,
  type SyncTableName,
} from '@shotledger/shared/src/sync';

import { syncIdempotency, syncRows, syncSequence } from './schema';

export type Db = ReturnType<typeof drizzle>;

export function createDb(d1: D1Database): Db {
  return drizzle(d1);
}

function toStoredRow(row: {
  tableName: string;
  rowId: string;
  seq: number;
  payload: string | null;
  updatedAt: string;
  deletedAt: string | null;
}): StoredRow {
  return {
    tableName: row.tableName as SyncTableName,
    rowId: row.rowId,
    seq: row.seq,
    payload: row.payload === null ? null : (JSON.parse(row.payload) as unknown),
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export interface PullPage {
  rows: StoredRow[];
  cursor: number;
  hasMore: boolean;
}

/** Rows for one table with seq strictly greater than `sinceSeq`, oldest first. */
export async function pullTablePage(
  db: Db,
  userId: string,
  tableName: SyncTableName,
  sinceSeq: number,
): Promise<PullPage> {
  const rows = await db
    .select()
    .from(syncRows)
    .where(
      and(
        eq(syncRows.userId, userId),
        eq(syncRows.tableName, tableName),
        gt(syncRows.seq, sinceSeq),
      ),
    )
    .orderBy(syncRows.seq)
    .limit(PULL_PAGE_SIZE);

  const storedRows = rows.map(toStoredRow);
  const lastRow = storedRows.at(-1);
  return {
    rows: storedRows,
    cursor: lastRow ? lastRow.seq : sinceSeq,
    hasMore: storedRows.length === PULL_PAGE_SIZE,
  };
}

interface IdempotencyRecord {
  status: string;
  seq: number | null;
  reason: string | null;
}

const STATEMENTS_PER_CHANGE = 4;

/**
 * The four statements of one change (docs/specs/sync-push-atomicity-spec.md
 * §3). Every decision is a SQL guard evaluated inside the batch's
 * transaction, so no read happens outside it. `ok` is mergeChange's R2: a
 * live edit over a tombstone is rejected; everything else applies.
 */
function changeStatements(db: Db, userId: string, change: ClientChange): BatchItem<'sqlite'>[] {
  const { clientChangeId, tableName, rowId, deletedAt, updatedAt } = change;
  const payload =
    deletedAt === null && change.payload != null ? JSON.stringify(change.payload) : null;

  const notDuplicate = sql`NOT EXISTS (SELECT 1 FROM sync_idempotency
    WHERE user_id = ${userId} AND client_change_id = ${clientChangeId})`;
  const ok = sql`(${deletedAt} IS NOT NULL OR NOT EXISTS (SELECT 1 FROM sync_rows
    WHERE user_id = ${userId} AND table_name = ${tableName} AND row_id = ${rowId}
      AND deleted_at IS NOT NULL))`;
  const lastSeq = sql`(SELECT last_seq FROM sync_sequence WHERE user_id = ${userId})`;

  return [
    db
      .select({
        status: syncIdempotency.status,
        seq: syncIdempotency.seq,
        reason: syncIdempotency.reason,
      })
      .from(syncIdempotency)
      .where(
        and(eq(syncIdempotency.userId, userId), eq(syncIdempotency.clientChangeId, clientChangeId)),
      ),
    db
      .insert(syncSequence)
      .select(sql`SELECT ${userId}, 1 WHERE ${notDuplicate} AND ${ok}`)
      .onConflictDoUpdate({ target: syncSequence.userId, set: { lastSeq: sql`last_seq + 1` } }),
    db
      .insert(syncRows)
      .select(
        sql`SELECT ${userId}, ${tableName}, ${rowId}, ${lastSeq}, ${payload}, ${updatedAt}, ${deletedAt}
          WHERE ${notDuplicate} AND ${ok}`,
      )
      .onConflictDoUpdate({
        target: [syncRows.userId, syncRows.tableName, syncRows.rowId],
        set: {
          seq: sql`excluded.seq`,
          payload: sql`excluded.payload`,
          updatedAt: sql`excluded.updated_at`,
          deletedAt: sql`excluded.deleted_at`,
        },
      }),
    db
      .insert(syncIdempotency)
      .select(
        sql`SELECT ${userId}, ${clientChangeId},
          CASE WHEN ${ok} THEN 'applied' ELSE 'rejected' END,
          CASE WHEN ${ok} THEN ${lastSeq} END,
          CASE WHEN ${ok} THEN NULL ELSE ${REJECTED_TOMBSTONED} END
          WHERE true`,
      )
      .onConflictDoNothing()
      .returning({
        status: syncIdempotency.status,
        seq: syncIdempotency.seq,
        reason: syncIdempotency.reason,
      }),
  ];
}

function toAck(
  clientChangeId: string,
  before: IdempotencyRecord | undefined,
  written: IdempotencyRecord | undefined,
): PushAck {
  if (before) {
    return {
      clientChangeId,
      status: 'duplicate',
      ...(before.seq !== null ? { seq: before.seq } : {}),
      ...(before.reason !== null ? { reason: before.reason } : {}),
    };
  }
  // Unreachable in one serialized transaction; the batch has committed, so
  // the client's retry acks `duplicate` (spec §3).
  if (!written) throw new Error(`applyPush: no idempotency record for ${clientChangeId}`);
  if (written.status === 'applied') {
    return { clientChangeId, status: 'applied', seq: written.seq! };
  }
  return { clientChangeId, status: 'rejected', reason: written.reason! };
}

/**
 * Applies one push request as a single D1 batch — one transaction — so seq
 * allocation, the row write and the idempotency record commit together, in
 * array order, and seq order equals commit order across devices.
 */
export async function applyPush(
  db: Db,
  userId: string,
  changes: ClientChange[],
): Promise<PushAck[]> {
  const statements = changes.flatMap((change) => changeStatements(db, userId, change));
  const [first, ...rest] = statements;
  if (!first) return [];
  const results = (await db.batch([first, ...rest])) as unknown[];

  return changes.map((change, i) => {
    const base = i * STATEMENTS_PER_CHANGE;
    const before = (results[base] as IdempotencyRecord[])[0];
    const written = (results[base + 3] as IdempotencyRecord[])[0];
    return toAck(change.clientChangeId, before, written);
  });
}
