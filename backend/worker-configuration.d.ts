// Regenerate with `pnpm cf-typegen` (wrangler types) — hand-edited here
// since this task never runs wrangler against a real account.
/// <reference types="@cloudflare/workers-types" />

// Same shape `wrangler types` emits: `cloudflare:test`'s `env` is typed as
// `Cloudflare.Env`, the Worker's handlers use the global `Env`.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PHOTOS: R2Bucket;
    ENVIRONMENT: 'development' | 'staging' | 'production';
    // Set in the deployed envs only (backend/wrangler.jsonc): the secret is a
    // `wrangler secret`, never committed (docs/specs/backend-auth-photos-spec.md §2).
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_TRUSTED_ORIGINS?: string;
    // Optional: the passkey rp id when it is not BETTER_AUTH_URL's host (#681).
    PASSKEY_RP_ID?: string;
    // Optional: the app's signing-certificate SHA-256 fingerprints and the
    // Apple Team ID, for passkeys in the phone app (src/lib/app-association.ts).
    ANDROID_SIGNING_CERT_SHA256?: string;
    APPLE_TEAM_ID?: string;
  }
}
interface Env extends Cloudflare.Env {}
