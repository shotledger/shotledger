-- Canonical DDL mirror of backend/src/db/photo-migrations.ts (PHOTO_MIGRATIONS).
-- Not run by this task (never deploy; local/vitest pool only).

CREATE TABLE photos (
  photo_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_photos_user_id ON photos (user_id);

CREATE TABLE quota (
  user_id TEXT PRIMARY KEY,
  used_bytes INTEGER NOT NULL DEFAULT 0,
  limit_bytes INTEGER NOT NULL
);

CREATE TABLE rate_limit_windows (
  user_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
