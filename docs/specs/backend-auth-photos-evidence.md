# Backend auth + photos — evidence report

> Old-coder EVIDENCE artifact for the ShotLedger account + photo layer (ARCHITECTURE.md § Sync).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/backend-auth-photos-evidence.md`
> Spec: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/backend-auth-photos-spec.md`

## Evidence Report — Backend auth + photos (Tier 3)

- **Spec approval:** not obtained (autonomous run) — confidence downgraded;
  the spec is the artifact to review after the fact.
- **Source state:** commit `99357a003cf98a6b40807a3c31927c942e0d392f` on
  `feat/backend-auth-photos`, branched from `origin/feat/sync-backend`
  (`d45dd34518ed9dda60de9c3d0aee82bc2acf46af`). No relevant staged, unstaged,
  or non-ignored untracked files at the time these numbers were taken.
- **Toolchain:** `better-auth@1.7.2`, `@better-auth/drizzle-adapter@1.7.2`,
  `drizzle-orm@0.45.2`, `hono@4.13.5`, `vitest@4.1.11` (backend, Workers
  pool via `@cloudflare/vitest-plugin@1.1.2`), `vitest@3.2.7` (root Node
  pool), `@stryker-mutator/core` per `pnpm-lock.yaml`, `typescript@5.9.3`,
  Node/pnpm as recorded in `pnpm-lock.yaml`.
- **Entry point:** `pnpm typecheck && pnpm lint && pnpm coverage && pnpm
mutation` from the repo root; `cd backend && pnpm test` separately (root
  `pnpm check` deliberately does not run the Workers-pool backend tests —
  spec §8 N5, matching the sync-protocol precedent).
- **Independent verification:** not performed (Tier 3; no verifier round
  was run in this autonomous session).

### Spec → Test mapping

| Scenario                                              | Test                                                                                               | Status       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------ |
| §6a quota inclusive boundary + rejection              | `backend/src/lib/quota.test.ts` (4 unit + 2 property)                                              | pass         |
| §6a `applyQuotaDelta` fail-closed floor + pairing     | `backend/src/lib/quota.test.ts` (3 unit + 2 property)                                              | pass         |
| §6b `windowStart` / `isWithinLimit` math              | `backend/src/lib/rate-limit.test.ts` (6 unit + 4 property)                                         | pass         |
| §6c `authorizeOwner` unified not_found path           | `backend/src/lib/authz.test.ts` (4 unit + 2 property)                                              | pass         |
| P1 upload without Content-Length → 411                | `backend/test/photos.spec.ts::P1`                                                                  | pass         |
| P2 declared size over cap → 413, nothing stored       | `backend/test/photos.spec.ts::P2`                                                                  | pass         |
| P3 actual body exceeds declared length → 413          | `backend/test/photos.spec.ts::P3`                                                                  | pass         |
| P4 successful upload reflected in usage               | `backend/test/photos.spec.ts::P4`                                                                  | pass         |
| P5 quota-exceeded → 413, quota unchanged              | `backend/test/photos.spec.ts::P5`                                                                  | pass         |
| P6 61st upload/hour rate-limited; later window ok     | `backend/test/photos.spec.ts::P6`                                                                  | pass         |
| P7 GET as owner → 200, correct bytes                  | `backend/test/photos.spec.ts::P7`                                                                  | pass         |
| P8 GET as non-owner → 404                             | `backend/test/photos.spec.ts::P8`                                                                  | pass         |
| P9 GET nonexistent photoId → 404, same shape as P8    | `backend/test/photos.spec.ts::P9`                                                                  | pass         |
| P10 DELETE as owner → 204, quota decreases, 404 after | `backend/test/photos.spec.ts::P10`                                                                 | pass         |
| P11 DELETE as non-owner → 404, photo unaffected       | `backend/test/photos.spec.ts::P11`                                                                 | pass         |
| P12 re-upload same photoId nets size difference       | `backend/test/photos.spec.ts::P12`                                                                 | pass         |
| A1 dryRun:true reports counts, deletes nothing        | `backend/test/account.spec.ts::A1`                                                                 | pass         |
| A2 dryRun:false cascades + revokes session            | `backend/test/account.spec.ts::A2`                                                                 | pass         |
| A3 cross-user isolation on account deletion           | `backend/test/account.spec.ts::A3`                                                                 | pass         |
| Must NOT N1 `app/` untouched                          | `git diff --stat origin/feat/sync-backend...HEAD -- app`                                           | pass (empty) |
| Must NOT N2 no new `shared/` sync surface             | manual: no edits under `shared/`                                                                   | pass         |
| Must NOT N3 existing 14 sync/index tests unmodified   | `git diff origin/feat/sync-backend...HEAD -- backend/test/sync.spec.ts backend/test/index.spec.ts` | pass (empty) |
| Must NOT N4 no secret in tree                         | `wrangler.jsonc` `vars.BETTER_AUTH_SECRET` is a labeled dev placeholder                            | pass         |
| Must NOT N5 root `pnpm check` unmodified in shape     | `git diff origin/feat/sync-backend...HEAD -- package.json` (no `backend` test wiring added)        | pass (empty) |
| Must NOT N6 photos only deleted via owner action      | manual: no cron/GC code added                                                                      | pass         |

### Gauntlet (final fresh run)

| Layer                         | Command                                                                                                                                                                                                                                                                                                                                                                                                                                    | Result                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests (backend, Workers pool) | `cd backend && pnpm test`                                                                                                                                                                                                                                                                                                                                                                                                                  | 79 passed, 0 failed (10 files; includes the pre-existing 14 sync/index tests, unmodified)                                                                                                                                                                                                      |
| Tests (root, Node pool)       | `pnpm exec vitest run` (via `pnpm coverage`, see below)                                                                                                                                                                                                                                                                                                                                                                                    | 269 passed, 0 failed                                                                                                                                                                                                                                                                           |
| Types                         | `pnpm typecheck` (`tsc -b`, root + backend + shared project refs)                                                                                                                                                                                                                                                                                                                                                                          | 0 errors                                                                                                                                                                                                                                                                                       |
| Lint                          | `pnpm lint` (`eslint .`)                                                                                                                                                                                                                                                                                                                                                                                                                   | 0 errors, 0 warnings                                                                                                                                                                                                                                                                           |
| Format                        | `pnpm exec prettier --write` applied to all new/changed files                                                                                                                                                                                                                                                                                                                                                                              | clean (no diffs on rerun)                                                                                                                                                                                                                                                                      |
| Changed-line coverage         | `pnpm coverage` (`vitest run --coverage`, thresholds 100/100/100/100 on `backend/src/lib/{quota,rate-limit,authz}.ts` + pre-existing `shared/src/{scoring,disciplines,sync}/**`)                                                                                                                                                                                                                                                           | Statements 100% (768/768), Branches 100% (285/285), Functions 100% (71/71), Lines 100% (768/768)                                                                                                                                                                                               |
| Mutation                      | `pnpm mutation` (Stryker, `backend/src/lib/{quota,rate-limit,authz}.ts` + pre-existing globs)                                                                                                                                                                                                                                                                                                                                              | 662/675 killed, 2 timeout, 13 survived — **98.08% ≥ 95% break threshold, exit 0**. New-file breakdown: `quota.ts` 14/14 killed (100%), `rate-limit.ts` 8/8 killed (100%), `authz.ts` 9/10 killed (90%, 1 equivalent mutant — see below)                                                        |
| Property-based                | `pnpm coverage` includes fast-check properties                                                                                                                                                                                                                                                                                                                                                                                             | quota: 2 properties (allowed-matches-definition, never-negative + paired decrement), 100 examples/property default; rate-limit: 3 properties (never-exceeds-now, idempotent-window, exhaustive isWithinLimit over count∈[0,200]); authz: 2 properties (same-id-is-ok, mismatched-is-not_found) |
| Real execution                | manual smoke: `curl` against `wrangler dev` was **not** run (never deploy/dev-serve per task instructions — "never deployed"); the Workers-pool integration suite (`backend/test/photos.spec.ts`, `account.spec.ts`) exercises the real Hono app, real better-auth handler, real D1 (miniflare), and real R2 (miniflare) end to end via `app.fetch()`, which is the closest available "real execution" surface for this task's constraints |
| Supply chain                  | `npm view better-auth` / `@better-auth/drizzle-adapter` (both 1.7.2, MIT, actively maintained); no `npm audit` run in this session — **UNAVAILABLE-in-session, not run** (network egress to the audit endpoint was not attempted; flagged as a known gap, not silently skipped)                                                                                                                                                            |
| Suite health                  | `cd backend && pnpm test` run twice consecutively (17:xx and again after the stash-recovery incident below) — same 79/79 both times. **SUBSTITUTED**: 2 repeat runs, not randomized order — vitest's default runner does not expose a randomized-order flag out of the box for this project; cannot detect whole-suite order dependence                                                                                                    |

### Independent verification (never omit; see verifier.md)

- Not performed. This was a single autonomous session; no fresh-context
  verifier round was run against the final source state.

### Layers not run as specified

- **UNAVAILABLE (tool missing):** Supply-chain vulnerability scan
  (`npm audit`/equivalent) — not run this session; new deps (`better-auth`,
  `@better-auth/drizzle-adapter`) are each traced to their SPEC §0
  justification but not independently vuln-scanned.
- **N-A (no such surface):** `WorkersBindingRateLimiter` (the production
  rate-limit binding path, `backend/src/lib/rate-limiter-d1.ts`) has no
  automated test — the binding cannot be constructed in the vitest pool
  (spec §9, §6b). This is a declared structural blind spot, not a skipped
  layer over existing code.
- **SUBSTITUTED:** Suite-health "randomized order" — ran the suite twice
  in its default order instead; cannot detect order dependence between
  tests (see gauntlet table above).

### Dismissed review findings

- `backend/src/lib/authz.ts:14` Stryker survivor (`resourceOwnerId != null
&& ...` → `true && ...`) — dismissed because `authorizeOwner`'s second
  parameter, `requesterId`, is typed `string` (never `null`/`undefined`) at
  every call site in this codebase (`backend/src/routes/photos.ts`,
  `backend/src/routes/account.ts` both pass `c.get('userId')`, itself typed
  `string` via the Hono `Variables` binding). Under that constraint,
  `resourceOwnerId === requesterId` alone already evaluates `false` for
  every `null`/`undefined` `resourceOwnerId`, identical to the guarded
  version — the `!= null` guard only diverges from `true && ...` if
  `requesterId` can itself be `null`/`undefined`, which the type signature
  forecloses for every well-typed caller. The guard remains as a defensive
  runtime safeguard against a caller that bypasses TypeScript (raw JS,
  `any`), not as behavior any well-typed test could exercise — an
  equivalent mutant under this module's actual call-site domain.
- 12 pre-existing survivors in `shared/src/{disciplines,scoring}/**` —
  dismissed because they predate this task (present in the `feat/sync-backend`
  baseline this branch was built on) and are out of this task's scope
  (spec's old-coder scope is `backend/src/lib/{quota,rate-limit,authz}.ts`
  only; `shared/**` mutation coverage is inherited, unmodified).

### Structural blind spot

- The suite never exercises a real Cloudflare deployment (`wrangler dev` /
  a live account) — R2, D1, and the auth secret are all miniflare
  simulations or dev placeholders. Nothing here is evidence about
  production request routing, real R2 latency/consistency behavior, or
  whether the placeholder `wrangler.jsonc` bindings actually provision
  correctly against a real Cloudflare account (task instruction: never
  deploy).
- `auth.api.getSession`'s cookie/CSRF/origin-validation paths are only
  exercised with `origin: https://example.com` matching the test's own
  request origin; cross-origin rejection behavior (relevant once a real
  mobile app origin is registered) is untested here.

### Honest notes

- **Schema mismatch discovered mid-task:** `npx @better-auth/cli generate`
  (published CLI: 1.4.21) produced an `account` table missing an `issuer`
  column that the pinned `better-auth@1.7.2` core validates against at
  runtime — every request failed with `BetterAuthError: The field "issuer"
does not exist in the "account" Drizzle schema` until the column
  (`text('issuer').notNull()`, unique-indexed with `accountId`) was added
  by hand to `auth-schema.ts`, `auth-migrations.ts`, and
  `migrations/0001_auth_init.sql`. This is a version-skew gap in the CLI
  package, not a design choice; documented in `auth-schema.ts`'s file
  header. All 79 backend tests, including the better-auth sign-up/sign-in
  flows, pass with the patched schema.
- **P1 test design note:** the original draft simulated a missing
  `Content-Length` header by monkey-patching `Headers.get` on a constructed
  `Request`. That was unnecessary and was removed: `app.fetch()` is called
  in-process (no network hop), so a `Request` built without an explicit
  `content-length` header genuinely has none — the test now exercises the
  real missing-header case directly.
- **P5 test design note:** the 1 GB default quota can't be exhausted
  through the API within a test (bounded by `MAX_PHOTO_BYTES` per upload
  and `RATE_LIMIT_MAX_UPLOADS`/hour), so the test seeds a small quota row
  directly via `env.DB.prepare(...)` before uploading — documented inline
  in the test as a deliberate D1-direct setup, not a weakened assertion.
- **Operator incident during the session (recorded for transparency, not
  part of the code's own evidence):** a `git stash -u` / `git stash pop`
  used to compare against the pre-change baseline hit a `pnpm-lock.yaml`
  merge conflict; the stash was recovered via `git checkout -- pnpm-lock.yaml`
  (discarding the transient baseline lockfile) followed by a clean
  `git stash pop` and `git stash drop`, then `pnpm install` to regenerate a
  consistent lockfile, then a full rerun of typecheck/lint/`pnpm test`
  (79/79) to confirm nothing was lost. No source file was modified by this
  recovery; `git diff --stat` after recovery matched the pre-incident
  diff shape.
- **`pnpm check`'s `app/` step fails identically on the unmodified
  `origin/feat/sync-backend` baseline** (`sh: 1: cd: can't cd to app` —
  `app/` does not exist on this branch stack per the sync spec's own §0
  deviation note). This is a pre-existing condition, not a regression;
  confirmed by running `pnpm check` against the baseline via `git stash`
  before the recovery above. `pnpm typecheck`, `pnpm lint`, `pnpm coverage`,
  and `pnpm mutation` all pass on their own from the repo root; the `app/`
  step is the only piece of `pnpm check` that cannot run in this worktree,
  unrelated to this task's changes.
- No spec revisions were needed beyond the one already recorded inline at
  §6b (splitting `RateLimiter`'s pure math from its D1 implementation into
  two files so the mutation gauntlet only ever mutates Node-testable code)
  and §3 (account deletion deletes `session`/`account` rows directly via
  drizzle rather than through `auth.api.deleteUser`, which gates on an
  email-verification flow this backend has no email provider to complete —
  both decisions are documented inline in the spec and the corresponding
  source files' comments).
