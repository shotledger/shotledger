-- Canonical DDL mirror of backend/src/db/migrations.ts (SYNC_MIGRATIONS).
-- For `wrangler d1 migrations apply` once this backend is deployed — not
-- run by this task (never deploy; local/vitest pool only, per instructions).
-- Keep this file in lock-step with SYNC_MIGRATIONS.

CREATE TABLE sync_rows (
  user_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (user_id, table_name, row_id)
);

CREATE INDEX idx_sync_rows_user_table_seq ON sync_rows (user_id, table_name, seq);

CREATE TABLE sync_sequence (
  user_id TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sync_idempotency (
  user_id TEXT NOT NULL,
  client_change_id TEXT NOT NULL,
  status TEXT NOT NULL,
  seq INTEGER,
  reason TEXT,
  PRIMARY KEY (user_id, client_change_id)
);
