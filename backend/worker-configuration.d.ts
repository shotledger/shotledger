// Regenerate with `pnpm cf-typegen` (wrangler types) — hand-edited here
// since this task never runs wrangler against a real account.
/// <reference types="@cloudflare/workers-types" />

// Same shape `wrangler types` emits: `cloudflare:test`'s `env` is typed as
// `Cloudflare.Env`, the Worker's handlers use the global `Env`.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PHOTOS: R2Bucket;
    // Dev/test-only placeholder — production value is a `wrangler secret`,
    // never committed (docs/specs/backend-auth-photos-spec.md §2).
    BETTER_AUTH_SECRET: string;
    ENVIRONMENT: 'development' | 'staging' | 'production';
    // Set in the deployed envs only (backend/wrangler.jsonc).
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_TRUSTED_ORIGINS?: string;
  }
}
interface Env extends Cloudflare.Env {}
