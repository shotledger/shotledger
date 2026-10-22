// SQLite adapter for the pure sync engine's LocalStore port
// (docs/specs/sync-app-spec.md §3). Every decision lives in
// shared/src/sync-client; this file only moves rows.
import { and, eq, getTableColumns, getTableName, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import {
  APPLY_ORDER,
  isSyncableSettingRow,
  type ChangeRow,
  type LocalRowSnapshot,
  type LocalStore,
  rowKey,
  type OutboxEntry,
  type SyncTableName,
} from '@shotledger/shared';

import { SYNC_TABLES } from '@shotledger/shared/src/sync/tables';

import { photoQueue, syncControl, syncOutbox, syncState } from '../schema';
import type { Database } from '../types';

/** Protocol table name -> Drizzle table; lives in shared/ so the server's
 * payload schemas read the same map (sync-payload-validation-spec §2.1). */
export { SYNC_TABLES };

/**
 * The wire payload uses the DB's own column names (snake_case), not Drizzle's
 * property names: it is the DB row that both devices agree on, and it keeps
 * the apply path a plain column-for-column upsert.
 */
function columnsOf(table: SQLiteTable): Record<string, SQLiteColumn> {
  return getTableColumns(table) as unknown as Record<string, SQLiteColumn>;
}

function toPayload(table: SQLiteTable, row: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [property, column] of Object.entries(columnsOf(table))) {
    payload[column.name] = row[property] ?? null;
  }
  return payload;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Applies one pulled row. Column names arriving from the server are matched
 * against this build's own column set before they reach any SQL text —
 * unknown ones are dropped (an older client tolerating a newer column, and
 * the reason no server-supplied string is ever interpolated as an
 * identifier).
 */
function applyOne(db: Database, change: ChangeRow): void {
  // A device-local key the server should never have held (ARCHITECTURE.md § Sync).
  if (change.tableName === 'settings' && !isSyncableSettingRow(change.rowId, change.payload)) {
    return;
  }
  const table = SYNC_TABLES[change.tableName];
  const tableSql = quoteIdentifier(getTableName(table));

  if (change.deletedAt !== null) {
    // A tombstone for a row this device has never seen is a no-op: there is
    // nothing to hide, and a shell row would be an orphan with no payload.
    db.run(
      sql`UPDATE ${sql.raw(tableSql)} SET "deleted_at" = ${change.deletedAt}, "updated_at" = ${change.updatedAt} WHERE "id" = ${change.rowId}`,
    );
    return;
  }

  const known = new Set(Object.values(columnsOf(table)).map((c) => c.name));
  const payload = (change.payload ?? {}) as Record<string, unknown>;
  const names = Object.keys(payload).filter((name) => known.has(name));
  if (!names.includes('id')) return;

  const assignments = names.filter((n) => n !== 'id');
  const insertCols = names.map(quoteIdentifier).join(', ');
  const updateSet = assignments.map(
    (n) => `${quoteIdentifier(n)} = excluded.${quoteIdentifier(n)}`,
  );
  const conflict =
    updateSet.length > 0
      ? `ON CONFLICT("id") DO UPDATE SET ${updateSet.join(', ')}`
      : `ON CONFLICT("id") DO NOTHING`;

  db.run(
    sql`INSERT INTO ${sql.raw(tableSql)} (${sql.raw(insertCols)}) VALUES (${sql.join(
      names.map((name) => sql`${payload[name] ?? null}`),
      sql.raw(', '),
    )}) ${sql.raw(conflict)}`,
  );
}

export function createSyncStore(db: Database): LocalStore {
  return {
    async readCursors() {
      const rows = db.select().from(syncState).all();
      const byTable = new Map(rows.map((r) => [r.tableName, r.cursor]));
      return Object.fromEntries(APPLY_ORDER.map((t) => [t, byTable.get(t) ?? 0])) as Record<
        SyncTableName,
        number
      >;
    },

    async setCursor(tableName, cursor) {
      db.insert(syncState)
        .values({ tableName, cursor })
        .onConflictDoUpdate({ target: syncState.tableName, set: { cursor } })
        .run();
    },

    async applyChanges(changes) {
      if (changes.length === 0) return;
      applyChangesSync(db, changes);
    },

    async readOutbox(limit) {
      return db
        .select()
        .from(syncOutbox)
        .orderBy(syncOutbox.rev)
        .limit(limit)
        .all()
        .map((row) => ({
          tableName: row.tableName as SyncTableName,
          rowId: row.rowId,
          rev: row.rev,
          clientChangeId: row.clientChangeId,
        }));
    },

    async readRow(tableName, rowId): Promise<LocalRowSnapshot | undefined> {
      return readRowSync(db, tableName, rowId);
    },

    async assignClientChangeId(entry, clientChangeId) {
      db.update(syncOutbox).set({ clientChangeId }).where(matches(entry)).run();
    },

    async clearOutboxEntry(entry) {
      // rev-matched: a local write that landed while this push was in flight
      // bumped rev, so the entry survives for the next cycle.
      db.delete(syncOutbox).where(matches(entry)).run();
    },

    async pendingRowKeys() {
      return new Set(
        db
          .select()
          .from(syncOutbox)
          .all()
          .map((row) => rowKey(row.tableName as SyncTableName, row.rowId)),
      );
    },

    async pendingCount() {
      return db.select().from(syncOutbox).all().length;
    },
  };
}

function matches(entry: OutboxEntry) {
  return and(
    eq(syncOutbox.tableName, entry.tableName),
    eq(syncOutbox.rowId, entry.rowId),
    eq(syncOutbox.rev, entry.rev),
  );
}

/** Synchronous core of `applyChanges`, exposed for the adapter's own tests. */
export function applyChangesSync(db: Database, changes: readonly ChangeRow[]): void {
  db.transaction((tx) => {
    const inner = tx as unknown as Database;
    setApplying(inner, 1);
    try {
      // Deferring FK checks to COMMIT covers a parent arriving in a later
      // page of the same cycle; the engine has already sorted parents first.
      inner.run(sql`PRAGMA defer_foreign_keys = ON`);
      for (const change of changes) applyOne(inner, change);
    } finally {
      setApplying(inner, 0);
    }
  });
}

export function readRowSync(
  db: Database,
  tableName: SyncTableName,
  rowId: string,
): LocalRowSnapshot | undefined {
  const table = SYNC_TABLES[tableName];
  const columns = columnsOf(table);
  const row = db.select().from(table).where(eq(columns.id!, rowId)).get() as
    Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    payload: toPayload(table, row),
    updatedAt: row.updatedAt as string,
    deletedAt: (row.deletedAt as string | null) ?? null,
  };
}

function setApplying(db: Database, value: 0 | 1): void {
  db.update(syncControl).set({ applying: value }).where(eq(syncControl.id, 0)).run();
}

/**
 * Returns the four client-only sync tables to a fresh install's state, so the
 * next sync pushes nothing stale and re-pulls from cursor 0. Run on a backup's
 * copy and on a restored database, never on the live one in use
 * (docs/specs/backup-sync-bookkeeping-spec.md).
 */
export function resetSyncBookkeeping(db: Database): void {
  db.transaction((tx) => {
    tx.delete(syncOutbox).run();
    tx.delete(syncState).run();
    tx.delete(photoQueue).run();
    // Written, never deleted: the outbox triggers read `applying` from row 0,
    // and with no row they stop queueing edits.
    tx.insert(syncControl)
      .values({ id: 0, applying: 0, lastRev: 0 })
      .onConflictDoUpdate({ target: syncControl.id, set: { applying: 0, lastRev: 0 } })
      .run();
  });
}

/** Drops every queued change and cursor — used when signing out. */
export function resetSyncState(db: Database): void {
  db.delete(syncOutbox).run();
  db.delete(syncState).run();
}
