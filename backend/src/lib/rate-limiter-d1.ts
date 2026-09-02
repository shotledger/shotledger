import { and, eq, sql } from 'drizzle-orm';

import { RATE_LIMIT_MAX_UPLOADS, RATE_LIMIT_WINDOW_MS } from '../config';
import { rateLimitWindows } from '../db/photo-schema';
import type { Db } from '../db/queries';
import { isWithinLimit, windowStart, type RateLimiter, type RateLimitResult } from './rate-limit';

/**
 * D1 fallback fixed-window limiter (spec §6b) — used because the Workers
 * rate-limiting binding has no simulator in `@cloudflare/vitest-plugin`'s
 * Workers pool (checked: `node_modules/@cloudflare/vitest-plugin` simulates
 * D1/R2/KV/DO, not `unstable_ratelimit`). Every call — including one that
 * ends up rejected — increments the window counter: a client cannot bypass
 * the limit for free by retrying a rejected upload.
 */
export class D1RateLimiter implements RateLimiter {
  constructor(private readonly db: Db) {}

  async consume(userId: string, nowMs: number): Promise<RateLimitResult> {
    const bucket = windowStart(nowMs, RATE_LIMIT_WINDOW_MS);

    const result = await this.db.run(sql`
      INSERT INTO rate_limit_windows (user_id, window_start, count)
      VALUES (${userId}, ${bucket}, 1)
      ON CONFLICT(user_id, window_start) DO UPDATE SET count = count + 1
      RETURNING count
    `);
    const rows = result.results as Array<{ count: number }>;
    const row = rows[0];
    if (!row) throw new Error('D1RateLimiter.consume: RETURNING produced no row');

    const countBeforeThisRequest = row.count - 1;
    const allowed = isWithinLimit(countBeforeThisRequest, RATE_LIMIT_MAX_UPLOADS);
    return {
      allowed,
      remaining: Math.max(0, RATE_LIMIT_MAX_UPLOADS - row.count),
      resetAt: bucket + RATE_LIMIT_WINDOW_MS,
    };
  }
}

/**
 * Production switch (spec §9): wraps the Workers rate-limiting binding.
 * Not exercised by the test suite — the binding cannot be constructed in
 * the vitest pool. Manual smoke test against `wrangler dev` is required
 * before this replaces `D1RateLimiter` in `index.ts`.
 */
export class WorkersBindingRateLimiter implements RateLimiter {
  constructor(
    private readonly binding: { limit(options: { key: string }): Promise<{ success: boolean }> },
  ) {}

  async consume(userId: string, nowMs: number): Promise<RateLimitResult> {
    const { success } = await this.binding.limit({ key: userId });
    // The binding does not expose remaining/resetAt; callers on this path
    // must not depend on those fields being meaningful.
    return { allowed: success, remaining: success ? 1 : 0, resetAt: nowMs + RATE_LIMIT_WINDOW_MS };
  }
}

/** Row shape read for `GET /photos/usage` and similar — not itself a RateLimiter method. */
export async function currentWindowCount(db: Db, userId: string, nowMs: number): Promise<number> {
  const bucket = windowStart(nowMs, RATE_LIMIT_WINDOW_MS);
  const rows = await db
    .select()
    .from(rateLimitWindows)
    .where(and(eq(rateLimitWindows.userId, userId), eq(rateLimitWindows.windowStart, bucket)))
    .limit(1);
  return rows[0]?.count ?? 0;
}
