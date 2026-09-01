// Regenerate with `pnpm cf-typegen` (wrangler types) — hand-edited here
// since this task never runs wrangler against a real account.
/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  // Dev/test-only placeholder — production value is a `wrangler secret`,
  // never committed (docs/specs/backend-auth-photos-spec.md §2).
  BETTER_AUTH_SECRET: string;
}
