import { RATE_LIMIT_LONGEST_WINDOW_MS } from '../auth/better-auth';

/**
 * Deletes better-auth rate-limit rows whose window has passed. better-auth
 * prunes only when some key's window resets, so rows from one-off clients
 * would otherwise stay. Run by the Worker's cron (wrangler.jsonc `triggers`).
 */
export async function purgeStaleAuthRateLimits(db: D1Database, nowMs: number): Promise<number> {
  const result = await db
    .prepare('DELETE FROM rate_limit WHERE last_request < ?')
    .bind(nowMs - RATE_LIMIT_LONGEST_WINDOW_MS)
    .run();
  return result.meta.changes;
}
