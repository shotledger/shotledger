import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * One row per uploaded photo. `photoId` is the sole primary key (globally
 * unique, server-generated per docs/specs/backend-auth-photos-spec.md §5) so
 * GET/DELETE can look a photo up by id alone, then compare `userId` against
 * the requester (authz.ts) — see spec §5's documented 404-not-403 decision.
 */
export const photos = sqliteTable('photos', {
  photoId: text('photo_id').primaryKey(),
  userId: text('user_id').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  contentType: text('content_type').notNull(),
  createdAt: text('created_at').notNull(),
});

/** Per-user storage quota; lazily created on first upload (spec §5). */
export const quota = sqliteTable('quota', {
  userId: text('user_id').primaryKey(),
  usedBytes: integer('used_bytes').notNull().default(0),
  limitBytes: integer('limit_bytes').notNull(),
});

/**
 * Fixed-window upload rate limiter (spec §6b) — the D1 fallback used because
 * the Workers rate-limiting binding has no simulator in the vitest pool.
 */
export const rateLimitWindows = sqliteTable(
  'rate_limit_windows',
  {
    userId: text('user_id').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.windowStart] })],
);
