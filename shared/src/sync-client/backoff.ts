/**
 * Retry backoff for failed sync cycles (docs/specs/sync-app-spec.md §7).
 *
 * Deterministic, no jitter: one device per user means there is no
 * thundering herd to spread out, and a deterministic schedule is worth more
 * in tests than randomness is in production here.
 */

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 300_000;

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
}

/** `min(base * 2^attempt, max)`; attempt 0 is exactly `base`. */
export function nextBackoffMs(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? BACKOFF_BASE_MS;
  const maxMs = options.maxMs ?? BACKOFF_MAX_MS;
  const safeAttempt = attempt < 0 ? 0 : attempt;
  // 2 ** 1024 is Infinity, and Infinity * base is Infinity — Math.min still
  // clamps to maxMs, so a runaway attempt counter cannot produce NaN.
  const grown = baseMs * 2 ** safeAttempt;
  return Math.min(grown, maxMs);
}

/**
 * Sync failure kinds the UI distinguishes. `unauthenticated` is terminal —
 * retrying a dead session forever burns battery for nothing; the controller
 * clears the token and asks the user to sign in again.
 */
export type SyncErrorKey = 'network' | 'unauthenticated' | 'versionUnsupported' | 'unknown';

export function shouldRetry(errorKey: SyncErrorKey): boolean {
  return errorKey !== 'unauthenticated';
}
