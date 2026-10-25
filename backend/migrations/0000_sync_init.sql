-- Canonical DDL mirror of backend/src/db/migrations.ts (SYNC_MIGRATIONS).
-- For `wrangler d1 migrations apply` once this backend is deployed — not
-- run by this task (never deploy; local/vitest pool only, per instructions).
-- Keep this file in lock-step with SYNC_MIGRATIONS.

CREATE TABLE sync_rows (
  user_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload TEXT CHECK (json_valid(payload) OR payload IS NULL),
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  arrival_rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, table_name, row_id)
);

CREATE INDEX idx_sync_rows_user_table_seq ON sync_rows (user_id, table_name, seq);

CREATE TABLE sync_sequence (
  user_id TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0,
  state_rev INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sync_idempotency (
  user_id TEXT NOT NULL,
  client_change_id TEXT NOT NULL,
  status TEXT NOT NULL,
  seq INTEGER,
  reason TEXT,
  arrival_rev INTEGER NOT NULL,
  blocker_table TEXT,
  blocker_row_id TEXT,
  PRIMARY KEY (user_id, client_change_id)
);

-- One row per refused row (docs/specs/sync-family-refusal-spec.md §11.3): a
-- bad row (invalid_payload) blocks its family; a waiting row (family_refused)
-- holds the payload the server applies when its family is released.
CREATE TABLE sync_refusals (
  user_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('invalid_payload', 'family_refused')),
  parent_table TEXT,
  parent_row_id TEXT,
  payload TEXT CHECK (json_valid(payload)),
  updated_at TEXT,
  arrival INTEGER NOT NULL,
  blocker_table TEXT,
  blocker_row_id TEXT,
  refused_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, table_name, row_id),
  CHECK ((reason = 'family_refused') = (payload IS NOT NULL)),
  CHECK ((payload IS NULL) = (updated_at IS NULL))
);
