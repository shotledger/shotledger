import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Generic per-table row storage — one D1 schema for every syncable table,
 * rather than one mirrored table per docs/implementation-plan.md §3 table.
 * Rationale: docs/specs/sync-protocol-spec.md §5.
 */
export const syncRows = sqliteTable(
  'sync_rows',
  {
    userId: text('user_id').notNull(),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    seq: integer('seq').notNull(),
    payload: text('payload'), // JSON string; null iff deletedAt is set
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tableName, t.rowId] }),
    index('idx_sync_rows_user_table_seq').on(t.userId, t.tableName, t.seq),
  ],
);

/** Per-user monotonic sequence counter — the sole source of ordering. */
export const syncSequence = sqliteTable('sync_sequence', {
  userId: text('user_id').primaryKey(),
  lastSeq: integer('last_seq').notNull().default(0),
});

/** Push idempotency: (user, clientChangeId) -> the outcome already recorded. */
export const syncIdempotency = sqliteTable(
  'sync_idempotency',
  {
    userId: text('user_id').notNull(),
    clientChangeId: text('client_change_id').notNull(),
    status: text('status').notNull(), // 'applied' | 'rejected'
    seq: integer('seq'), // null when rejected
    reason: text('reason'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clientChangeId] })],
);
