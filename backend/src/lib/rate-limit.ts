/**
 * Pure rate-limit math — old-coder scope, docs/specs/backend-auth-photos-spec.md
 * §6b. `RateLimiter` implementations (D1-backed, Workers-binding) live in
 * `backend/src/lib/rate-limiter-d1.ts` — split out of this file so the
 * mutation gauntlet (root `vitest.config.ts`, Node pool) only ever mutates
 * code a Node-run test can cover; the D1 implementation needs the Workers
 * vitest pool and is exercised by `backend/test/photos.spec.ts` instead.
 */

/** Start (inclusive) of the fixed window containing `nowMs`. */
export function windowStart(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

/** A fixed-window counter is within limit strictly below the max — the Nth request is the last allowed. */
export function isWithinLimit(countInWindow: number, maxPerWindow: number): boolean {
  return countInWindow < maxPerWindow;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  consume(userId: string, nowMs: number): Promise<RateLimitResult>;
}
