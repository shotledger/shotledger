import { AUTH_MIGRATIONS } from './auth-migrations';
import { PHOTO_MIGRATIONS } from './photo-migrations';

/**
 * Shape expected by `applyD1Migrations` from `cloudflare:test` (test-only
 * module — not imported here to keep this file buildable by the
 * production `tsc -b` project, which has no `cloudflare:test` types).
 */
interface D1Migration {
  name: string;
  queries: string[];
}

/**
 * Canonical DDL for the sync backend's D1 tables (schema.ts is the typed
 * query-building mirror of this). Kept as a TS array — rather than reading
 * `migrations/0000_sync_init.sql` at runtime — because the Workers test
 * runtime has no filesystem access; `applyD1Migrations` (from
 * `cloudflare:test`) takes exactly this shape. The `.sql` file under
 * `backend/migrations/` is the copy `wrangler d1 migrations apply` will use
 * once this backend is actually deployed (out of scope for this task) and
 * must be kept in lock-step with the statements below
 * (test/migrations-drift.spec.ts checks it).
 */
export const SYNC_MIGRATIONS: D1Migration[] = [
  {
    name: '0000_sync_init',
    queries: [
      `CREATE TABLE sync_rows (
        user_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        payload TEXT CHECK (json_valid(payload) OR payload IS NULL),
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        PRIMARY KEY (user_id, table_name, row_id)
      )`,
      `CREATE INDEX idx_sync_rows_user_table_seq ON sync_rows (user_id, table_name, seq)`,
      `CREATE TABLE sync_sequence (
        user_id TEXT PRIMARY KEY,
        last_seq INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE sync_idempotency (
        user_id TEXT NOT NULL,
        client_change_id TEXT NOT NULL,
        status TEXT NOT NULL,
        seq INTEGER,
        reason TEXT,
        PRIMARY KEY (user_id, client_change_id)
      )`,
    ],
  },
];

/** All migrations in dependency order — sync, then auth, then photos (photos has no FK on auth, order is documentation-only). */
export const ALL_MIGRATIONS: D1Migration[] = [
  ...SYNC_MIGRATIONS,
  ...AUTH_MIGRATIONS,
  ...PHOTO_MIGRATIONS,
];
