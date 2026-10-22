# `backend/` — optional account, sync and photo backup

A Cloudflare Worker written with Hono. It is the server half of the opt-in
sync described in ARCHITECTURE.md § Sync; the app never needs it. Storage is D1
(SQLite) for rows and R2 for photos; accounts are email and password through
`better-auth`. The wire protocol and merge rules are shared with the app from
[`../shared/src/sync`](../shared/README.md).

`docs/sync-backend.md` is the map of what lives where. The design and the
evidence-first gauntlet results are in `docs/specs/sync-protocol-*.md`,
`docs/specs/backend-auth-photos-*.md` and `docs/specs/sync-app-*.md`.

## Routes

| Route                      | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `/api/auth/*`              | `better-auth`'s own sign-up, sign-in, sign-out and session endpoints. |
| `/sync/pull`, `/sync/push` | The changelog sync protocol, behind real auth.                        |
| `/photos`                  | Target-photo upload and retrieval on R2, quota-limited.               |
| `/account`                 | Account deletion, cascading through sync rows and photos.             |

`src/lib/` holds the pieces with their own unit tests and mutation gate:
authorization checks, per-user quotas and a D1-backed rate limiter.
`migrations/` is the canonical D1 DDL, mirrored in `src/db/*-migrations.ts`
for the in-process tests.

## Running the tests

```bash
cd backend && pnpm test
```

The suite runs on the Cloudflare Workers Vitest pool (`workerd`), so it
exercises real D1, R2 and `better-auth` in process with nothing deployed
and no network. `test/sync-client.spec.ts` goes furthest: it drives the
app's real sync cycle from `shared/` through the real Worker, two
in-memory devices on one account. That is the cheapest end-to-end check of
any sync change and is preferred over the emulator. On a slow machine the
205-row pagination case can exceed Vitest's default timeout; re-run with
`--testTimeout=60000` before suspecting a regression.

`pnpm approve-builds workerd` is needed once per machine, since pnpm blocks
the native build script by default.

## Deployment

`wrangler.jsonc` contains **placeholders only**: no real D1 id, no real
bucket, a dummy auth secret. Its top level is local development; the
`staging` and `production` envs are filled in, given their secret and
deployed by the maintainer with `pnpm deploy:staging` /
`pnpm deploy:production`, which build `web/dist` first (`docs/release.md`).
Agents never run `wrangler deploy`.
