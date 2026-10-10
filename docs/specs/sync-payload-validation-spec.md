# Sync payload validation on push — executable specification

> Old-coder SPEC for #697. Evidence report, once written:
> `docs/specs/sync-payload-validation-evidence.md`.
>
> **Approval status: NOT OBTAINED.** Awaiting the maintainer's review of the
> key choices (§3) and open questions (§11). No implementation file is touched
> before approval.

- **Tier: 3.** Data loss and a public wire contract: every row any writer
  pushes reaches every device on the account. A row the server should have
  refused can wedge another phone's sync for good. A row it refuses wrongly is
  cleared from the sender's outbox and never syncs again (§2.3).
- **Scope:** the server's `/sync/push` route and `applyPush`, a new
  per-table payload schema module in `shared/src/sync/`, the client engine's
  handling of one new rejection reason, one D1 migration. The pull path, the
  merge rules (R1–R4) and `PROTOCOL_VERSION` do not change.

## 1. Today

- `ClientChangeSchema.payload` is `z.unknown().nullable()`
  (`shared/src/sync/protocol.ts`). The route checks the envelope, the 16 KiB
  cap (`413 payload_too_large`) and the settings allowlist
  (`400 setting_not_synced`), then stores the payload as opaque JSON in
  `sync_rows.payload` (`backend/src/routes/sync.ts`).
- The phone applies a pulled row column by column (`applyOne`,
  `app/src/db/queries/sync-store.ts`): keys outside its own column set are
  dropped, and the rest are upserted in one transaction per page. A `null`
  in a `NOT NULL` column, or a missing `NOT NULL` column on a new row, makes
  the INSERT throw. The whole page rolls back, the cursor does not move, and
  every later cycle fails on the same row. That phone's sync is wedged until
  the server row changes.
- Writers today: the phone (whole rows read back through Drizzle,
  `toPayload`) and, on `origin/feat/web-series-entry-impl`, the web
  (`shared/src/sync-client/rows.ts` builders and `withRoundsAdded`, pushed
  by `direct-push.ts`). Each checks its own rows; nothing checks at the one
  place every row passes through.
- The phone does not enforce foreign keys: nothing in `app/src` sets
  `PRAGMA foreign_keys = ON`, so `defer_foreign_keys` in `applyChangesSync`
  is a no-op and an orphan row is stored, not refused.
- Facts this spec relies on, read from code, to be pinned by tests in RED:
  - `firearms.is_own` is `mode: 'boolean'`, so the phone's `toPayload`
    sends it as a JSON `true`/`false`. Every other flag (`is_sighter`,
    `is_championship`, …) is a plain integer and travels as `0`/`1`. The web
    builders write `0`/`1` for those and spread a pulled `is_own` unchanged.
  - A new local write sets the outbox entry's `client_change_id` to `NULL`
    (the outbox triggers in `app/src/db/migrations/0000_baseline.sql`), so
    an edit after a rejection is pushed as a fresh change.
  - The engine clears the outbox entry on every ack, `rejected` included,
    and acts on the reason only for `tombstoned` (`engine.ts` `runPush`).

## 2. Design

### 2.1 Payload schemas (`shared/src/sync/payload-schemas.ts`)

One hand-written zod object per entry in `SYNC_TABLE_NAMES` (C1), exported
as `PAYLOAD_SCHEMAS: Record<SyncTableName, z.ZodType>` with
`validatePayload(tableName, rowId, updatedAt, payload)`. It returns
`{ ok: true }` or `{ ok: false, issues }`. Per column:

| Column kind (Drizzle)                               | Wire rule                                                     |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `text`, `NOT NULL`                                  | `string`                                                      |
| `text`, nullable                                    | `string \| null`                                              |
| `text` with `enum: [...]`                           | exactly those literals (`\| null` when nullable)              |
| `integer`, `NOT NULL`                               | safe integer                                                  |
| `integer` 0/1 flag (`is_*`, `is_default_for_group`) | literal `0 \| 1` (C9)                                         |
| `integer` `mode: 'boolean'` (`firearms.is_own`)     | `boolean`                                                     |
| `real`                                              | finite number                                                 |
| `id`                                                | UUID, except `settings`, where the id is the setting key (C8) |
| FK columns (`*_id` with `.references`)              | UUID, or `null` where the column is nullable (C8)             |
| `created_at`, `updated_at`, `started_at`            | `toISOString()` shape (C7)                                    |
| `deleted_at`                                        | `null` (a live change; tombstones carry no payload)           |
| `settings.value`                                    | a string that `JSON.parse` accepts (C12)                      |

Every column of the table is a required key, and no other key is allowed
(C5). The envelope must agree with the payload: `payload.id === rowId` and
`payload.updated_at === updatedAt` (C10). A tombstone (`payload: null`) is
not validated beyond today's envelope refine.

`shared/` cannot import `app/src/db/schema.ts`, so the schemas cannot be
derived from it at runtime. A drift test in `app/` holds them to it (§2.5).

### 2.2 Where the server validates

In the route, after the existing 413 and `setting_not_synced` checks, which
stay whole-request refusals and run first. Each change gets a `valid`
boolean, which is passed into `applyPush`. The batch from
`sync-push-atomicity-spec.md` §3 gains one guard (C6):

```
OK     := ?valid AND (?7 IS NOT NULL OR NOT EXISTS (tombstoned row))
REASON := CASE WHEN tombstoned THEN 'tombstoned' ELSE 'invalid_payload' END
```

A refused change writes its idempotency record (`rejected`,
`invalid_payload`, no seq) in the same transaction as the rest of the push,
consumes no seq, and leaves `sync_rows` untouched. A replay of its
`clientChangeId` acks `duplicate` with reason `invalid_payload`, as a
tombstone rejection already does. When a change is both invalid and aimed at
a tombstone, the ack says `tombstoned`, so the phone still learns the
tombstone (C11).

The ack is the existing `PushAck` shape: `status: 'rejected'`,
`reason: 'invalid_payload'`. No `issues` field is added to the wire (C4).
The route logs the zod issue paths (table, column, code, never values) so
a refusal can be diagnosed without a PII-bearing log.

### 2.3 What each client does with `invalid_payload`

- **Phone (`runPush`).** Clears the entry, as for every ack (a rejection is
  final and the next local edit is a fresh change), and counts it in a new
  `SyncCycleResult.invalid`. It is not added to `rejected`, whose single
  consumer is the tombstone path. The status reducer keeps the count so the
  Account & Sync screen can show "n changes refused by the server" (C3).
  The row stays on the phone, unsynced, until it is edited again.
- **Web (`direct-push.ts`).** Already reports any rejection as
  `partlyRejected` with its reason. No code change; a test pins that
  `invalid_payload` arrives there.
- **Before queuing.** The phone queues from SQLite triggers, so it cannot
  validate there. Runtime validation before push is not added (C2). The
  phone's writers are held to the schemas at test time instead (§2.5).

### 2.4 Migration: `CHECK (json_valid(payload) OR payload IS NULL)`

SQLite cannot add a `CHECK` to an existing table, so the migration rebuilds
`sync_rows`: create `sync_rows_new` with the check, copy, drop, rename,
recreate `idx_sync_rows_user_table_seq`. It is added as `0003_sync_rows_json_check` to both
`SYNC_MIGRATIONS` (`backend/src/db/migrations.ts`) and
`backend/migrations/` (C13). `migrations-drift.spec.ts` keeps the two in
step. It is a backstop beneath the route: the route only ever writes
`JSON.stringify` output, so the check never fires in normal operation.

### 2.5 Drift and writer tests (in `app/`)

- **Schema drift.** For every `SYNC_TABLES` entry, the test compares
  `getTableColumns` with the zod shape: key set equal, `notNull` ↔
  nullability, `enumValues` ↔ literals, `integer`/`real`/`text` ↔ number,
  integer or string. A column added to `schema.ts` without its schema fails
  here, before it can be refused in production.
- **Writer conformance.** Every row the demo-data loader writes, read back
  through `toPayload`, passes `validatePayload`. The same for the web
  builders (`newSessionRow`, `newSeriesRow`, `newShotRow`,
  `withRoundsAdded` over a phone firearm row) in `shared/`.

### 2.6 Out of scope

- **Foreign keys.** The server does not check that a referenced parent row
  exists (C14). FK columns are only shape-checked (§2.1).
- **Generated columns** on `sync_rows` (issue item 3) are not added. They
  come only when the server must query a field, such as a quota by firearm.
- Mirroring each synced table as a typed D1 table (rejected in the issue).
- Re-validating rows already stored. Pull is unchanged; §8's audit covers the
  data that exists.
- Text length limits (`TEXT_LIMITS`) on the server (C12).

## 3. Key choices for approval

Each choice has a recommendation and the alternative it rules out.

- **C1 Hand-written zod schemas in `shared/`, pinned by a drift test in
  `app/`.** Alternative: `drizzle-zod`, generating them from the Drizzle
  tables. It is **not in the implementation plan** (hard rule 2), so it is
  not added. It would also need the Drizzle tables in `shared/`, because
  the server cannot import `app/`. That means moving `schema.ts`, a larger
  change than this issue. The drift test gets the same guarantee without a
  dependency.
- **C2 No runtime validation on the phone before push.** The server is the
  one authority, and test-time conformance (§2.5) covers the phone's
  writers. Alternative: validate in `runPush` and hold an invalid row
  locally. That saves a round trip, but it is a second place where the rule
  runs, with the same end state for the row.
- **C3 The phone clears a refused entry, counts it separately and shows the
  count.** Alternatives: (a) count only, no UI. The refusal is then silent,
  which is what this issue exists to end. (b) Keep the entry queued. The
  refusal is final (recorded for idempotency), so a resend only acks
  `duplicate`. Without a skip, the stuck entry would also spin
  `MAX_PUSH_ITERATIONS` in every cycle. The count is a UI change, so
  `docs/manual/` is updated in the same PR.
- **C4 The ack carries only `reason: 'invalid_payload'`.** Alternative: add
  the zod issues to `PushAck`. That is a wire-shape change, and it echoes
  column paths back for no client that would act on them. The server log has
  them.
- **C5 Strict keys: every column required, no unknown column accepted.** Pre-1.0,
  rule 8 applies: the server and both clients ship from one repo, and no
  compatibility path is built for a newer client. The cost is release order.
  A phone built with a new column, talking to an older server, has every push
  of that table refused and cleared. The implementation PR therefore adds
  "deploy the Worker before shipping an app build that changes a synced
  table" to `docs/release.md`. Alternatives: (a) `.passthrough()` for unknown
  keys while known keys are validated. That tolerates a newer phone, but
  lets a misspelled key (`startedAt`) through, and on apply the misspelled
  key is dropped and the row's `NOT NULL` column is left unset, which is
  exactly the wedge. (b) `.strip()`, storing the payload without unknown
  keys. That silently loses the newer column for every device.
- **C6 A refusal is a per-change `rejected` ack, decided inside the push
  batch.** Alternative: a whole-request `400 invalid_payload`, like
  `setting_not_synced`. That is lossless, but one bad row then blocks every
  good row behind it in the outbox, on every cycle: the wedge moves from
  pull to push. Deciding in the batch keeps the atomicity design: one
  transaction, no seq consumed by a refusal.
- **C7 `toISOString()` shape for `created_at`, `updated_at` and
  `started_at`**: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`, and
  `new Date(s).toISOString() === s`, so `2026-02-30T…` fails.
  `performed_at` and `external_synced_at` get the same rule only if the
  audit (§8, Q3) shows every writer and every stored row already conform.
  Otherwise they stay plain strings. User-typed dates (`decided_on`,
  `valid_until`, `purchased_on`) stay strings. Alternative: any string that
  `Date.parse` accepts. That admits local-time strings, which break the
  "UTC in storage" rule the date helpers rely on.
- **C8 UUID (any version) for `id` and FK columns; the setting key for a
  `settings` id.** Alternative: any non-empty string. The audit (Q3) must
  show that no stored or imported row uses a non-UUID id before this is
  frozen.
- **C9 Integer flags are exactly `0 | 1`, and `is_own` is a boolean.** This
  matches what the writers send today (§1). Alternative: any integer for
  flags. A web builder writing `true` into `is_sighter` would then pass the
  server, and the result depends on how expo-sqlite binds a boolean.
- **C10 The envelope must agree with the payload** (`id` and `updated_at`).
  A payload whose `id` differs from `rowId` is stored on the server under
  `rowId`, but `applyOne` upserts it as `payload.id` on the phone, so the
  two disagree about which row it is. Alternative: check `id` only.
- **C11 `tombstoned` outranks `invalid_payload`.** The phone acts on
  `tombstoned` by writing the tombstone locally, and the row is gone either
  way. Alternative: invalid first. The phone would then never learn the
  tombstone (`shadow.ts`).
- **C12 `settings.value` must be JSON text; neither per-key value shapes nor
  `TEXT_LIMITS` are enforced.** The web already reads an unexpected value as
  unset (`account-settings.ts`), and `MAX_PAYLOAD_BYTES` already bounds size.
  Alternative: per-key value schemas and the `TEXT_LIMITS` lengths. That is
  more to keep in lock-step, and a ShotLog import may hold longer notes than
  the limits. The audit reports both, so a later change can tighten them.
- **C13 A new migration `0003`.** It rebuilds the table, so a D1 that already
  applied `0000` gets the check. Alternative under rule 8: edit `0000` in
  place. That works only if no D1 has run `0000`. `wrangler d1 migrations
apply` would never re-run it on one that has (Q2).
- **C14 No foreign-key check on the server.** A child can legitimately reach
  the server before its parent: a later push batch, a parent tombstoned in
  between. The phone already stores orphans, so a refusal would lose data
  that is harmless today. Alternative: in the batch, refuse
  `missing_parent` when the parent is in neither `sync_rows` (any state) nor
  earlier in the same push. That costs one lookup per FK column, and the
  phone's push order (by `rev`) is not guaranteed to be parent-first after
  an edit. Recorded as a known limit; see Q4.

## 4. Scenarios

User `u`. `F` is a valid full `firearms` payload for row `f1`, `S` a valid
full `sessions` payload, as the phone's `toPayload` produces them. Status and
reason refer to the ack for that change.

```gherkin
Feature: the server stores only rows every device can apply

  Scenario: P1 a valid row of every synced table is applied
    Given one valid payload per table in SYNC_TABLE_NAMES, built by toPayload from demo data
    When they are pushed in APPLY_ORDER
    Then every ack is applied, and a pull returns each payload byte-for-byte

  Scenario Outline: P2 a malformed row is refused and stores nothing
    Given an empty account u
    When a push sends F with <mutation>
    Then the ack is rejected, reason "invalid_payload", no seq
     And sync_rows has no row f1, last_seq is unchanged
     And the idempotency record is rejected/invalid_payload
    Examples:
      | mutation                                        |
      | make: null                       (NOT NULL)     |
      | make removed                     (missing key)  |
      | weapon_type: "shotgun"           (enum)         |
      | round_count: 1.5                 (integer)      |
      | round_count: "12"                (type)         |
      | is_own: 1                        (boolean)      |
      | created_at: "2026-08-01 10:00"   (timestamp)    |
      | updated_at: "2026-02-30T00:00:00.000Z" (date)   |
      | id: "f2"                         (id ≠ rowId)   |
      | extra key "colour": "black"      (unknown key)  |
      | deleted_at: "2026-08-01T00:00:00.000Z" on a live change |

  Scenario: P3 one bad row does not hold back the good ones
    Given an empty account u
    When one push sends [F, S with name: null, a valid series of S2]
    Then the acks are applied@1, rejected/invalid_payload, applied@2
     And last_seq is 2

  Scenario: P4 a refusal replays as a duplicate with its reason
    Given F' (F with make: null) was refused as c1
    When c1 is pushed again
    Then the ack is duplicate, reason "invalid_payload", no seq, and nothing changes

  Scenario: P5 a tombstone outranks an invalid payload
    Given f1 is stored deleted
    When a live F' with make: null is pushed for f1
    Then the ack is rejected, reason "tombstoned"

  Scenario: P6 a tombstone is never payload-validated
    Given f1 is stored live
    When a delete for f1 is pushed (payload null, deletedAt set)
    Then the ack is applied

  Scenario: P7 the phone counts and clears a refusal; the row stays local
    Given device A has f1 queued with make: null written straight into SQLite
    When A runs a sync cycle against the real Worker
    Then the cycle result has invalid = 1, rejected = 0
     And A's outbox no longer holds f1, A's f1 is unchanged
     And device B's pull never receives f1
    When A edits f1 to a valid row
    Then the next cycle pushes it under a new clientChangeId and B receives it

  Scenario: P8 the web sees the refusal
    Given the web builds a session whose series payload is invalid
    When pushChanges runs against the real Worker
    Then the outcome is partlyRejected with that series and reason "invalid_payload"

  Scenario: P9 the drift test fails on a schema change it was not told about
    Given payload-schemas.ts
    When a throwaway column is added to firearms in schema.ts (or a NOT NULL dropped, or an enum value added)
    Then the drift test fails, naming table and column

  Scenario: P10 the CHECK refuses non-JSON written past the route
    Given migrations 0000..0003 applied
    When sync_rows is written directly with payload "not json"
    Then D1 refuses the write; with payload NULL it is accepted
     And rows present before 0003 are present after it, unchanged

  Scenario: P11 the existing tolerance survives
    Given a pulled row carrying a column this build does not know
    When the phone applies it
    Then the column is dropped and the rest applied, as today
```

**Falsification.** Each scenario is RED before its code, with these
exceptions: P6 and P11 already pass on `main`. They are regression armour,
and each is proved able to fail with a throwaway mutant (validate tombstones;
stop dropping unknown columns in `applyOne`). For P2, each row of the table is
its own test. A schema that skipped a check would turn exactly one row green.
For P9, the throwaway schema edit is made, the test is watched failing, and
the edit is reverted; this is recorded in EVIDENCE with `git diff` showing
the revert.

## 5. Must NOT

- N1 `PROTOCOL_VERSION` stays 1. `PushAck`, `ChangeRow`, request shapes and
  status codes are unchanged; only a new `reason` value appears (rule 8).
- N2 The pull path is unchanged, byte for byte: `pullTablePage`, the pull
  route and `applyOne`'s handling of unknown columns.
- N3 The atomicity guarantees hold: scenarios C1–C9 of `sync-push-atomicity-spec.md`, in
  `backend/test/sync-concurrency.spec.ts` pass with their assertions
  unchanged.
- N4 No test assertion is weakened. Existing backend tests push partial
  payloads (`{ make: 'Anschutz' }` in `sync.spec.ts`, rows in
  `sync-client.spec.ts`), which strict validation would refuse. Their
  payload fixtures are replaced by a full-row builder. Their assertions do
  not change, and the evidence lists every touched test by name with its
  diff reviewed for assertion edits.
- N5 No new dependency. `zod` is already in `shared/`.
- N6 No value from a payload appears in a log line or an ack.
- N7 The 413 and `setting_not_synced` refusals keep their order and shape.
- N8 No foreign-key or generated-column logic is added.

## 6. Failure model

| Failure                                                                    | Layer that catches it                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Schema stricter than a real writer: a good row is refused and lost to sync | §2.5 writer conformance; §8 real-data audit; P1                                            |
| Schema looser than the apply path: a wedging row is stored                 | P2 per-mutation rows; mutation layer on `payload-schemas.ts`                               |
| Schema drifts from `schema.ts` after a later column change                 | P9 drift test, in `pnpm check`                                                             |
| A refusal consumes a seq or half-writes                                    | P2/P3 `last_seq` assertions; atomicity C1–C9 unchanged                                     |
| A refusal is silent on the phone                                           | P7 `invalid` count; the status reducer test                                                |
| Release skew (C5): new app column, old server                              | `docs/release.md` deploy-order step; known limit, not testable in CI                       |
| A hostile payload (deep nesting, huge arrays, prototype keys)              | the existing 16 KiB cap; adversarial pass (§7); zod objects are not merged into prototypes |
| The migration loses or reorders rows                                       | P10 copy check; rollback rehearsal on a seeded local D1                                    |
| Validation cost pushes a 500-change push past Worker CPU                   | adversarial pass timing (§7)                                                               |

## 7. Gauntlet

| Layer                 | How                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root gates            | `pnpm check` (types, lint, format, coverage) and `pnpm gauntlet`                                                                                                                                                                |
| Backend suite         | `cd backend && npx vitest run --testTimeout=60000`, with P2–P8 and P10 in a new `backend/test/sync-payload-validation.spec.ts`                                                                                                  |
| Mutation              | `pnpm mutation` (Stryker) over `payload-schemas.ts`, already in its `shared/src/sync/*.ts` glob. Survivors are classified in EVIDENCE. `scripts/manual-mutation-sync-push.mjs` gains mutants for `?valid` and the reason `CASE` |
| Property-based        | fast-check (already a root dev dependency): any payload `toPayload` could produce from an arbitrary valid row passes, and any single-column corruption from a generator of P2's mutation kinds fails                            |
| Changed-line coverage | `shared/`: the existing coverage gate. `backend/`: substituted by the mutation script, as in the atomicity spec (no istanbul)                                                                                                   |
| Real execution        | `sync-client.spec.ts` and `sync-contract.spec.ts` drive the real engine against the real Worker; P7 and P8 run there                                                                                                            |
| Suite health          | backend suite with `--sequence.shuffle`, three runs                                                                                                                                                                             |
| Adversarial pass      | 500 changes of the fullest row; payloads with `__proto__`/`constructor` keys, 10k-element arrays, deep nesting inside the 16 KiB cap; a NaN-producing number (JSON cannot carry one, so it is checked to be impossible)         |

## 8. Real-data audit (before the schemas are frozen)

A throwaway script, kept outside the tree under
`~/cloud/agents/notes/shotledger/`, runs `validatePayload` over every row of
the maintainer's real-data phone database (the ShotLog import) and over the
server's rows if a D1 exists (Q2). It reports counts per table and column
and issue code only: no values, ids or names (hard rule 7). Any column that
fails is a spec question before code goes further. It is never an
instruction to loosen the schema quietly. The counts go into EVIDENCE.

## 9. Setup plan (what approval authorizes)

- **Isolation:** a `feat/sync-payload-validation` branch in its own worktree
  off `origin/main`, after `feat/web-series-entry-impl` has merged, since P8
  needs `direct-push.ts`. Dependencies are installed there and the gauntlet
  runs there.
- **Git:** Conventional Commits, `git commit -s`, explicit paths only. The
  commits are: this spec once approved, RED tests, GREEN per scenario group,
  fixture migration (N4) as its own commit, evidence.
- **Files:**
  - `shared/src/sync/payload-schemas.ts`, `payload-schemas.test.ts`, and
    exports in `shared/src/sync/index.ts`
  - `backend/src/routes/sync.ts`, `backend/src/db/queries.ts` (`applyPush`
    guard), `backend/src/db/migrations.ts`, and
    `backend/migrations/0003_sync_rows_json_check.sql`
  - `backend/test/sync-payload-validation.spec.ts`, a full-row fixture
    builder in `backend/test/`, and fixture edits in `sync.spec.ts`,
    `sync-client.spec.ts`, `sync-contract.spec.ts` and
    `sync-concurrency.spec.ts` (N4)
  - `shared/src/sync-client/engine.ts`, `status.ts` and their tests
  - `app/src/db/queries/sync-payload-schemas.test.ts` (drift and writer
    conformance), the Account & Sync status line, `app/src/i18n/{en,sv}.json`
  - `docs/manual/` (the refusal count, en and sv), `docs/release.md`
    (deploy order, C5), `scripts/manual-mutation-sync-push.mjs`
  - `docs/specs/sync-payload-validation-evidence.md`
- **New dependencies:** none.

## 10. Risks

- **The audit finds non-conforming real rows.** The likeliest are
  `performed_at` and imported ids. Each one becomes a maintainer decision,
  which is why the audit runs before code.
- **Schemas live in two places** (`schema.ts` and `payload-schemas.ts`).
  The drift test holds them together for keys, nullability, enums and
  storage type. It cannot know a column's finer rule (UUID, timestamp
  shape, 0/1); those are hand-kept and covered by P2 and the conformance
  tests.
- **Local is not production.** `json_valid` and `CHECK` enforcement are
  probed in the Workers pool (P10), not on a deployed D1.

## 11. Questions for the maintainer

- **Q1** Approve C1–C14 as recommended, in particular C5 (strict keys plus
  a deploy-order rule), C3 (a visible refusal count, which means a UI and
  manual change) and C14 (no FK check)?
- **Q2** Has any D1 run migration `0000` (#677 prepared deployment)? This
  decides C13, and whether the audit covers server rows.
- **Q3** May the audit run over the real-data phone database, outside the
  tree, reporting counts only? Its result fixes C7's two open columns and
  C8.
- **Q4** Should FK integrity get its own issue (C14's alternative), or stay
  a known limit until the phone enforces foreign keys itself?

## Revisions

- (none yet)
