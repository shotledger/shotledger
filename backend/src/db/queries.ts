import { and, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { BatchItem } from 'drizzle-orm/batch';

import {
  judgePush,
  OWNERSHIP_EDGES,
  PULL_PAGE_SIZE,
  REJECTED_FAMILY,
  REJECTED_INVALID_PAYLOAD,
  REJECTED_TOMBSTONED,
  type ChangeRow,
  type ClientChange,
  type PushAck,
  type PushPlan,
  type PushSnapshot,
  type RefusalEntry,
  type RefusalRecord,
  type RowRef,
  type StoredLink,
  type StoredRow,
  type SyncTableName,
  type Verdict,
} from '@shotledger/shared/src/sync';

import { syncIdempotency, syncRefusals, syncRows, syncSequence } from './schema';

export type Db = ReturnType<typeof drizzle>;

export function createDb(d1: D1Database): Db {
  return drizzle(d1);
}

interface StoredRecord {
  tableName: string;
  rowId: string;
  seq: number;
  payload: string | null;
  updatedAt: string;
  deletedAt: string | null;
  arrivalRev: number;
}

function toStoredRow(row: StoredRecord): StoredRow & { arrival: number } {
  return {
    tableName: row.tableName as SyncTableName,
    rowId: row.rowId,
    seq: row.seq,
    payload: row.payload === null ? null : (JSON.parse(row.payload) as unknown),
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    arrival: row.arrivalRev,
  };
}

/** A stored row as a pulled `ChangeRow`, with its arrival (§11.7). */
export function toChangeRow(row: StoredRow & { arrival: number }): ChangeRow {
  return {
    tableName: row.tableName,
    rowId: row.rowId,
    seq: row.seq,
    payload: row.payload,
    deletedAt: row.deletedAt,
    updatedAt: row.updatedAt,
    arrival: row.arrival,
  };
}

export interface PullPage {
  rows: (StoredRow & { arrival: number })[];
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

/**
 * The user's refusal records, as a pull lists them (sync-family-refusal-spec.md
 * §11.7): no payloads, read once per pull request.
 */
export async function readRefusals(db: Db, userId: string): Promise<RefusalEntry[]> {
  const rows = await db
    .select()
    .from(syncRefusals)
    .where(eq(syncRefusals.userId, userId))
    .orderBy(syncRefusals.tableName, syncRefusals.rowId);
  return rows.map((row) => ({
    tableName: row.tableName as SyncTableName,
    rowId: row.rowId,
    reason: row.reason as RefusalEntry['reason'],
    arrival: row.arrival,
    blocker: refOrNull(row.blockerTable, row.blockerRowId),
  }));
}

function refOrNull(tableName: string | null, rowId: string | null): RowRef | null {
  return tableName === null || rowId === null
    ? null
    : { tableName: tableName as SyncTableName, rowId };
}

/** Every list a statement reads is one bound JSON array of `[table, row, …]` tuples. */
function tuples(rows: readonly (readonly unknown[])[]): string {
  return JSON.stringify(rows);
}

/**
 * `table_name`/`row_id` is one of `list`'s first two items. As a row-value
 * `IN`, SQLite reads the list once and probes the primary key for each pair
 * (`SEARCH … USING INDEX … (user_id=? AND table_name=? AND row_id=?)`,
 * `LIST SUBQUERY`), so the cost follows the list, not the user's rows
 * (round 5, V5-3).
 */
function inList(list: string) {
  return sql`(table_name, row_id) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]')
    FROM json_each(${list}))`;
}

// --- The snapshot (§11.4, §11.8): read outside the batch, guarded by state_rev.

async function readStateRev(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ stateRev: syncSequence.stateRev })
    .from(syncSequence)
    .where(eq(syncSequence.userId, userId));
  return row?.stateRev ?? 0;
}

async function readRecorded(db: Db, userId: string, changes: readonly ClientChange[]) {
  const ids = JSON.stringify(changes.map((change) => change.clientChangeId));
  const rows = await db
    .select({ clientChangeId: syncIdempotency.clientChangeId })
    .from(syncIdempotency)
    .where(
      sql`${syncIdempotency.userId} = ${userId} AND ${syncIdempotency.clientChangeId} IN (SELECT value FROM json_each(${ids}))`,
    );
  return new Set(rows.map((row) => row.clientChangeId));
}

async function readRecords(db: Db, userId: string): Promise<RefusalRecord[]> {
  const rows = await db
    .select({
      tableName: syncRefusals.tableName,
      rowId: syncRefusals.rowId,
      reason: syncRefusals.reason,
      parentTable: syncRefusals.parentTable,
      parentRowId: syncRefusals.parentRowId,
      arrival: syncRefusals.arrival,
      blockerTable: syncRefusals.blockerTable,
      blockerRowId: syncRefusals.blockerRowId,
    })
    .from(syncRefusals)
    .where(eq(syncRefusals.userId, userId));
  return rows.map((row) => ({
    tableName: row.tableName as SyncTableName,
    rowId: row.rowId,
    reason: row.reason as RefusalRecord['reason'],
    parent: refOrNull(row.parentTable, row.parentRowId),
    arrival: row.arrival,
    blocker: refOrNull(row.blockerTable, row.blockerRowId),
  }));
}

const EDGES = JSON.stringify(OWNERSHIP_EDGES.map((e) => [e.child, e.column, e.parent]));

/**
 * The stored rows the judge's walk needs, in one recursive read: from every
 * seed, up its stored ownership links, at most two steps (shot, series,
 * session), stopping at a tombstone (§11.4).
 */
async function readWalk(
  db: Db,
  userId: string,
  changes: readonly ClientChange[],
  records: readonly RefusalRecord[],
): Promise<StoredLink[]> {
  const seeds: [string, string][] = [];
  const add = (ref: RowRef | null) => {
    if (ref !== null) seeds.push([ref.tableName, ref.rowId]);
  };
  for (const change of changes) {
    add(change);
    const edge = OWNERSHIP_EDGES.find((e) => e.child === change.tableName);
    const owner =
      edge === undefined || change.payload === null || typeof change.payload !== 'object'
        ? undefined
        : (change.payload as Record<string, unknown>)[edge.column];
    if (edge !== undefined && typeof owner === 'string') {
      add({ tableName: edge.parent, rowId: owner });
    }
  }
  for (const record of records) {
    add(record);
    add(record.parent);
  }
  const rows = await db.all<{
    table_name: string;
    row_id: string;
    deleted: number;
    parent_table: string | null;
    parent_row_id: unknown;
  }>(sql`WITH RECURSIVE
    edges(child, col, parent) AS (
      SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]')
      FROM json_each(${EDGES})),
    walk(t, r, depth) AS (
      SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), 0 FROM json_each(${tuples(seeds)})
      UNION
      SELECT e.parent, json_extract(s.payload, '$.' || e.col), w.depth + 1
      FROM walk w
      JOIN sync_rows s ON s.user_id = ${userId} AND s.table_name = w.t AND s.row_id = w.r
      JOIN edges e ON e.child = w.t
      WHERE w.depth < 2 AND s.deleted_at IS NULL
        AND json_type(s.payload, '$.' || e.col) = 'text')
    SELECT DISTINCT s.table_name, s.row_id, s.deleted_at IS NOT NULL AS deleted,
      e.parent AS parent_table, json_extract(s.payload, '$.' || e.col) AS parent_row_id
    FROM walk w
    JOIN sync_rows s ON s.user_id = ${userId} AND s.table_name = w.t AND s.row_id = w.r
    LEFT JOIN edges e ON e.child = s.table_name`);
  return rows.map((row) => ({
    tableName: row.table_name as SyncTableName,
    rowId: row.row_id,
    deleted: row.deleted === 1,
    parent:
      row.parent_table === null || typeof row.parent_row_id !== 'string'
        ? null
        : { tableName: row.parent_table as SyncTableName, rowId: row.parent_row_id },
  }));
}

async function readSnapshot(
  db: Db,
  userId: string,
  changes: readonly ClientChange[],
): Promise<PushSnapshot> {
  // state_rev first: the guard compares against it, so any push committed
  // after this read fails the batch, whatever the later reads saw.
  const stateRev = await readStateRev(db, userId);
  const recorded = await readRecorded(db, userId, changes);
  const records = await readRecords(db, userId);
  const stored = await readWalk(db, userId, changes, records);
  return { stateRev, recorded, records, stored };
}

/** A waiting row's stored version, for re-validation before release (§11.5). */
export interface WaitingRow {
  tableName: SyncTableName;
  rowId: string;
  payload: unknown;
  updatedAt: string;
}

async function readWaiting(db: Db, userId: string, refs: readonly RowRef[]): Promise<WaitingRow[]> {
  const rows = await db
    .select({
      tableName: syncRefusals.tableName,
      rowId: syncRefusals.rowId,
      payload: syncRefusals.payload,
      updatedAt: syncRefusals.updatedAt,
    })
    .from(syncRefusals)
    .where(
      sql`${syncRefusals.userId} = ${userId} AND ${inList(tuples(refs.map((r) => [r.tableName, r.rowId])))}`,
    );
  return rows.map((row) => ({
    tableName: row.tableName as SyncTableName,
    rowId: row.rowId,
    payload: JSON.parse(row.payload!) as unknown,
    updatedAt: row.updatedAt!,
  }));
}

const keyOf = (ref: RowRef) => `${ref.tableName}:${ref.rowId}`;

/**
 * Judges the push, then validates the payloads it would release again: a
 * waiting row that fails becomes a bad row, and the push is judged again.
 * Judging again only shrinks the release list, and every row left on it has
 * passed, so one more judgment ends it, with no new read (§11.5).
 */
async function planPush(
  db: Db,
  userId: string,
  changes: readonly ClientChange[],
  invalid: ReadonlySet<number>,
  snapshot: PushSnapshot,
  revalidate: ((row: WaitingRow) => boolean) | undefined,
): Promise<PushPlan> {
  const plan = judgePush(changes, invalid, snapshot);
  if (revalidate === undefined || plan.release.length === 0) return plan;
  const waiting = await readWaiting(db, userId, plan.release);
  const demoted = new Set(waiting.filter((row) => !revalidate(row)).map(keyOf));
  return demoted.size === 0 ? plan : judgePush(changes, invalid, snapshot, demoted);
}

// --- The batch (§11.5, §11.8).

/**
 * The one statement that writes `state_rev`: the arrival bump and the
 * snapshot guard. A push judged with a sequence row that is gone by the
 * batch, as when the account is deleted in between, must not create one:
 * its `last_seq` is null then, and the insert fails (round 5, V5-6). Only a
 * push judged from no row (`stateRev` 0) creates it.
 */
function guardStatement(db: Db, userId: string, stateRev: number) {
  return db
    .insert(syncSequence)
    .values({
      userId,
      lastSeq: sql`CASE WHEN ${stateRev} = 0
        OR EXISTS (SELECT 1 FROM sync_sequence WHERE user_id = ${userId}) THEN 0 END`,
      stateRev: 1,
    })
    .onConflictDoUpdate({
      target: syncSequence.userId,
      set: {
        stateRev: sql`CASE WHEN ${syncSequence.stateRev} = ${stateRev} THEN ${syncSequence.stateRev} + 1 END`,
      },
    });
}

/** SQLite's message when the guard's CASE yields null: no other statement writes state_rev. */
const GUARD_FAILED = 'NOT NULL constraint failed: sync_sequence.state_rev';

function isGuardFailure(error: unknown): boolean {
  return hasMessage(error, GUARD_FAILED);
}

/** SQLite's message when the guard expected a sequence row that is gone. */
const ACCOUNT_GONE = 'NOT NULL constraint failed: sync_sequence.last_seq';

function hasMessage(error: unknown, message: string): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(message)) return true;
  }
  return false;
}

/**
 * The user's sequence row went between the snapshot and the batch: the
 * account was deleted. Nothing is written, and the push is not tried again,
 * since a fresh read would find no row and recreate the user (V5-6).
 */
export class PushAccountGoneError extends Error {
  constructor() {
    super('applyPush: the account was deleted during the push');
    this.name = 'PushAccountGoneError';
  }
}

/** The snapshot guard failed on every attempt: the route answers 503 (§11.7). */
export class PushBusyError extends Error {
  constructor() {
    super('applyPush: the snapshot changed on every attempt');
    this.name = 'PushBusyError';
  }
}

/** Reads and judges again at most this many more times after the first (§11.8). */
export const PUSH_RETRIES = 3;

interface IdempotencyRecord {
  status: string;
  seq: number | null;
  reason: string | null;
  arrivalRev: number;
  blockerTable: string | null;
  blockerRowId: string | null;
}

const idempotencyColumns = {
  status: syncIdempotency.status,
  seq: syncIdempotency.seq,
  reason: syncIdempotency.reason,
  arrivalRev: syncIdempotency.arrivalRev,
  blockerTable: syncIdempotency.blockerTable,
  blockerRowId: syncIdempotency.blockerRowId,
};

const STATEMENTS_PER_CHANGE = 5;

/** Why the route refuses a live change before it reaches the batch. */
export type PushRefusal = typeof REJECTED_INVALID_PAYLOAD | typeof REJECTED_FAMILY;

function refusalOf(verdict: Verdict): PushRefusal | null {
  return verdict.kind === 'invalid_payload' || verdict.kind === 'family_refused'
    ? verdict.kind
    : null;
}

/**
 * The five statements of one change: today's four
 * (docs/specs/sync-push-atomicity-spec.md §3) and the record's upsert or
 * delete (sync-family-refusal-spec.md §11.5). Every write is still guarded in
 * SQL, so a duplicate or a tombstoned row writes nothing whatever the plan
 * says. `ok` is mergeChange's R2 (a live edit over a tombstone is rejected)
 * and the judge's verdict: `reason` is null for a change to apply. A change
 * failing both is reported as tombstoned, so the client still learns the
 * tombstone (C11).
 */
function changeStatements(
  db: Db,
  userId: string,
  change: ClientChange,
  verdict: Verdict,
  arrival: number,
): BatchItem<'sqlite'>[] {
  const { clientChangeId, tableName, rowId, deletedAt, updatedAt } = change;
  const reason = refusalOf(verdict);
  const payload =
    deletedAt === null && change.payload != null ? JSON.stringify(change.payload) : null;
  const parent =
    verdict.kind === 'invalid_payload' || verdict.kind === 'family_refused' ? verdict.parent : null;
  const blocker = verdict.kind === 'family_refused' ? verdict.blocker : null;

  const notDuplicate = sql`NOT EXISTS (SELECT 1 FROM sync_idempotency
    WHERE user_id = ${userId} AND client_change_id = ${clientChangeId})`;
  const notTombstoned = sql`(${deletedAt} IS NOT NULL OR NOT EXISTS (SELECT 1 FROM sync_rows
    WHERE user_id = ${userId} AND table_name = ${tableName} AND row_id = ${rowId}
      AND deleted_at IS NOT NULL))`;
  const ok = sql`(${reason} IS NULL AND ${notTombstoned})`;
  const lastSeq = sql`(SELECT last_seq FROM sync_sequence WHERE user_id = ${userId})`;
  const thisRow = sql`user_id = ${userId} AND table_name = ${tableName} AND row_id = ${rowId}`;

  const record =
    reason === null
      ? db.delete(syncRefusals).where(sql`${thisRow} AND ${notDuplicate} AND ${ok}`)
      : db
          .insert(syncRefusals)
          .select(
            sql`SELECT ${userId}, ${tableName}, ${rowId}, ${reason},
              ${parent?.tableName ?? null}, ${parent?.rowId ?? null},
              ${reason === REJECTED_FAMILY ? payload : null},
              ${reason === REJECTED_FAMILY ? updatedAt : null},
              ${arrival}, ${blocker?.tableName ?? null}, ${blocker?.rowId ?? null},
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE ${notDuplicate} AND ${notTombstoned}`,
          )
          .onConflictDoUpdate({
            target: [syncRefusals.userId, syncRefusals.tableName, syncRefusals.rowId],
            set: {
              reason: sql`excluded.reason`,
              parentTable: sql`excluded.parent_table`,
              parentRowId: sql`excluded.parent_row_id`,
              payload: sql`excluded.payload`,
              updatedAt: sql`excluded.updated_at`,
              arrival: sql`excluded.arrival`,
              blockerTable: sql`excluded.blocker_table`,
              blockerRowId: sql`excluded.blocker_row_id`,
              refusedAt: sql`excluded.refused_at`,
            },
          });

  return [
    db
      .select(idempotencyColumns)
      .from(syncIdempotency)
      .where(
        and(eq(syncIdempotency.userId, userId), eq(syncIdempotency.clientChangeId, clientChangeId)),
      ),
    db
      .update(syncSequence)
      .set({ lastSeq: sql`${syncSequence.lastSeq} + 1` })
      .where(sql`${syncSequence.userId} = ${userId} AND ${notDuplicate} AND ${ok}`),
    db
      .insert(syncRows)
      .select(
        sql`SELECT ${userId}, ${tableName}, ${rowId}, ${lastSeq}, ${payload}, ${updatedAt}, ${deletedAt}, ${arrival}
          WHERE ${notDuplicate} AND ${ok}`,
      )
      .onConflictDoUpdate({
        target: [syncRows.userId, syncRows.tableName, syncRows.rowId],
        set: {
          seq: sql`excluded.seq`,
          payload: sql`excluded.payload`,
          updatedAt: sql`excluded.updated_at`,
          deletedAt: sql`excluded.deleted_at`,
          arrivalRev: sql`excluded.arrival_rev`,
        },
      }),
    record,
    db
      .insert(syncIdempotency)
      .select(
        sql`SELECT ${userId}, ${clientChangeId},
          CASE WHEN ${ok} THEN 'applied' ELSE 'rejected' END,
          CASE WHEN ${ok} THEN ${lastSeq} END,
          CASE WHEN ${ok} THEN NULL
            WHEN ${notTombstoned} THEN ${reason}
            ELSE ${REJECTED_TOMBSTONED} END,
          ${arrival},
          CASE WHEN NOT ${ok} AND ${notTombstoned} THEN ${blocker?.tableName ?? null} END,
          CASE WHEN NOT ${ok} AND ${notTombstoned} THEN ${blocker?.rowId ?? null} END
          WHERE true`,
      )
      .onConflictDoNothing()
      .returning(idempotencyColumns),
  ];
}

/**
 * What the batch does to the records after the changes (§11.5): turns the
 * demoted waiting rows into bad rows, rewrites the blockers that change,
 * applies the released rows in arrival order at new seqs, raises last_seq
 * past them, and deletes the released and inert records. Every list is read
 * once and joined to the records by primary key, so a push costs what its
 * lists hold, not what the user has waiting (round 5, V5-3).
 */
function recordStatements(db: Db, userId: string, plan: PushPlan): BatchItem<'sqlite'>[] {
  const refs = (list: readonly RowRef[]) => tuples(list.map((r) => [r.tableName, r.rowId]));
  const mine = sql`${syncRefusals.userId} = ${userId}`;
  const blockers = tuples(
    plan.blockers.map((b) => [b.row.tableName, b.row.rowId, b.blocker.tableName, b.blocker.rowId]),
  );
  const released = refs(plan.release);

  return [
    db
      .update(syncRefusals)
      .set({
        reason: REJECTED_INVALID_PAYLOAD,
        payload: null,
        updatedAt: null,
        blockerTable: null,
        blockerRowId: null,
      })
      .where(sql`${mine} AND ${inList(refs(plan.demoted))}`),
    // `LIMIT -1` keeps SQLite from flattening the list into the join, so it
    // materializes it, scans it, and probes the primary key per pair (`SCAN
    // b`, `SEARCH sync_refusals … (user_id=? AND table_name=? AND row_id=?)`)
    // rather than scanning the list once per record.
    db
      .update(syncRefusals)
      .set({ blockerTable: sql`b.bt`, blockerRowId: sql`b.br` })
      .from(
        sql`(SELECT json_extract(value, '$[0]') AS t, json_extract(value, '$[1]') AS r,
          json_extract(value, '$[2]') AS bt, json_extract(value, '$[3]') AS br
          FROM json_each(${blockers}) LIMIT -1) AS b`,
      )
      .where(
        sql`${syncRefusals.userId} = ${userId}
          AND ${syncRefusals.tableName} = b.t AND ${syncRefusals.rowId} = b.r`,
      ),
    db
      .insert(syncRows)
      .select(
        sql`SELECT r.user_id, r.table_name, r.row_id,
            (SELECT last_seq FROM sync_sequence WHERE user_id = ${userId})
              + row_number() OVER (ORDER BY r.arrival, r.table_name, r.row_id),
            r.payload, r.updated_at, NULL, r.arrival
          FROM json_each(${released}) AS j
          CROSS JOIN sync_refusals r ON r.user_id = ${userId}
            AND r.table_name = json_extract(j.value, '$[0]')
            AND r.row_id = json_extract(j.value, '$[1]')
          WHERE r.reason = ${REJECTED_FAMILY}
            AND NOT EXISTS (SELECT 1 FROM sync_rows s
              WHERE s.user_id = r.user_id AND s.table_name = r.table_name AND s.row_id = r.row_id
                AND (s.deleted_at IS NOT NULL OR s.arrival_rev >= r.arrival))`,
      )
      .onConflictDoUpdate({
        target: [syncRows.userId, syncRows.tableName, syncRows.rowId],
        set: {
          seq: sql`excluded.seq`,
          payload: sql`excluded.payload`,
          updatedAt: sql`excluded.updated_at`,
          deletedAt: sql`excluded.deleted_at`,
          arrivalRev: sql`excluded.arrival_rev`,
        },
      }),
    db
      .update(syncSequence)
      .set({
        lastSeq: sql`MAX(${syncSequence.lastSeq}, (SELECT COALESCE(MAX(seq), 0) FROM sync_rows WHERE user_id = ${userId}))`,
      })
      .where(eq(syncSequence.userId, userId)),
    db
      .delete(syncRefusals)
      .where(sql`${mine} AND ${inList(refs([...plan.release, ...plan.inert]))}`),
  ];
}

/** The rows the push's duplicates name, as stored at the end of the batch (§11.7). */
function currentStatement(
  db: Db,
  userId: string,
  changes: readonly ClientChange[],
  plan: PushPlan,
) {
  const duplicates = changes.filter((_change, i) => plan.verdicts[i]!.kind === 'duplicate');
  return db
    .select()
    .from(syncRows)
    .where(
      sql`${syncRows.userId} = ${userId} AND ${inList(tuples(duplicates.map((c) => [c.tableName, c.rowId])))}`,
    );
}

function toAck(
  clientChangeId: string,
  before: IdempotencyRecord | undefined,
  written: IdempotencyRecord | undefined,
  current: ChangeRow | null,
): PushAck {
  const blocker = (record: IdempotencyRecord) => {
    const ref = refOrNull(record.blockerTable, record.blockerRowId);
    return ref === null ? {} : { blocker: ref };
  };
  if (before) {
    return {
      clientChangeId,
      status: 'duplicate',
      ...(before.seq !== null ? { seq: before.seq } : {}),
      ...(before.reason !== null ? { reason: before.reason } : {}),
      arrival: before.arrivalRev,
      ...blocker(before),
      current,
    };
  }
  // Unreachable in one serialized transaction; the batch has committed, so
  // the client's retry acks `duplicate` (spec §3).
  if (!written) throw new Error(`applyPush: no idempotency record for ${clientChangeId}`);
  if (written.status === 'applied') {
    return { clientChangeId, status: 'applied', seq: written.seq!, arrival: written.arrivalRev };
  }
  return {
    clientChangeId,
    status: 'rejected',
    reason: written.reason!,
    arrival: written.arrivalRev,
    ...blocker(written),
  };
}

export interface ApplyPushOptions {
  /** Indexes of the changes the route's validator refused (`invalid_payload`). */
  invalid?: ReadonlySet<number>;
  /** Validates a waiting row again before it is released (§11.5); none skips it. */
  revalidate?: (row: WaitingRow) => boolean;
}

async function attemptPush(
  db: Db,
  userId: string,
  changes: readonly ClientChange[],
  options: ApplyPushOptions,
): Promise<PushAck[]> {
  const invalid = options.invalid ?? new Set<number>();
  const snapshot = await readSnapshot(db, userId, changes);
  const plan = await planPush(db, userId, changes, invalid, snapshot, options.revalidate);

  const statements: BatchItem<'sqlite'>[] = [
    guardStatement(db, userId, snapshot.stateRev),
    ...changes.flatMap((change, i) =>
      changeStatements(db, userId, change, plan.verdicts[i]!, plan.arrival),
    ),
    ...recordStatements(db, userId, plan),
    currentStatement(db, userId, changes, plan),
  ];
  const [first, ...rest] = statements;
  const results = (await db.batch([first!, ...rest])) as unknown[];

  const current = new Map(
    (results.at(-1) as StoredRecord[]).map((row) => [
      keyOf({ tableName: row.tableName as SyncTableName, rowId: row.rowId }),
      toChangeRow(toStoredRow(row)),
    ]),
  );
  return changes.map((change, i) => {
    const base = 1 + i * STATEMENTS_PER_CHANGE;
    const before = (results[base] as IdempotencyRecord[])[0];
    const written = (results[base + 4] as IdempotencyRecord[])[0];
    return toAck(change.clientChangeId, before, written, current.get(keyOf(change)) ?? null);
  });
}

/**
 * Applies one push request as a single D1 batch — one transaction — so seq
 * allocation, the row writes, the idempotency records, the refusal records
 * and the release commit together, in array order, and seq order equals
 * commit order across devices. The push is judged from reads made before
 * the batch; the batch's first statement fails when another push committed
 * in between, and the push is read and judged again (§11.8).
 */
export async function applyPush(
  db: Db,
  userId: string,
  changes: ClientChange[],
  options: ApplyPushOptions = {},
): Promise<PushAck[]> {
  if (changes.length === 0) return [];
  for (let attempt = 0; attempt <= PUSH_RETRIES; attempt += 1) {
    try {
      return await attemptPush(db, userId, changes, options);
    } catch (error) {
      if (hasMessage(error, ACCOUNT_GONE)) throw new PushAccountGoneError();
      if (!isGuardFailure(error)) throw error;
    }
  }
  throw new PushBusyError();
}
