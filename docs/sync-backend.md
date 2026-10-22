# Sync backend overview

Cloudflare Worker (Hono) implementing the server side of the DIY
changelog sync protocol (ARCHITECTURE.md § Sync), plus the account (better-auth)
and photo (R2) layers on top of it. Full design rationale and the evidence-first
gauntlet results live in `docs/specs/sync-protocol-spec.md` +
`docs/specs/sync-protocol-evidence.md` (sync) and
`docs/specs/backend-auth-photos-spec.md` +
`docs/specs/backend-auth-photos-evidence.md` (auth/photos) — this file is a
short map of what lives where.

## Layout

```
shared/src/sync/
  protocol.ts     zod wire-protocol schemas, PROTOCOL_VERSION,
                  checkProtocolVersion() version handshake
  merge.ts        pure merge rules (tombstone-wins, LWW via server seq)
  index.ts        barrel

backend/src/
  auth.ts             Authenticator interface, betterAuthAuthenticator and the
                       devBearerAuthenticator stub the sync tests mount
  db/schema.ts        drizzle table defs (sync_rows, sync_sequence,
                       sync_idempotency) — generic per-table row storage
  db/migrations.ts     D1 migration DDL (mirrored in backend/migrations/)
  db/queries.ts        pull/push query + merge/idempotency logic
  routes/sync.ts        POST /sync/pull, POST /sync/push (Hono)
  index.ts               mounts /sync/* behind real better-auth

backend/migrations/0000_sync_init.sql   canonical DDL for `wrangler d1
                                         migrations apply` at deploy time
                                         (never run by this task)

backend/src/
  auth/better-auth.ts   createAuth(env) — betterAuth() + drizzleAdapter +
                         bearer() and passkey() plugins (email+password
                         and passkeys; no social provider)
  db/auth-schema.ts      drizzle schema for better-auth's user/session/
                          account/verification tables (CLI-generated, one
                          hand-patched field — see file header)
  db/photo-schema.ts      drizzle schema for photos/quota/rate_limit_windows
  db/photo-queries.ts      upload/delete quota-transactional D1 batch queries
  config.ts               MAX_PHOTO_BYTES / DEFAULT_QUOTA_BYTES /
                           RATE_LIMIT_MAX_UPLOADS / RATE_LIMIT_WINDOW_MS
                           (VERIFY: initial values, ARCHITECTURE.md § Sync)
  lib/quota.ts             pure quota math (old-coder scope)
  lib/rate-limit.ts        pure rate-limit math + RateLimiter interface
                            (old-coder scope)
  lib/rate-limiter-d1.ts   D1RateLimiter (tested) + WorkersBindingRateLimiter
                            (production switch, untestable in the vitest pool)
  lib/authz.ts             authorizeOwner — unified 404-not-403 ownership
                            check (old-coder scope)
  routes/photos.ts          POST /photos/upload/:photoId, GET/DELETE
                             /photos/:photoId, GET /photos/usage
  routes/account.ts         POST /account/delete (dryRun-capable GDPR cascade)

backend/migrations/0001_auth_init.sql    better-auth tables DDL
backend/migrations/0002_photos_init.sql  photos/quota/rate-limit tables DDL
```

## Key decisions

- **Generic per-table row storage**, not one D1 table per
  `docs/implementation-plan.md` §3 table — `sync_rows` keys on
  `(user_id, table_name, row_id)` and stores the row's current state as a
  JSON payload. See spec §5 for the full justification.
- **Server-assigned sequence number (`seq`)**, not client timestamps, is
  the sole ordering signal — both for merge conflict resolution
  (tombstone-wins + LWW) and for pull cursor pagination (spec §2a).
- **`/sync` runs behind real better-auth.** `backend/src/index.ts` mounts
  it with `betterAuthAuthenticator`, like `/photos`, `/account` and
  `/api/auth/*` (cut over in `feat/sync-app`, `docs/specs/sync-app-spec.md`
  §8). `backend/src/auth.ts`'s `devBearerAuthenticator` (bearer token = user
  id verbatim) survives only as `createSyncRoutes()`'s default, which is
  what `backend/test/sync.spec.ts` mounts for its bare-token fixtures —
  nothing reachable from the deployed Worker trusts a bearer string as a
  user id.
- **What syncs** is ARCHITECTURE.md § Sync; `SYNC_TABLE_NAMES` and
  `SYNCED_SETTING_KEYS` in `shared/src/sync/protocol.ts` are the lists.
- **Auth: better-auth on Workers + D1** via `@better-auth/drizzle-adapter`,
  email+password and passkeys. The `bearer()` plugin lets a mobile client send
  `Authorization: Bearer <sessionToken>` (from the `set-auth-token`
  response header on sign-up/sign-in) instead of relying on cookies. No
  client uses cookies: the Worker drops every `Set-Cookie` from `/api/auth`
  and ignores an incoming `Cookie` (`backend/src/lib/cookies.ts`). A sign-in
  with `rememberMe: false` (the web app's) lasts `WEB_SESSION_TTL_MS`, 12 h,
  and is never renewed; a phone's keeps better-auth's 7 days, renewed by use.
  Account deletion (`POST /account/delete`) is a hand-written cascade over
  `sync_rows`/`photos`/`quota`/`rate_limit_windows`/`session`/`account`/`user`, not
  `auth.api.deleteUser` (which gates on an email-verification flow this
  backend has no provider for) — see spec §3 and its Revisions entry.
- **Photos on R2**, keyed `${userId}/${photoId}`. Size cap, quota, and rate
  limit are all checked before the body is read, using the declared
  `Content-Length`; actual body size is re-checked after reading as
  defense in depth. Quota and the D1 fixed-window rate limiter are updated
  transactionally (D1 `batch`) alongside the photo row. Cross-user access
  to any photo id (GET/DELETE) returns `404`, never `403` — see spec §5's
  documented reasoning.

## Running it

- `pnpm exec vitest run shared/src/sync` — protocol + merge unit tests
  (part of the root `vitest run` / `pnpm check` already).
- `cd backend && pnpm test` — full protocol-cycle integration tests
  against a local D1 binding (`@cloudflare/vitest-plugin`). **Not** wired
  into root `pnpm check`, per the M0 decision to keep backend tests
  separate.
- `pnpm mutation` — Stryker, now including `shared/src/sync/*.ts` and
  `backend/src/lib/{quota,rate-limit,authz}.ts`.
- Never deploy from this task. The top level of `backend/wrangler.jsonc` is
  local/test-only: its `d1_databases` and `r2_buckets` use placeholder ids,
  and `vars.ENVIRONMENT` is `development`, where `createAuth` falls back to
  its built-in `DEV_SECRET` and the Worker answers local hosts only; no
  secret is in the config. The deployed envs,
  `env.staging` and `env.production`, carry `REPLACE_ME` placeholders for
  the maintainer to fill, set `ENVIRONMENT`, `BETTER_AUTH_URL` and
  `BETTER_AUTH_TRUSTED_ORIGINS` as `vars`, and require `BETTER_AUTH_SECRET`
  as a `wrangler secret`. Outside `development`, `createAuth` throws
  `AuthConfigError` on a missing, short (under 32 characters) or dev secret
  and on a `BETTER_AUTH_URL` that is missing, not `https:` or the
  `.invalid` placeholder, and better-auth's rate limiter is on, keyed by
  `CF-Connecting-IP`, stored in D1 (`rate_limit`), counting real endpoints
  only, and purged by the env's cron trigger. The same cron deletes expired
  `session` and `verification` rows, so a sign-in's IP address and user
  agent go when the sign-in does, and ended photo upload windows
  (`rate_limit_windows`). The deploy steps are in `docs/release.md`.
- Photo uploads accept `image/jpeg`, `image/png` and `image/webp` only
  (`415 unsupported_media_type` otherwise); a photo is served with
  `Content-Security-Policy: default-src 'none'; sandbox`.
