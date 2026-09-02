interface D1Migration {
  name: string;
  queries: string[];
}

/**
 * DDL for photos/quota/rate-limit tables (schema.ts: `photo-schema.ts`).
 * Mirror of `backend/migrations/0002_photos_init.sql`; keep in lock-step.
 */
export const PHOTO_MIGRATIONS: D1Migration[] = [
  {
    name: '0002_photos_init',
    queries: [
      `CREATE TABLE photos (
        photo_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_photos_user_id ON photos (user_id)`,
      `CREATE TABLE quota (
        user_id TEXT PRIMARY KEY,
        used_bytes INTEGER NOT NULL DEFAULT 0,
        limit_bytes INTEGER NOT NULL
      )`,
      `CREATE TABLE rate_limit_windows (
        user_id TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, window_start)
      )`,
    ],
  },
];
