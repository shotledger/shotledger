# Sync protocol — executable specification

> Old-coder SPEC artifact for the ShotLedger v2 sync backend (ARCHITECTURE.md § Sync).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/sync-protocol-spec.md`
> Evidence report: `docs/specs/sync-protocol-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** The maintainer did not
> review this spec before implementation. Confidence claims in the evidence
> report are bounded accordingly; this document is the artifact reviewed
> after the fact.

Tier: **3** (sync is the mechanism by which every other table's data reaches
a second device; a wrong merge silently loses or resurrects logbook data).
Scope of the old-coder loop: `shared/src/sync/` (protocol schemas + pure
merge rules) and the D1-backed merge/idempotency logic in `backend/src/db/`
and `backend/src/routes/sync.ts`. Route wiring, auth stub plumbing, and
Hono boilerplate are exercised by the integration test suite but are not
independently mutation-tested (see §7 gauntlet scope).

## 0. Setup plan (what approving this authorizes)

- **Base branch reality check (deviation from the literal instruction):**
  the task said "branch `feat/sync-backend` from `main`", but `main`
  (069a5a0) predates M0 scaffold — it has no `app/`, `backend/`, or
  `shared/` directories at all; M0–M5 and the theme/score-x-semantics work
  all live on unmerged feature branches stacked on each other, with M0's PR
  (#10) still open. Branching from literal `main` would mean building the
  sync backend against a repo with no `backend/` or `shared/` package to
  extend. Instead: `feat/sync-backend` is created from `main`, then
  `backend/`, `shared/`, and the root workspace/tooling config
  (`package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`,
  `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
  `.editorconfig`, `.envrc`, `.github/`, `stryker.config.json`,
  `vitest.config.ts`, `scripts/`, `pnpm-lock.yaml`, `.gitignore`) are
  restored from the tip of the current stack (`feat/score-x-semantics`,
  `fd875a3`) via `git checkout <ref> -- <paths>` — **`app/` is deliberately
  excluded**, per the instruction to never touch it. This is flagged for
  the maintainer to confirm before merge; the alternative (rebuild the
  scaffold from scratch) would silently diverge from the in-flight M0–M5
  work and guarantee conflicts later.
- **Isolation:** working directly on the branch (not a fresh worktree) —
  the gauntlet needs installed `node_modules`, matching the precedent set
  by M3 (`docs/specs/m3-scoring-spec.md` §0).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths
  staged, branch pushed, no PR opened, `main` never touched.
- **New runtime dependency:** `drizzle-orm` in `backend/` (already fixed by
  the task instructions and already used the same way by `app/` for
  expo-sqlite — pinned to the same `^0.45.2`). `@shotledger/shared` added
  as a `workspace:*` dependency of `backend/` (internal, not external).
  `zod` is already a `shared/` dependency; no new zod dependency anywhere.
- **No new dev tooling.** Reuses the existing Stryker/vitest-coverage setup
  already present at the workspace root; `shared/src/sync/**` is added to
  both `vitest.config.ts` coverage `include` and `stryker.config.json`
  `mutate` globs (`mutate.schema` fallback runner is not needed — no zod
  schema module here is `ignoreStatic`-excluded from Stryker the way M3's
  were, since `protocol.ts`'s schemas are exercised via `.parse()` calls in
  route tests, giving Stryker per-test coverage).
- **Files the gauntlet adds, by path:** `shared/src/sync/protocol.ts`,
  `shared/src/sync/merge.ts`, `shared/src/sync/index.ts`,
  `shared/src/sync/protocol.test.ts`, `shared/src/sync/merge.test.ts`,
  `backend/src/db/schema.ts`, `backend/src/db/migrations.ts`,
  `backend/src/db/queries.ts`, `backend/src/auth.ts`,
  `backend/src/routes/sync.ts`, `backend/test/sync.spec.ts`,
  `backend/migrations/0000_sync_init.sql`, `docs/sync-backend.md`,
  edits to `backend/wrangler.jsonc`, `backend/worker-configuration.d.ts`,
  `backend/tsconfig.json`, `backend/package.json`,
  `shared/src/index.ts`, `vitest.config.ts`, `stryker.config.json`.

## 1. Schema-scope decision (open question for the maintainer)

`docs/implementation-plan.md` §3's convention — "every table has
`id`/`created_at`/`updated_at`/`deleted_at`; these three columns are the
sync foundation" — is contradicted by two tables in the same section's
concrete definitions:

- `settings` has PK `key`, no `id`/`updated_at`/`deleted_at` at all.
- `session_tags` is an explicit `PRIMARY KEY(session_id, tag_id)` junction
  table; no `id`/`updated_at`/`deleted_at` shown.

**Decision taken here (2026-09):** the nine tables that carried the
convention synced; `settings` and `session_tags` were excluded pending the
maintainer.

**Resolved 2026-10-06 by the maintainer's ruling** (ARCHITECTURE.md § Web app,
`docs/specs/sync-tags-settings-spec.md`): `session_tags` syncs, with its own
UUIDv7 id per link and the common columns; `settings` syncs per user, only
for the allowlist `SYNCED_SETTING_KEYS`, one row per key with the key as its
id. Both are in `SYNC_TABLE_NAMES`.

## 2. Protocol design (`shared/src/sync/protocol.ts`)

All types are zod schemas; the inferred TS types are the wire contract.

- `PROTOCOL_VERSION = 1`, `MIN_SUPPORTED_PROTOCOL_VERSION = 1` — separate
  constants because a server can support a _range_ of client versions; a
  client below the minimum must be told to upgrade before any pull/push is
  processed (ADR guardrail: "a client older than the server's minimum
  supported version must upgrade before syncing").
- `SyncTableName` — zod enum of the synced tables (§1; `SYNC_TABLE_NAMES`).
- `PullRequestSchema` — `{ protocolVersion: number, tables: { tableName,
cursor: nonnegative int }[] }` (min 1 entry). Array-of-entries rather
  than a keyed record: a zod `record()` over an enum key demands every key
  be present, which would force clients to always request all nine tables;
  the array lets a client sync a subset.
- `PullResponseSchema` — `{ protocolVersion, changes: ChangeRow[],
nextCursors: { tableName, cursor, hasMore }[] }`. `hasMore` exists
  because a single pull response is capped at `PULL_PAGE_SIZE` (200) rows
  per table — a client must keep pulling a table while `hasMore` is true
  before it has caught up (cursor pagination on `seq`, per the task's
  explicit instruction — see the deviation note in §2a below).
- `ChangeRowSchema` — `{ tableName, rowId, seq: positive int, payload:
unknown nullable, deletedAt: string nullable, updatedAt: string }`.
  `payload` is `null` exactly when `deletedAt` is non-null (a tombstone
  carries no data).
- `ClientChangeSchema` — `{ clientChangeId: uuid, tableName, rowId,
payload: unknown nullable, deletedAt: string nullable, updatedAt: string
}`. `clientChangeId` is a client-generated UUID used only for push
  idempotency (§4) — it is never used to order or merge.
  `updatedAt` here is **informational only** (stored for display/debugging)
  — it is never compared to decide merge outcomes (§3).
- `PushRequestSchema` — `{ protocolVersion, changes: ClientChange[] }`,
  1–500 entries (batch cap; a client with more changes calls push again).
  The route also caps each change's `payload` at `MAX_PAYLOAD_BYTES`
  (16 KiB of UTF-8 `JSON.stringify` output): one change over it refuses the
  whole request with `413 { error: 'payload_too_large', clientChangeId }`
  before anything is written.
- `PushAckSchema` — `{ clientChangeId: uuid, status: 'applied' |
'rejected' | 'duplicate', seq?: positive int, reason?: string }`.
  `rejected` is what the ADR calls a "server-authoritative rejection"
  (tombstone-wins, §3); `duplicate` is idempotent re-push (§4) — both are
  distinguished from `applied` so a client can tell "already there,
  nothing to do" from "server overruled this write".
- `PushResponseSchema` — `{ protocolVersion, acks: PushAck[] }`.
- `checkProtocolVersion(clientVersion)` — pure function, returns `{ ok:
true }` or `{ ok: false, error: { code:
'PROTOCOL_VERSION_UNSUPPORTED', minSupportedVersion, serverVersion } }`.

### 2a. Deviation: cursor key is `seq`, not `(updated_at, id)`

The sync guardrail list in ARCHITECTURE.md § Sync (drawn from surveyed failure reports)
says "catch-up/initial sync paginates by cursor on `(updated_at, id)`".
This task's own instructions are more specific and supersede that generic
line for our concrete design: "server-assigned ordering (server sequence
number per user, NOT client clocks)" (item 2) and "cursor pagination on
(seq)" (item 4's test list). Using the server-assigned integer `seq` as the
sole cursor is strictly stronger than `(updated_at, id)`: it is already
monotonic and unique per user by construction (§3), so no timestamp
tie-break is ever needed, and it sidesteps client-clock skew entirely
(ADR's other guardrail: "never trusted client clocks"). This is recorded
here because it reads as a literal contradiction of one ADR bullet;
resolving it in favor of the ADR's own stronger principle (server-assigned
ordering) and this task's explicit instructions is the position taken.

## 3. Merge rules (`shared/src/sync/merge.ts`) — pure, no I/O

- `nextSequence(lastSeq: number): number` — `lastSeq + 1`. Pure; the
  atomic increment against storage is the backend's job (§5), not this
  module's.
- `mergeChange(existing: StoredRow | undefined, change: ClientChange, seq:
number): MergeResult` where `MergeResult` is `{ status: 'applied', row:
StoredRow }` or `{ status: 'rejected', reason: string }`.
  - **R1 (create):** `existing` is `undefined` → always applied,
    regardless of `change.deletedAt` (creating an already-deleted row is
    unusual but not invalid — e.g. a device pushes a locally
    created-then-deleted row after being offline the whole time; applying
    it is correct and matches R3's tombstone-is-terminal model).
  - **R2 (tombstone-wins):** `existing` is present, `existing.deletedAt !=
null` (already tombstoned), and `change.deletedAt == null` (incoming
    is a live edit) → **rejected**, `reason: 'tombstoned'`. A tombstone is
    terminal for a row id: once deleted server-side, no live edit can
    resurrect it. This is the concrete instantiation of "tombstone wins on
    conflict, not naive `max(updated_at)`" — it does not compare
    timestamps at all, so no clock-skew scenario can defeat it.
  - **R3 (LWW via server order):** every other combination (create, live
    update over live row, delete over live row, re-delete over tombstoned
    row) → **applied**, storing `change`'s payload/deletedAt/updatedAt
    under the new `seq`. Because `seq` is assigned once per push at the
    server in strict arrival order (§5), "last write wins" reduces to "the
    push that reaches the server last wins", which is exactly
    server-assigned ordering — no client timestamp is read to make this
    decision.
  - **R4 (idempotent re-application):** calling `mergeChange` twice with
    the same `(existing, change, seq)` triple yields the same `MergeResult`
    both times (the function is pure — no hidden state). At the protocol
    level, true push idempotency (same `clientChangeId` submitted twice)
    is handled one layer up, in the backend's idempotency table (§5) —
    `mergeChange` is never called a second time for an already-recorded
    `clientChangeId`; R4 here is the narrower, mutation-testable claim that
    the merge function itself has no side effects that would make repeat
    calls diverge.

## 4. Idempotency

A push's `clientChangeId` is the sole idempotency key (scoped per user).
The backend records `(userId, clientChangeId) → outcome` for every
processed change, applied or rejected. A duplicate push (same
`clientChangeId` again — e.g. a client retries after a dropped response)
is acked `duplicate` with the originally-recorded `seq`/`reason`, and
**never re-runs `mergeChange`** — this is what makes push safe to retry
blindly on any network error.

## 5. Backend storage design (`backend/src/db/`)

**Decision: generic per-table row storage, not one D1 table per §3 table.**

```
sync_rows        (user_id, table_name, row_id) PRIMARY KEY,
                  seq INTEGER NOT NULL, payload TEXT (JSON, null iff
                  deleted_at set), updated_at TEXT NOT NULL,
                  deleted_at TEXT NULL
                  -- index (user_id, table_name, seq) for pull pagination
sync_sequence     user_id TEXT PRIMARY KEY, last_seq INTEGER NOT NULL
                  DEFAULT 0
sync_idempotency  (user_id, client_change_id) PRIMARY KEY,
                  status TEXT NOT NULL ('applied'|'rejected'),
                  seq INTEGER NULL, reason TEXT NULL
```

Justification:

- **A row's current state is fully described by its latest `seq`.** Under
  R3 (LWW-via-server-order), nothing downstream ever needs the full edit
  history of a row — only its latest applied state. So `sync_rows` stores
  _current_ state per `(user, table, row)`, upserted in place on every
  accepted change; it does not need a separate append-only changelog
  table. Pull for cursor `c` is simply `WHERE seq > c` — the row's presence
  above the cursor already means "this is the latest state and it changed
  since you last synced", collapsing any number of intermediate edits
  into one row, which is correct (a client that missed five edits to the
  same row only needs the sixth, final state).
- **One generic table beats nine mirrored tables** because (a) the ADR's
  own stated framing is that this is deliberately the _easy_ version of
  sync — one JSON blob per row keyed by table name avoids hand-writing and
  maintaining nine parallel D1 schemas that must be kept in lock-step with
  `docs/implementation-plan.md` §3 forever, a real maintenance-drift risk
  the generic design has by construction; (b) it makes `SyncTableName`
  (§2) the single place the set of syncable tables is declared, rather
  than needing both a zod enum and nine D1 `CREATE TABLE` statements kept
  consistent; (c) it costs nothing here since the server never needs to
  query _inside_ the JSON payload (photos/rate-limiting are out of scope
  per the task, and no server-side business logic runs over synced data in
  this milestone) — the day the server needs to query a synced field
  (e.g. for quota enforcement), that is the trigger to reconsider, not
  before.
- `sync_sequence` is a per-user monotonic counter, incremented atomically
  per accepted-or-rejected change via `INSERT ... ON CONFLICT DO UPDATE SET
last_seq = last_seq + 1 RETURNING last_seq` (D1/SQLite `RETURNING`) — one
  round trip, no separate read-then-write race window _within_ a single
  Worker request. **Known limitation, out of scope for this task**: this
  does not protect against two concurrent requests for the same user (e.g.
  a retried push racing the original) interleaving — the ADR guardrail
  "strict pull → push → ack cycle; no concurrent independent loops" is a
  _client-side_ discipline this backend assumes but does not itself
  enforce with a lock. Flagged for the maintainer; not a regression since
  no such enforcement exists anywhere yet.
- `sync_idempotency` implements §4. `seq` is nullable because a rejected
  change has no stored row/seq of its own to report back on replay (its ack
  is reconstructed from `status`/`reason` alone).

## 6. Backend endpoints (`backend/src/routes/sync.ts`)

- **Auth (stubbed, per task instructions):** `backend/src/auth.ts` exports
  an `Authenticator` interface (`authenticate(request): Promise<string |
null>`) and one implementation, `devBearerAuthenticator`, which treats
  the raw bearer token as the user id verbatim. **`// TODO(better-auth)`**
  marks it as the throwaway dev implementation; wiring real better-auth
  token verification is explicitly a later task per the assignment. Both
  `/sync/pull` and `/sync/push` run behind Hono middleware that calls the
  authenticator and returns `401` when it yields `null`.
- **`POST /sync/pull`:** parse body against `PullRequestSchema` (`400` on
  zod failure); check `checkProtocolVersion` (`409` +
  `PROTOCOL_VERSION_UNSUPPORTED` body on failure, matching item 1's
  "min-supported-version handshake"); for each requested table, query
  `sync_rows WHERE user_id = ? AND table_name = ? AND seq > cursor ORDER BY
seq ASC LIMIT 200`; `hasMore = returned.length === 200`;
  `nextCursor = returned.length ? last.seq : cursor` (an empty page never
  regresses the cursor).
- **`POST /sync/push`:** parse + version-check as above; process
  `changes` **sequentially, in array order** (matches "strict pull → push
  → ack cycle" — no fan-out/parallel writes within one push). For each
  change: idempotency lookup first (§4); if absent, look up the existing
  row, call `mergeChange`, atomically bump `sync_sequence` **only when a
  new `seq` is actually needed** (i.e. always — both applied and rejected
  outcomes still consume an idempotency record, but only `applied`
  consumes a fresh row `seq`; a rejected change's ack carries no `seq`),
  upsert `sync_rows` on `applied`, record the outcome in
  `sync_idempotency`, and build the ack. Return `PushResponseSchema`.

## 7. Test plan / gauntlet scope

`shared/src/sync/{protocol,merge}.test.ts` — Tier-3 loop: full coverage +
mutation (via the existing `pnpm coverage` / `pnpm mutation` root scripts,
extended to include `shared/src/sync/**`) + fast-check properties for R2
(tombstone always rejects a live edit over it) and R4 (repeat-call
determinism).

`backend/test/sync.spec.ts` (Workers vitest pool, `@cloudflare/vitest-plugin`,
migrations applied via `applyD1Migrations` in `beforeAll` against the local
D1 binding) — integration scenarios, one `it` per behavior:

- S1 fresh client full pull (empty cursor) returns all rows for a table,
  `hasMore: false` when under the page size.
- S2 incremental pull returns only rows with `seq > cursor`.
- S3 cursor pagination: seed more than `PULL_PAGE_SIZE` rows, assert the
  first pull page is capped, `hasMore: true`, and the returned
  `nextCursors[].cursor` lets a second pull reach the tail with
  `hasMore: false`.
- S4 push creates a new row, ack `applied`, subsequent pull returns it.
- S5 push conflict — tombstone-wins: push a delete, then push a live edit
  to the same row id; second ack is `rejected` / `'tombstoned'`, and a
  pull shows the row still deleted.
- S6 push conflict — LWW: two pushes to the same row in sequence both ack
  `applied`; a pull returns only the latest payload, at the latest `seq`.
- S7 idempotent duplicate push: replay the exact same `clientChangeId` +
  payload; second ack is `duplicate` with the original `seq`, and the
  stored row is unchanged (no new `seq` consumed).
- S8 version handshake rejection: pull and push both with
  `protocolVersion` below `MIN_SUPPORTED_PROTOCOL_VERSION` return `409`
  with `PROTOCOL_VERSION_UNSUPPORTED` and touch no storage.
- S9 auth: missing/malformed bearer token → `401` on both endpoints; two
  different tokens (= two different dev "user ids") never see each other's
  rows.

## 8. Negative constraints (must survive)

- N1 `shared/` stays free of Cloudflare/Workers/RN imports — `protocol.ts`
  and `merge.ts` import only `zod`.
- N2 No existing `shared/` or `backend/` test regresses (baseline recorded
  in EVIDENCE §2).
- N3 `app/` is untouched — verified by `git diff --stat main...HEAD -- app`
  being empty at the end of the task.
- N4 No secret/credential enters the tree; the dev auth stub never reads
  from `~/cloud/agents/`.
- N5 Root `pnpm check` is not modified to include `backend/` tests (task
  instruction #5) — `backend/package.json`'s own `test` script
  (`vitest run`) is the only way to run them, unchanged in shape from the
  M0 scaffold.
