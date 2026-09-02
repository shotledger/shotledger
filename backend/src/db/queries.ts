import { and, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import {
  mergeChange,
  PULL_PAGE_SIZE,
  type ClientChange,
  type PushAck,
  type StoredRow,
  type SyncTableName,
} from '@shotledger/shared';

import { syncIdempotency, syncRows } from './schema';

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

async function findExistingRow(
  db: Db,
  userId: string,
  tableName: SyncTableName,
  rowId: string,
): Promise<StoredRow | undefined> {
  const rows = await db
    .select()
    .from(syncRows)
    .where(
      and(
        eq(syncRows.userId, userId),
        eq(syncRows.tableName, tableName),
        eq(syncRows.rowId, rowId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? toStoredRow(row) : undefined;
}

async function findIdempotencyRecord(
  db: Db,
  userId: string,
  clientChangeId: string,
): Promise<PushAck | undefined> {
  const records = await db
    .select()
    .from(syncIdempotency)
    .where(
      and(eq(syncIdempotency.userId, userId), eq(syncIdempotency.clientChangeId, clientChangeId)),
    )
    .limit(1);
  const record = records[0];
  if (!record) return undefined;
  return {
    clientChangeId,
    status: 'duplicate',
    ...(record.seq !== null ? { seq: record.seq } : {}),
    ...(record.reason !== null ? { reason: record.reason } : {}),
  };
}

/** Atomically bumps and returns the next per-user sequence number. */
async function allocateSequence(db: Db, userId: string): Promise<number> {
  const result = await db.run(sql`
    INSERT INTO sync_sequence (user_id, last_seq) VALUES (${userId}, 1)
    ON CONFLICT(user_id) DO UPDATE SET last_seq = last_seq + 1
    RETURNING last_seq
  `);
  const rows = result.results as Array<{ last_seq: number }>;
  const row = rows[0];
  if (!row) throw new Error('allocateSequence: RETURNING produced no row');
  return row.last_seq;
}

/**
 * Applies one push change: idempotency check, merge, upsert, and
 * idempotency-record write. Never reprocesses a clientChangeId already
 * seen for this user (spec §4).
 */
export async function applyPushChange(
  db: Db,
  userId: string,
  change: ClientChange,
): Promise<PushAck> {
  const duplicate = await findIdempotencyRecord(db, userId, change.clientChangeId);
  if (duplicate) return duplicate;

  const existing = await findExistingRow(db, userId, change.tableName, change.rowId);
  const seq = await allocateSequence(db, userId);
  const outcome = mergeChange(existing, change, seq);

  if (outcome.status === 'rejected') {
    await db.insert(syncIdempotency).values({
      userId,
      clientChangeId: change.clientChangeId,
      status: 'rejected',
      seq: null,
      reason: outcome.reason,
    });
    return { clientChangeId: change.clientChangeId, status: 'rejected', reason: outcome.reason };
  }

  const { row } = outcome;
  await db
    .insert(syncRows)
    .values({
      userId,
      tableName: row.tableName,
      rowId: row.rowId,
      seq: row.seq,
      payload: row.payload === null ? null : JSON.stringify(row.payload),
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    })
    .onConflictDoUpdate({
      target: [syncRows.userId, syncRows.tableName, syncRows.rowId],
      set: {
        seq: row.seq,
        payload: row.payload === null ? null : JSON.stringify(row.payload),
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
      },
    });

  await db.insert(syncIdempotency).values({
    userId,
    clientChangeId: change.clientChangeId,
    status: 'applied',
    seq: row.seq,
    reason: null,
  });

  return { clientChangeId: change.clientChangeId, status: 'applied', seq: row.seq };
}
