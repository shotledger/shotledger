# Sync backend overview

Cloudflare Worker (Hono) implementing the server side of ADR 0003's DIY
changelog sync protocol. Full design rationale and the evidence-first
gauntlet results live in `docs/specs/sync-protocol-spec.md` and
`docs/specs/sync-protocol-evidence.md` — this file is a short map of what
lives where.

## Layout

```
shared/src/sync/
  protocol.ts     zod wire-protocol schemas, PROTOCOL_VERSION,
                  checkProtocolVersion() version handshake
  merge.ts        pure merge rules (tombstone-wins, LWW via server seq)
  index.ts        barrel

backend/src/
  auth.ts             Authenticator interface + devBearerAuthenticator stub
  db/schema.ts        drizzle table defs (sync_rows, sync_sequence,
                       sync_idempotency) — generic per-table row storage
  db/migrations.ts     D1 migration DDL (mirrored in backend/migrations/)
  db/queries.ts        pull/push query + merge/idempotency logic
  routes/sync.ts        POST /sync/pull, POST /sync/push (Hono)
  index.ts               mounts /sync/* behind the auth stub

backend/migrations/0000_sync_init.sql   canonical DDL for `wrangler d1
                                         migrations apply` at deploy time
                                         (never run by this task)
```

## Key decisions

- **Generic per-table row storage**, not one D1 table per
  `docs/implementation-plan.md` §3 table — `sync_rows` keys on
  `(user_id, table_name, row_id)` and stores the row's current state as a
  JSON payload. See spec §5 for the full justification.
- **Server-assigned sequence number (`seq`)**, not client timestamps, is
  the sole ordering signal — both for merge conflict resolution
  (tombstone-wins + LWW) and for pull cursor pagination. See spec §2a for
  why this reads as a deviation from one ADR 0003 bullet and why it is the
  position taken.
- **Auth is stubbed.** `backend/src/auth.ts`'s `devBearerAuthenticator`
  trusts the bearer token verbatim as the user id — `// TODO(better-auth)`
  marks where real token verification plugs in later.
- **`settings` and `session_tags`** are excluded from the syncable table
  set — they don't carry the `id`/`updated_at`/`deleted_at` convention the
  rest of the schema does. Flagged as `VERIFY` in spec §1.

## Running it

- `pnpm exec vitest run shared/src/sync` — protocol + merge unit tests
  (part of the root `vitest run` / `pnpm check` already).
- `cd backend && pnpm test` — full protocol-cycle integration tests
  against a local D1 binding (`@cloudflare/vitest-plugin`). **Not** wired
  into root `pnpm check`, per the M0 decision to keep backend tests
  separate.
- `pnpm mutation` — Stryker, now including `shared/src/sync/*.ts`.
- Never deploy from this task: `backend/wrangler.jsonc`'s `d1_databases`
  entry uses a placeholder `database_id` and is local/test-only.
