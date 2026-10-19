import { RATE_LIMIT_WINDOW_MS } from '../config';

/**
 * Deletes records that no request can use any more, so the IP address and
 * user agent on a sign-in do not outlive it (the privacy policy's retention
 * section, #875). better-auth rejects an expired session or verification
 * itself but never deletes the row, and the photo upload limiter only ever
 * reads the current window. Run by the Worker's cron (wrangler.jsonc
 * `triggers`).
 */
export async function purgeExpiredRecords(
  db: D1Database,
  nowMs: number,
): Promise<{ sessions: number; verifications: number; uploadWindows: number }> {
  const [sessions, verifications, uploadWindows] = await db.batch([
    db.prepare('DELETE FROM session WHERE expires_at < ?').bind(nowMs),
    db.prepare('DELETE FROM verification WHERE expires_at < ?').bind(nowMs),
    db
      .prepare('DELETE FROM rate_limit_windows WHERE window_start <= ?')
      .bind(nowMs - RATE_LIMIT_WINDOW_MS),
  ]);
  return {
    sessions: sessions!.meta.changes,
    verifications: verifications!.meta.changes,
    uploadWindows: uploadWindows!.meta.changes,
  };
}
