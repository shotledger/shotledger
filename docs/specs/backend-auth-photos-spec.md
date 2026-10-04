# Backend auth + photos — executable specification

> Old-coder SPEC artifact for the ShotLedger account + photo layer (ADR 0003).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/backend-auth-photos-spec.md`
> Evidence report: `docs/specs/backend-auth-photos-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** The maintainer did not
> review this spec before implementation. Confidence claims in the evidence
> report are bounded accordingly.

Tier: **3** (auth is account takeover / cross-user data exposure; quota and
rate-limit math gates real money — R2 storage and D1 row cost — and a bug in
either fails either open, denying paying nobody but costing the maintainer, or
closed, corrupting a user's account deletion or photo library).

Scope of the old-coder loop (per task instructions — "mandatory for
quota/rate-limit/authorization logic"): `backend/src/lib/quota.ts`,
`backend/src/lib/rate-limit.ts`, `backend/src/lib/authz.ts` — pure functions,
full mutation + property testing. The Hono route wiring, better-auth
config/schema, and R2/D1 plumbing around them are exercised by the
integration test suite (Workers vitest pool) but are not independently
mutation-tested, matching the precedent set by `sync-protocol-spec.md` §"Tier
3" scope note for route wiring vs. pure merge logic.

## 0. Setup plan

- **Isolation:** working directly on `feat/backend-auth-photos`, branched from
  `origin/feat/sync-backend` in this dedicated worktree (already isolated at
  the task level — no nested worktree needed).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths
  staged (never `-A`/`.`), branch pushed, no PR opened, `main` untouched.
- **New runtime dependencies** (all in `backend/package.json` — task
  instructions explicitly authorize better-auth):
  - `better-auth@^1.7.2` — the auth library the task specifies.
  - `@better-auth/drizzle-adapter@^1.7.2` — task instructions specify
    "drizzle adapter" explicitly; matches the drizzle-orm version already
    pinned in `backend/`.
  - No new dependency for photos/quota/rate-limit — R2 is a Workers binding
    (no package), D1 access reuses the existing `drizzle-orm` dependency.
- **No new dev tooling.** Reuses the root Stryker/vitest-coverage setup.
  `backend/src/lib/{quota,rate-limit,authz}.ts` are added to
  `vitest.config.ts` coverage `include` and `stryker.config.json` `mutate`
  globs (new backend-scoped entries — the existing globs are
  `shared/src/**` only). `backend/**` tests are NOT added to the root
  `vitest.config.ts` `test.include` (that already lists `backend/**/*.test.ts`
  glob but the actual backend test files are `backend/test/*.spec.ts` — see
  N-clause below; root `pnpm check` must not gain a new failure mode tied to
  the Workers pool, which needs `wrangler`/`workerd` and is not part of the
  root Node vitest project).
- **Files the gauntlet adds, by path:**
  - `backend/src/auth/better-auth.ts` (auth instance factory)
  - `backend/src/db/auth-schema.ts` (drizzle schema: user/session/account/verification)
  - `backend/src/db/photo-schema.ts` (drizzle schema: photos, quota, rate_limit_windows)
  - `backend/src/db/auth-migrations.ts`, `backend/src/db/photo-migrations.ts`
  - `backend/migrations/0001_auth_init.sql`, `backend/migrations/0002_photos_init.sql`
  - `backend/src/config.ts` (quota/size-cap/rate-limit constants)
  - `backend/src/lib/quota.ts`, `backend/src/lib/rate-limit.ts`, `backend/src/lib/authz.ts`
  - `backend/src/lib/rate-limiter-d1.ts` (D1/binding `RateLimiter`
    implementations — split out of `rate-limit.ts` per §6b so the mutation
    gauntlet, which runs on the root Node vitest pool, never mutates code
    only the Workers pool can execute)
  - `backend/src/db/photo-queries.ts`
  - `backend/src/lib/quota.test.ts`, `backend/src/lib/rate-limit.test.ts`, `backend/src/lib/authz.test.ts`
  - `backend/src/routes/photos.ts`, `backend/src/routes/account.ts`
  - `backend/src/auth.ts` (edit: add `betterAuthAuthenticator`)
  - `backend/src/index.ts` (edit: wire `/api/auth/*`, `/photos`, `/account`)
  - `backend/test/photos.spec.ts`, `backend/test/account.spec.ts`
  - `backend/wrangler.jsonc` (edit: add R2 binding placeholder, `BETTER_AUTH_SECRET` dev var)
  - `backend/package.json`, `vitest.config.ts`, `stryker.config.json` (edits)
  - `docs/sync-backend.md` (edit: document the new endpoints)

## 1. better-auth schema decision

`@better-auth/drizzle-adapter`'s expected schema is generated, not
hand-guessed: `npx @better-auth/cli@1.7.2 generate` is run once against a
draft `betterAuth()` config (email+password + `bearer()` plugin only, no
social providers) to produce the canonical drizzle sqlite schema, which is
then copied into `backend/src/db/auth-schema.ts` and hand-mirrored into the
`0001_auth_init.sql` migration (same pattern as `SYNC_MIGRATIONS` /
`0000_sync_init.sql`). This avoids drifting from what the adapter actually
expects (field names, indexes, `onDelete` behavior).

## 2. better-auth configuration (`backend/src/auth/better-auth.ts`)

- `createAuth(env: Env)` returns a `betterAuth()` instance configured with:
  - `database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema: authSchema })`
  - `secret: env.BETTER_AUTH_SECRET` (dev-only placeholder value in
    `wrangler.jsonc`'s `vars`; **VERIFY**: production secret must be
    provisioned by the maintainer via `wrangler secret put
BETTER_AUTH_SECRET` — never committed, lives under `~/cloud/agents/secrets/shotledger/`
    per CLAUDE.md).
  - `emailAndPassword: { enabled: true }`.
  - `plugins: [bearer()]` — the sync/photo protocol is a mobile app, not a
    browser with cookies; bearer lets a client send `Authorization: Bearer
<sessionToken>` exactly like the existing dev stub's header shape, so the
    `Authenticator` interface (`backend/src/auth.ts`) needs no change to its
    signature.
  - **Social sign-in: flagged TODO, not implemented.** Needs real OAuth app
    registrations (Google/Apple client IDs + secrets) only the maintainer can
    create. `plugins` array has a comment marking where `socialProviders`
    would go.
- `backend/src/auth.ts` gains `betterAuthAuthenticator(auth: Auth):
Authenticator`, calling `auth.api.getSession({ headers: request.headers })`
  and returning `session?.user.id ?? null`. The existing `devBearerAuthenticator`
  and its `// TODO(better-auth)` comment are **kept, not deleted** —
  `backend/src/routes/sync.ts` keeps using it as `createSyncRoutes()`'s
  default so the existing 14 `sync.spec.ts` tests (which authenticate with
  bare tokens as user ids) are untouched, per task instruction #5. **Flagged
  deviation for the maintainer:** full auth cutover for `/sync` (switching its
  default authenticator to `betterAuthAuthenticator`) is out of scope here
  because it would require rewriting `sync.spec.ts`'s fixtures around real
  session tokens — a decision to make deliberately, not as a side effect of
  this task. `/photos`, `/account`, and `/api/auth/*` all use real
  `betterAuthAuthenticator` from day one (new surface, no legacy tests to
  preserve).
- `backend/src/index.ts` adds `app.on(['POST', 'GET'], '/api/auth/*', (c) =>
createAuth(c.env).handler(c.req.raw))` — better-auth's own handler serves
  sign-up/sign-in/sign-out/session endpoints directly; no hand-written
  password-check route is written (that would duplicate better-auth's own
  hashing/session logic and is exactly the risk the library exists to avoid).

## 3. Account deletion (`backend/src/routes/account.ts`)

- `POST /account/delete` — authenticated (`betterAuthAuthenticator`).
  Optional JSON body `{ dryRun?: boolean }`, default `false`.
  - Always computes, in one D1 transaction-equivalent (`db.batch`, since D1
    has no interactive transactions — matches the R3 constraint already
    documented for `applyPushChange`): counts of `sync_rows` rows, `photos`
    rows, `quota` row, and their better-auth `session`/`account` rows for
    `userId`.
  - `dryRun: true` — returns the counts, **deletes nothing**. Testable
    without destructive side effects (task instruction: "dry-run/testable").
  - `dryRun: false` — deletes, in one D1 `batch`: R2 objects for every
    `photos` row first (best-effort, outside the batch — a missing R2
    object does not abort the rest; an already-partially-deleted account
    must still finish), then `photos`/`sync_rows`/`sync_sequence`/
    `sync_idempotency`/`quota` rows, then the better-auth `session`/
    `account`/`user` rows, all `WHERE user_id = ?` (`user` by `id`).
    **Revised from the original draft** (see `## Revisions`): rather than
    calling `auth.api.deleteUser` for the `user` row, `session`/`account`/
    `user` are deleted directly via drizzle in the same batch as the
    sync/photo/quota rows — `auth.api.deleteUser` gates on an email
    verification flow this backend has no email provider to complete, so
    using it would make self-service account deletion unreachable in this
    milestone. A hand-written cascade was always required for
    `sync_rows`/`photos`/`quota` regardless (better-auth has no knowledge
    of those tables); this just extends the same cascade over
    `session`/`account`/`user` too, one mechanism instead of two.
    Returns the same counts as `dryRun`.
  - This is the GDPR path (task instruction #1). No soft-delete: the ADR's
    "nothing is deleted server-side without user action" is satisfied because
    this endpoint IS the user action.

## 4. Config constants (`backend/src/config.ts`)

```ts
// VERIFY: initial values per docs/adr/0003-diy-changelog-sync.md "Photo
// policy" section — maintainer-approved starting point, not derived from
// measurement. Revisit if real usage data contradicts them.
export const MAX_PHOTO_BYTES = 1_500_000; // ADR: "max object size (~1.5 MB)"
export const DEFAULT_QUOTA_BYTES = 1_073_741_824; // ADR: "per-user storage quota (initial: 1 GB)"
export const RATE_LIMIT_MAX_UPLOADS = 60; // ADR: "upload rate limit (initial: 60/hour ...)"
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // ADR: "... via the Workers rate-limiting binding"
```

## 5. Photo endpoints (`backend/src/routes/photos.ts`)

All behind `betterAuthAuthenticator`. R2 binding `PHOTOS` (placeholder id,
never deployed — mirrors `wrangler.jsonc`'s existing D1 placeholder pattern).
Object key: `${userId}/${photoId}` (photoId is a server-generated UUID, never
client-supplied, so a user cannot guess/collide another user's key).

- **`POST /photos/upload/:photoId`** (photoId pre-generated client-side per
  the sync protocol's own row-id convention — matches how `shots`/`sessions`
  already carry client-generated UUIDv7 ids; the photo blob is a side-channel
  keyed the same way a synced row would reference it):
  1. **Before reading the body**: reject if `Content-Length` header is
     missing or absent (`411 Length Required`) or exceeds `MAX_PHOTO_BYTES`
     (`413 Payload Too Large`, body `{ error: 'photo_too_large' }`) — task
     instruction: "enforce size cap ... BEFORE accepting bytes".
     Then, if a `photos` row for `photoId` exists, `authorizeOwner` on it —
     `404 { error: 'not_found' }` when it belongs to someone else, the same
     answer `GET`/`DELETE` give, so an upload cannot overwrite another
     user's row or reveal that the id is taken.
  2. Rate limit check (`RateLimiter.consume`) — `429 Too Many Requests` +
     `Retry-After` header on failure, body `{ error: 'rate_limited' }`.
  3. Quota check (`checkQuota(current.usedBytes, current.limitBytes,
declaredContentLength)`) — `413 Payload Too Large`, body `{ error:
'quota_exceeded' }` on failure. (413 chosen over 402/403: the failure reason
     is "this object doesn't fit", same family as the size-cap rejection, and
     avoids implying a payment-required semantic the app doesn't have.
     Documented here per task instruction to "pick and document".)
  4. Read the body (`request.arrayBuffer()`); if actual byte length
     disagrees with `Content-Length` or exceeds `MAX_PHOTO_BYTES`, reject
     `413` (defense in depth against a lying header) **without** having
     consumed quota/rate-limit yet (those were pre-checks against the
     declared size; step 6 is the only place actual usage is committed).
  5. Write to R2 at `${userId}/${photoId}`.
  6. In one D1 `batch`: upsert `photos` row (`user_id, photo_id, size_bytes,
content_type, created_at`) and update `quota.used_bytes += size_bytes`
     (insert quota row with `DEFAULT_QUOTA_BYTES` limit if none exists yet).
     If a `photos` row for `(userId, photoId)` already exists (re-upload of
     same id), this is an update: the old size is subtracted before the new
     size is added, so quota reflects a replace, not an accumulation.
  7. `201 { photoId, sizeBytes, usage: { usedBytes, limitBytes } }`.
- **`GET /photos/:photoId`** — look up the `photos` row by `photoId` only
  (not scoped by user in the query, matching the authz-decision below);
  `authorizeOwner(row?.userId, requesterId)` — `404` (not `403`) whether the
  row doesn't exist or belongs to someone else, body `{ error: 'not_found'
}`. **Documented authz decision** (task instruction: "pick and document"):
  **404, not 403, for every cross-user resource access** across photos and
  account routes — a 403 confirms the resource exists and is owned by
  someone, leaking existence to a party with no right to know; 404 leaks
  nothing beyond "you cannot get this", which is true in both the
  not-mine and doesn't-exist cases. On success, stream the R2 object with
  its stored `content-type`.
- **`DELETE /photos/:photoId`** — same `authorizeOwner` → `404` rule. On
  success: delete the R2 object, then in one D1 `batch` delete the `photos`
  row and subtract its `size_bytes` from `quota.used_bytes` (clamped at 0 —
  see `applyQuotaDelta` in §6). `204 No Content`.
- **`GET /photos/usage`** — `200 { usedBytes, limitBytes, remainingBytes }`;
  a user with no quota row yet reads as `{ 0, DEFAULT_QUOTA_BYTES,
DEFAULT_QUOTA_BYTES }` (lazy-initialized, no row written until first
  upload).

## 6. Pure logic modules (old-coder-scoped)

### 6a. `backend/src/lib/quota.ts`

```ts
export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'quota_exceeded';
}
export function checkQuota(
  usedBytes: number,
  limitBytes: number,
  incomingBytes: number,
): QuotaCheckResult;
export function applyQuotaDelta(usedBytes: number, deltaBytes: number): number;
```

- `checkQuota`: `allowed: usedBytes + incomingBytes <= limitBytes`. Equal-to-limit
  is allowed (a quota of exactly N bytes admits an upload that lands exactly
  at N) — boundary is inclusive, tested explicitly (edge case, not "handles
  bad input").
- `applyQuotaDelta`: `Math.max(0, usedBytes + deltaBytes)` — a delete's
  negative delta can never drive `usedBytes` below 0, even if usage bookkeeping
  ever drifted (defensive floor; the ADR gives no case where this should be
  possible, but a `-100` result is a worse bug than a clamped `0`).

### 6b. `backend/src/lib/rate-limit.ts`

```ts
export function windowStart(nowMs: number, windowMs: number): number; // floor(nowMs / windowMs) * windowMs
export function isWithinLimit(countInWindow: number, maxPerWindow: number): boolean; // countInWindow < maxPerWindow

export interface RateLimiter {
  consume(
    userId: string,
    nowMs: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
}
```

- `windowStart`/`isWithinLimit` are the pure, mutation-tested core.
- `D1RateLimiter` (not pure — wraps D1, integration-tested only) implements
  `RateLimiter` using a fixed-window counter in `rate_limit_windows(user_id,
window_start, count)`: `consume` computes `windowStart(nowMs,
RATE_LIMIT_WINDOW_MS)`, upserts `(user_id, window_start)` incrementing
  `count`, and derives `allowed` from the row's count **before** commit vs.
  `RATE_LIMIT_MAX_UPLOADS` (the D1 upsert always writes the attempt — even a
  rejected one counts towards the window, standard fixed-window semantics, so
  a client cannot bypass the limit by retrying rejected requests for free).
  Old rows (`window_start` < current window minus a few windows) are not
  actively pruned by this task (documented limit, §9) — D1 storage growth
  from this table is small (one row per user per hour with any upload
  activity) and out of scope for a first cut.
- **Why D1, not the Workers rate-limiting binding**: the binding
  (`unstable_ratelimit` / `rate_limit` in `wrangler.jsonc`) has no simulator
  in `@cloudflare/vitest-plugin`'s Workers pool as of the versions pinned
  here — confirmed by grepping `node_modules/@cloudflare/vitest-plugin` for
  binding support and finding D1/R2/KV/DO simulation but no rate-limiting
  entry. Per task instruction #3 ("choose what's testable"), the D1 fallback
  is the one actually wired; `WorkersBindingRateLimiter` is written as a
  second `RateLimiter` implementation (§9) documented as the production
  switch but not exercised by the test suite (its constructor is a one-line
  wrapper with nothing pure to unit-test without the binding present).

### 6c. `backend/src/lib/authz.ts`

```ts
export type OwnershipResult = 'ok' | 'not_found';
export function authorizeOwner(
  resourceOwnerId: string | undefined | null,
  requesterId: string,
): OwnershipResult;
```

- `'ok'` iff `resourceOwnerId === requesterId`; `'not_found'` for
  `undefined`/`null` (resource doesn't exist) AND for a mismatched owner
  (belongs to someone else) — the single unified path documented in §5.

## 7. Test plan / gauntlet scope

`backend/src/lib/{quota,rate-limit,authz}.test.ts` — Tier-3 loop: full
coverage + mutation (`pnpm mutation` extended to these globs) + fast-check
properties:

- Quota property: for all `usedBytes, limitBytes, incomingBytes >= 0`,
  `checkQuota(...).allowed === (usedBytes + incomingBytes <= limitBytes)`
  (round-trips the spec definition itself — still valuable as a mutation
  killer against off-by-one/`<`-vs-`<=` mutants).
  `applyQuotaDelta` property: result is always `>= 0` for any inputs
  (including large negative deltas) — the fail-closed floor, paired per the
  Tier-3 mutation-caveat note (a one-sided "never negative" invariant is
  paired with an explicit unit test that a normal decrement actually
  decrements, so a mutant that always returns 0 is still caught).
- Rate-limit property: for all `nowMs >= 0, windowMs > 0`,
  `windowStart(nowMs, windowMs) <= nowMs` and `windowStart` is idempotent
  under re-application to its own output... (bounded fast-check domain,
  `windowMs` excludes 0). `isWithinLimit` property: `isWithinLimit(count,
max)` is `false` for all `count >= max` and `true` for all `0 <= count <
max` (exhaustive over a bounded integer range via fast-check, both
  directions per the mutation-caveat pairing note).
- Authz property: `authorizeOwner(id, id)` is `'ok'` for all non-empty string
  `id`; `authorizeOwner(a, b)` is `'not_found'` for all `a !== b` including
  `a` empty/undefined/null.

`backend/test/photos.spec.ts` (Workers vitest pool, R2 + D1 simulated) — one
`it` per behavior:

- P1 upload without `Content-Length` → `411`.
- P2 upload with `Content-Length` > `MAX_PHOTO_BYTES` → `413
photo_too_large`, R2 object not written (assert via a follow-up GET →
  `404`).
- P3 upload whose actual body exceeds the declared `Content-Length` → `413`
  (defense-in-depth path), nothing written.
- P4 upload succeeds → `201`, subsequent `GET /photos/usage` reflects the new
  `usedBytes`.
- P5 upload when `usedBytes + Content-Length > limitBytes` → `413
quota_exceeded`, quota unchanged, R2 object not written.
- P6 61st upload within the same rolling hour (after 60 successful uploads of
  a tiny payload) → `429`, quota/rate-limit state from the first 60 uploads
  intact; a 61st upload one window later succeeds.
- P7 `GET /photos/:photoId` as the owner → `200` with the correct bytes.
- P8 `GET /photos/:photoId` as a different authenticated user → `404`.
- P9 `GET /photos/:photoId` for a photoId that was never uploaded → `404`
  (same status as P8 — assert the two response bodies are indistinguishable
  in shape).
- P10 `DELETE /photos/:photoId` as owner → `204`, quota decreases by exactly
  the deleted photo's size, a subsequent `GET` on it is `404`.
- P11 `DELETE /photos/:photoId` as a non-owner → `404`, the photo is
  unaffected (owner's subsequent `GET` still `200`).
- P12 re-upload to the same `photoId` (replace) → quota reflects only the
  net size difference, not the sum of both uploads.
- P13 upload to a `photoId` another user owns → `404 not_found`; the owner's
  bytes, size, content type and usage are unchanged, the uploader's usage is
  `0`.
- Every `/photos` route answers `401` to no token, a forged token, and a
  user id sent as the token.

`backend/test/account.spec.ts`:

- A1 `dryRun: true` on an account with sync rows + photos + quota → returns
  nonzero counts, a follow-up pull/GET confirms nothing was deleted.
- A2 `dryRun: false` deletes all `sync_rows`, `photos` (+ their R2 objects),
  `quota`, and the better-auth session for that user; the session's bearer
  token is rejected (`401`) on the next authenticated call.
- A3 deleting user A's account does not touch user B's rows (cross-user
  isolation, mirrors S9c in the sync suite).
- `POST /account/delete` answers `401` to no token, a forged token, and a
  user id sent as the token, and deletes nothing.

## 8. Must NOT (negative constraints)

- N1 `app/` is untouched — `git diff --stat origin/feat/sync-backend...HEAD -- app`
  is empty at the end of the task.
- N2 `shared/` gains no new import surface beyond what already exists — no
  photo/auth types are added to `shared/src/sync/` (the photo/account layer
  is REST, not part of the changelog sync protocol; no client-shared type
  was needed, so none was added — flagged as the "small additions... if
  needed" case explicitly turning out to be "not needed").
- N3 The existing 14 `backend/test/sync.spec.ts` + `index.spec.ts` tests are
  unmodified and still pass.
- N4 No secret enters the tree. `BETTER_AUTH_SECRET` in `wrangler.jsonc` is a
  clearly-labeled dev/test placeholder; production value is a `wrangler
secret`, never committed, provisioned by the maintainer.
- N5 Root `pnpm check` stays green and is not modified to run the Workers
  pool backend tests (mirrors sync spec's N5); `cd backend && pnpm test`
  remains the only way to run `backend/test/**`.
- N6 No photo is ever deleted server-side except via the owner's own
  `DELETE /photos/:photoId` or `POST /account/delete` (`dryRun: false`) —
  no cron/GC job is introduced.

## 9. Known limits (declared, not hidden)

- `rate_limit_windows` rows are never pruned (§6b) — acceptable growth rate,
  flagged for a future cleanup task.
- `WorkersBindingRateLimiter` (the production-binding implementation) has no
  automated test — the binding cannot be constructed in the vitest pool.
  Manual smoke test against a real `wrangler dev` deployment is the
  maintainer's responsibility before flipping the switch (documented inline
  in `rate-limit.ts`).
- `sync_sequence`'s known concurrent-request race (documented in
  `sync-protocol-spec.md` §5) is inherited unchanged; account deletion adds
  no new concurrency guarantee beyond D1's own `batch` atomicity.
- Social sign-in is not implemented (§2).
- `/sync`'s default authenticator is not cut over to better-auth (§2) —
  flagged for explicit maintainer decision.

## Revisions

- **§6b split**: `RateLimiter`'s pure math (`windowStart`, `isWithinLimit`,
  the interface) stayed in `backend/src/lib/rate-limit.ts`; the D1-backed
  and Workers-binding implementations moved to a new
  `backend/src/lib/rate-limiter-d1.ts`. Reason: the original draft
  described `D1RateLimiter` as living in `rate-limit.ts` itself, but that
  file is a Stryker mutation target on the root Node vitest pool, which
  cannot execute D1-dependent code (needs the Workers pool). Keeping them
  together would have left every mutant in the D1 class either unkillable
  (no coverage) or silently excluded — splitting the file is what makes
  "old-coder-scoped = actually mutation-tested" true rather than aspirational.
- **§3 revised**: account deletion no longer calls `auth.api.deleteUser`
  for the `user` row; `session`/`account`/`user` are deleted directly via
  drizzle, in the same D1 batch as the sync/photo/quota rows. Reason:
  `auth.api.deleteUser` gates on an email-verification flow this backend
  has no email provider to complete, which would make the endpoint
  unreachable in this milestone. Discovered while implementing §3, after
  the schema/CLI generation step in §1 was already committed to; the
  hand-written cascade for `sync_rows`/`photos`/`quota` was unavoidable
  either way, so this just extends it uniformly rather than mixing two
  deletion mechanisms.
- **§1 schema patch**: `npx @better-auth/cli generate` (published CLI:
  1.4.21) omitted an `account.issuer` column that the pinned
  `better-auth@1.7.2` core validates against at runtime, rejecting every
  request with `BetterAuthError: The field "issuer" does not exist ...`
  until the column was added by hand (`text('issuer').notNull()`,
  unique-indexed with `accountId`) to `auth-schema.ts`,
  `auth-migrations.ts`, and `migrations/0001_auth_init.sql`. This is a
  version-skew gap between the CLI package and the core library, not a
  design decision — documented inline in `auth-schema.ts`'s file header
  and in `docs/specs/backend-auth-photos-evidence.md`'s Honest Notes.
