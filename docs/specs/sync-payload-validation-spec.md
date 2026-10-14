# Sync payload validation on push — executable specification

> Old-coder SPEC for #697. Evidence report:
> `docs/specs/sync-payload-validation-evidence.md`.
>
> **Approval status: partly obtained.** C1 (drizzle-zod) is the maintainer's
> decision of 2026-10-13 ("I prefer libraries over handmade duplication").
> C2–C14 and Q1–Q6 were not reviewed: the spec was revised and implemented in
> an overnight run on the recommendations below, and the evidence report says
> `spec approval: not obtained (autonomous run)` for them. The first draft
> was PR #711 (hand-written schemas); Revision 1 at the end lists what
> changed.

- **Tier: 3.** Data loss and a public wire contract: every row any writer
  pushes reaches every device on the account. A row the server should have
  refused can wedge another phone's sync for good. A row it refuses wrongly is
  cleared from the sender's outbox and never syncs again (§2.3).
- **Scope:** the server's `/sync/push` route and `applyPush`, a new
  per-table payload schema module in `shared/src/sync/`, derived from the
  Drizzle tables with drizzle-zod, the client engine's handling of one new
  rejection reason and its status line on Account & Sync, and the
  `sync_rows` DDL. The pull path, the merge rules (R1–R4) and
  `PROTOCOL_VERSION` do not change.

## 1. Today

- `ClientChangeSchema.payload` is `z.unknown().nullable()`
  (`shared/src/sync/protocol.ts`). The route checks the envelope, the 16 KiB
  cap (`413 payload_too_large`) and the settings allowlist
  (`400 setting_not_synced`), then stores the payload as opaque JSON in
  `sync_rows.payload` (`backend/src/routes/sync.ts`).
- The phone applies a pulled row column by column (`applyOne`,
  `app/src/db/queries/sync-store.ts`): keys outside its own column set are
  dropped, and the rest are upserted in one transaction per page. A `null`
  in a `NOT NULL` column, or a missing `NOT NULL` column without a default
  on a new row, makes the INSERT throw. The whole page rolls back, the
  cursor does not move, and every later cycle fails on the same row. That
  phone's sync is wedged until the server row changes. A missing _nullable_
  column is a quieter fault: a new row gets `NULL`, an existing row keeps
  its old value, so two devices disagree about the row for good.
- Writers today: the phone (whole rows read back through Drizzle,
  `toPayload`) and the web (`shared/src/sync-client/` builders —
  `rows.ts`, `session-entry.ts`, `falt-entry.ts`, `bulk-edit.ts`,
  `session-edit.ts`, `settings-edit.ts`, `tag-rows.ts`, `volume-rows.ts` —
  pushed by `direct-push.ts`). Each checks its own rows; nothing checks at
  the one place every row passes through.
- The phone does not enforce foreign keys: nothing in `app/src` sets
  `PRAGMA foreign_keys = ON`, so `defer_foreign_keys` in `applyChangesSync`
  is a no-op and an orphan row is stored, not refused.
- The Drizzle tables lived in `app/src/db/schema.ts`, AGPL. The ELv2 Worker
  may compile only `shared/src/sync/` (Apache-2.0, ADR 0017), so they move,
  unchanged, to `shared/src/sync/schema.ts` (ADR 0021, proposed).
  `app/src/db/schema.ts` re-exports them.
- The backend has never been deployed (#671's account steps are still the
  maintainer's), so no D1 has run `0000_sync_init`.
- Facts this spec relies on, read from code and pinned by tests:
  - `firearms.is_own` is `mode: 'boolean'`, so the phone's `toPayload`
    sends it as a JSON `true`/`false`. Every other flag (`is_sighter`,
    `is_championship`, `is_shoot_off`, `is_adjustment`, …) is a plain
    integer and travels as `0`/`1`.
  - A new local write sets the outbox entry's `client_change_id` to `NULL`
    (the outbox triggers in the baseline migration), so an edit after a
    rejection is pushed as a fresh change.
  - The engine clears the outbox entry on every ack, `rejected` included,
    and acts on the reason only for `tombstoned` (`engine.ts` `runPush`).

## 2. Design

### 2.1 Payload schemas (`shared/src/sync/payload-schemas.ts`)

One zod object per entry in `SYNC_TABLE_NAMES`, derived from its Drizzle
table with drizzle-zod's `createSelectSchema` (C1). The protocol-name →
table map (`SYNC_TABLES`) moves from `app/src/db/queries/sync-store.ts` to
`shared/src/sync/tables.ts`, so the phone and the server read one map.

`createSelectSchema` describes a row as the database returns it: every
column present, `NOT NULL` columns non-null, nullable ones `| null`, enum
columns as their literals, `integer` as a safe integer, `real` as a number
within a signed 48-bit integer's range (`REAL_MIN`..`REAL_MAX` in
`protocol.ts`, so `1e15` fails), `mode: 'boolean'` as a boolean. The module then:

- **re-keys** each shape from Drizzle property names to column names
  (`firearmId` → `firearm_id`), because the wire uses column names;
- **refines** the columns whose rule is finer than their storage type:

| Column                                                   | Wire rule (beyond drizzle-zod's)                    |
| -------------------------------------------------------- | --------------------------------------------------- |
| `integer` 0/1 flag (`is_*`, `decimal_scoring`)           | literal `0 \| 1` (C9)                               |
| `created_at`, `updated_at`, `started_at`, `performed_at` | `toISOString()` shape and a real instant (C7)       |
| `deleted_at`                                             | `null` (a live change; tombstones carry no payload) |
| `settings.value`                                         | a string that `JSON.parse` accepts (C12)            |
| `id`, FK columns                                         | non-empty string (C8)                               |

- is **strict**: every column of the table is a required key, and no other
  key is allowed (C5);
- checks the **envelope** against the payload: `payload.id === rowId` and
  `payload.updated_at === updatedAt` (C10).

`validatePayload(change)` takes the change's `tableName`, `rowId`,
`updatedAt`, `payload` and `deletedAt`, and returns `{ ok: true }` or
`{ ok: false, issues }`, where `issues` are zod issue paths and codes only
(never a value). A tombstone (`deletedAt` set; `ClientChangeSchema` already
requires its payload to be `null`) is not validated further.

The flag set is derived, not listed: an `integer` column named `is_*`, plus
`decimal_scoring`. Two tests pin every `integer` column per table, one the
flags and one the counting columns, so a new integer column of either kind
fails a test until someone classifies it. A flag named otherwise cannot slip
through as "any integer".

The module is not exported from the `@shotledger/shared` barrel. The server
imports it by path. The phone and the web never run it (C2), so drizzle-zod
is not in their bundles.

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
The route logs one line per refused change: table, and the issue paths and
codes (never values, never ids), so a refusal can be diagnosed without a
PII-bearing log (N6).

### 2.3 What each client does with `invalid_payload`

- **Phone (`runPush`).** Clears the entry, as for every ack (a rejection is
  final and the next local edit is a fresh change), and counts it in a new
  `SyncCycleResult.invalid`. It is not added to `rejected`, whose single
  consumer is the tombstone path. The entry is gone once its ack is
  handled, so the engine also reports each refusal then, through an
  `onRefused` callback; the controller turns it into a `refused` status
  event, and the reducer adds one to `SyncStatus.refusedCount` per event.
  A push batch that fails later in the same cycle therefore cannot lose a
  refusal already cleared. Account & Sync shows
  "n change(s) refused by the server" while it is above zero (C3). The count
  lives for the app session; it is not persisted. The row stays on the
  phone, unsynced, until it is edited again or a pull brings a change to
  the same row from another device, which replaces it (last write wins, as
  for any row). A refused change is therefore not guaranteed to survive;
  the count and the manual say so.
- **Web (`direct-push.ts`).** Already reports any rejection as
  `partlyRejected` with its reason, and every web page already says a
  rejected save did not land. No code change; a test pins that
  `invalid_payload` arrives there.
- **Before queuing.** The phone queues from SQLite triggers, so it cannot
  validate there. Runtime validation before push is not added (C2). The
  writers are held to the schemas at test time instead (§2.5).

### 2.4 `CHECK (json_valid(payload) OR payload IS NULL)`

Added to `sync_rows` in `0000_sync_init`, in place, in both
`SYNC_MIGRATIONS` (`backend/src/db/migrations.ts`) and
`backend/migrations/0000_sync_init.sql` (C13). `migrations-drift.spec.ts`
keeps the two in step. It is a backstop beneath the route: the route only
ever writes `JSON.stringify` output, so the check never fires in normal
operation.

### 2.5 Derivation and writer tests

- **Derivation (replaces the drift test of the first draft).** For every
  `SYNC_TABLES` entry: the schema's key set equals the table's column names;
  a `NOT NULL` column refuses `null` and a nullable one accepts it; an enum
  column refuses a value outside its list. A throwaway table with a new
  column is derived in the test, showing a column added to `schema.ts`
  reaches the server schema without anyone editing `payload-schemas.ts`.
- **Writer conformance.** Every row the demo-data loader writes, read back
  through the phone's `toPayload`, passes `validatePayload`; so does every
  row the ShotLog and WebShooter importers and the JSON-export import
  write. The web builders' rows assert the same through
  `app/src/db/queries/web-*.test.ts`. The ammo and firearm screens turn
  typed text into numbers with parsers held to the column's wire rule:
  integers only as digits within a safe integer (`parseQuantity`,
  `parseMaintenanceInterval`), reals only within `REAL_MIN`..`REAL_MAX`
  (`parseMeasure`), each with its own tests. A screen that parsed with
  `Number()` alone would store `12.5` or `1e20` and have the row refused.
  Two screens still do: series length on New Session and fält station
  points (#837, §10).

### 2.6 Out of scope

- **Foreign keys.** The server does not check that a referenced parent row
  exists (C14). FK columns are only shape-checked (§2.1).
- **Generated columns** on `sync_rows` (issue item 3) are not added. They
  come only when the server must query a field, such as a quota by firearm.
- Mirroring each synced table as a typed D1 table (rejected in the issue).
- Re-validating rows already stored. Pull is unchanged.
- Text length limits (`TEXT_LIMITS`) on the server (C12).

## 3. Key choices

Each choice has a recommendation and the alternative it rules out.

- **C1 Schemas derived by drizzle-zod from the Drizzle tables in `shared/`.**
  _Maintainer's decision, 2026-10-13._ No second copy of the columns to keep
  in step, which #727 showed is a real cost. The price: the tables move to
  the Apache-2.0 `shared/src/sync/` (ADR 0021), and `shared/` depends on `drizzle-orm` (the version
  `app/` and `backend/` already use) and `drizzle-zod@0.8.3` (Apache-2.0, no
  runtime dependencies). The alternative was hand-written zod schemas plus a
  drift test.
- **C2 No runtime validation on the phone or the web before push.** The
  server is the one authority, and test-time conformance (§2.5) covers the
  writers. Alternative: validate in `runPush` and hold an invalid row
  locally. That saves a round trip, but it is a second place where the rule
  runs, ships drizzle-zod in the app bundle, and leaves the row in the same
  end state.
- **C3 The phone clears a refused entry, counts it separately and shows the
  count.** Alternatives: (a) count only, no UI. The refusal is then silent,
  which is what this issue exists to end. (b) Keep the entry queued. The
  refusal is final (recorded for idempotency), so a resend only acks
  `duplicate`, and the stuck entry would spin `MAX_PUSH_ITERATIONS` in every
  cycle. The count is a UI change, so `docs/manual/` is updated in the same
  PR.
- **C4 The ack carries only `reason: 'invalid_payload'`.** Alternative: add
  the zod issues to `PushAck`. That is a wire-shape change for no client
  that would act on it. The server log has the paths.
- **C5 Strict keys: every column required, no unknown column accepted.**
  Pre-1.0, rule 8 applies: the server and both clients ship from one repo,
  and no compatibility path is built for a newer client. The cost is a
  window at every column change of a synced table, in either deploy order:
  a phone built with the new column, talking to an older server, has every
  push of that table refused and cleared, and so does a phone that has not
  updated yet, talking to a server that has the new column (its rows lack
  the key, or carry a dropped one). Deploy order cannot close the window,
  only choose whose changes fall in it. `docs/release.md` step 0 therefore
  says "deploy the Worker first, then update every phone", which keeps
  updated phones syncing and leaves the stragglers refused until they
  update. The web has a longer tail: its edits spread the row it pulled
  from the server (`bulk-edit.ts`, `session-edit.ts`, the firearm
  round-count moves), so after a column change every web edit of a row
  stored before it is refused until a phone pushes that row again with the
  new column set. Q6 asks whether to narrow both. Alternatives: (a) `.passthrough()` for unknown keys. That
  lets a misspelled key (`startedAt`) through, and on apply the misspelled
  key is dropped and the row's `NOT NULL` column is left unset — the wedge.
  (b) `.strip()`. That silently loses the newer column for every device.
- **C6 A refusal is a per-change `rejected` ack, decided inside the push
  batch.** Alternative: a whole-request `400 invalid_payload`, like
  `setting_not_synced`. One bad row then blocks every good row behind it in
  the outbox, on every cycle: the wedge moves from pull to push.
- **C7 `toISOString()` shape for `created_at`, `updated_at`, `started_at`
  and `performed_at`**: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`, and
  `new Date(s).toISOString() === s`, so `2026-02-30T…` fails. Every writer
  produces these with `toISOString()` (the phone's `nowIso`, the
  maintenance picker's `Date`, the importers, the web builders); the
  conformance tests pin it. User-typed dates (`decided_on`, `valid_until`,
  `purchased_on`) stay strings. So does `firearms.archived_at`, which #814
  added after this spec: the phone writes it with `toISOString()`, but the
  JSON-export import keeps a file's value as it is, so it is not held to
  the shape here. The JSON-export import stores a file's `startedAt` and
  maintenance `performedAt` as `toISOString()`, and its format requires
  both to be UTC instants. Alternative: any string `Date.parse`
  accepts, which admits local-time strings and breaks "UTC in storage".
- **C8 Ids and FK columns are non-empty strings.** _Changed from the first
  draft's UUID rule._ A non-UUID id does not break apply (the columns are
  `TEXT`), the real-data audit that was to justify the stricter rule could
  not run (Q3), and a JSON-export import keeps the ids of the file it reads.
  Alternative: UUID (any version), which a later change can adopt once an
  audit shows every stored row conforms.
- **C9 Integer flags are exactly `0 | 1`, and `is_own` is a boolean.** This
  matches what the writers send. Alternative: any integer. A builder writing
  `true` into `is_sighter` would then pass, and the result depends on how
  expo-sqlite binds a boolean.
- **C10 The envelope must agree with the payload** (`id` and `updated_at`).
  A payload whose `id` differs from `rowId` is stored on the server under
  `rowId`, but `applyOne` upserts it as `payload.id` on the phone, so the
  two disagree about which row it is.
- **C11 `tombstoned` outranks `invalid_payload`.** The phone acts on
  `tombstoned` by writing the tombstone locally, and the row is gone either
  way. Alternative: invalid first; the phone would never learn the
  tombstone (`shadow.ts`).
- **C12 `settings.value` must be JSON text; per-key value shapes and
  `TEXT_LIMITS` are not enforced.** The web already reads an unexpected
  value as unset (`account-settings.ts`), and `MAX_PAYLOAD_BYTES` bounds
  size. A ShotLog import may hold longer notes than the limits.
- **C13 The `CHECK` is added to `0000_sync_init` in place.** _Changed from
  the first draft's `0003` rebuild._ No D1 has run `0000` (§1), and rule 8
  says pre-1.0 changes the format in place. If a D1 had run it, it would
  simply lack the backstop; the route check above it is unaffected.
- **C14 No foreign-key check on the server.** A child can legitimately reach
  the server before its parent (a later push batch, a parent tombstoned in
  between), and the phone already stores orphans, so a refusal would lose
  data that is harmless today. Recorded as a known limit; see Q4.

## 4. Scenarios

User `u`. `F` is a valid full `firearms` payload for row `f1`, `S` a valid
full `sessions` payload, as the phone's `toPayload` produces them. Status and
reason refer to the ack for that change.

```gherkin
Feature: the server stores only rows every device can apply

  Scenario: P1 a valid row of every synced table is applied
    Given one valid payload per table in SYNC_TABLE_NAMES
    When they are pushed in APPLY_ORDER
    Then every ack is applied, and a pull returns each payload unchanged

  Scenario Outline: P2 a malformed row is refused and stores nothing
    Given an empty account u
    When a push sends F with <mutation>
    Then the ack is rejected, reason "invalid_payload", no seq
     And sync_rows has no row f1, last_seq is unchanged
     And the idempotency record is rejected/invalid_payload
    Examples:
      | mutation                                         |
      | make: null                       (NOT NULL)      |
      | make removed                     (missing key)   |
      | caliber removed                  (missing nullable key) |
      | weapon_type: "shotgun"           (enum)          |
      | round_count: 1.5                 (integer)       |
      | round_count: "12"                (type)          |
      | is_own: 1                        (boolean)       |
      | created_at: "2026-08-01 10:00"   (timestamp)     |
      | updated_at: "2026-02-30T00:00:00.000Z" (date)    |
      | id: "f2"                         (id ≠ rowId)    |
      | extra key "colour": "black"      (unknown key)   |
      | deleted_at set on a live change                  |
      | payload is an array / a string / a number        |

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
    Given device A has f1 queued with make: null
    When A runs a sync cycle against the real Worker
    Then the cycle result has invalid = 1, rejected = 0
     And A's outbox no longer holds f1, A's f1 is unchanged
     And device B's pull never receives f1
    When A edits f1 to a valid row
    Then the next cycle pushes it under a new clientChangeId and B receives it

  Scenario: P8 the web sees the refusal
    Given a web push whose series payload is invalid
    When pushChanges runs against the real Worker
    Then the outcome is partlyRejected with that series and reason "invalid_payload"

  Scenario: P9 a column added to a table reaches the server schema
    Given a Drizzle table with one more column than another
    When both are derived
    Then the larger schema requires the new key, with no edit to payload-schemas.ts

  Scenario: P10 the CHECK refuses non-JSON written past the route
    Given SYNC_MIGRATIONS applied
    When sync_rows is written directly with payload "not json"
    Then D1 refuses the write; with payload NULL it is accepted

  Scenario: P11 the existing tolerance survives
    Given a pulled row carrying a column this build does not know
    When the phone applies it
    Then the column is dropped and the rest applied, as today

  Scenario: P12 the refusal count reaches the screen
    Given two refused events, a succeeded cycle whose result has invalid = 2,
      then one more refused event and a failed cycle
    When the status reducer folds them
    Then refusedCount is 3: each refusal counts once, and no cycle outcome
      adds or removes one
     And Account & Sync shows the line with the count, and no line at 0
```

**Falsification.** Each scenario is RED before its code, with these
exceptions: P6 and P11 already pass on `main`. They are regression armour,
and each is proved able to fail with a throwaway mutant (validate tombstones;
stop dropping unknown columns in `applyOne`). For P2, each row of the table is
its own test, so a schema that skipped a check would turn exactly one row
green.

## 5. Must NOT

- N1 `PROTOCOL_VERSION` stays 1. `PushAck`, `ChangeRow`, request shapes and
  status codes are unchanged; only a new `reason` value appears (rule 8).
- N2 The pull path is unchanged: `pullTablePage`, the pull route and
  `applyOne`'s handling of unknown columns.
- N3 The atomicity guarantees hold: scenarios C1–C9 of
  `sync-push-atomicity-spec.md`, in `backend/test/sync-concurrency.spec.ts`,
  pass with their assertions unchanged.
- N4 No test assertion is weakened. Existing backend tests push partial
  payloads (`{ make: 'Anschutz' }`), which strict validation refuses. Their
  payload fixtures are replaced by a full-row builder; their assertions do
  not change, and the evidence lists every touched test file.
- N5 No dependency beyond drizzle-zod (approved) and `drizzle-orm` in
  `shared/` (already in the workspace at the same version).
- N6 No value or id from a payload appears in a log line or an ack.
- N7 The 413 and `setting_not_synced` refusals keep their order and shape.
- N8 No foreign-key or generated-column logic is added.
- N9 The phone and web bundles do not gain drizzle-zod: the module is not in
  the `@shotledger/shared` barrel.

## 6. Failure model

| Failure                                                                                   | Layer that catches it                                                                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Schema stricter than a real writer: a good row is refused and lost to sync                | §2.5 writer conformance (demo data, importers, web builders) and the screens' integer parsers; P1             |
| Schema looser than the apply path: a wedging row is stored                                | P2 per-mutation rows; Stryker on `payload-schemas.ts`; properties                                             |
| Schema drifts from `schema.ts` after a later column change                                | Impossible by construction (C1); P9 and the derivation test pin it                                            |
| A new flag column named outside the `is_*` rule                                           | the pinned per-table flag and counting-integer sets (§2.1)                                                    |
| A refusal consumes a seq or half-writes                                                   | P2/P3 `last_seq` assertions; atomicity C1–C9 unchanged                                                        |
| A refusal is silent on the phone                                                          | P7 `invalid` count; `onRefused` engine and controller tests; P12 reducer test; the Account & Sync render test |
| Release skew (C5): a phone, the web's stored rows and the server on different column sets | `docs/release.md` step 0; known limit in either order (Q6)                                                    |
| A hostile payload (prototype keys, huge arrays, deep nesting)                             | the 16 KiB cap; strict keys; adversarial tests                                                                |
| Validation cost pushes a 500-change push past Worker CPU                                  | a Node-side sanity bound only (500 session rows under 1 s); known limit (§10)                                 |
| The CHECK refuses a row the route accepted                                                | P1 (every table through the real D1 with the CHECK)                                                           |

## 7. Gauntlet

| Layer          | How                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root gates     | `pnpm check` (types, lint, format, coverage at 100% on the gauntlet modules, app jest)                                                                                     |
| Backend suite  | `cd backend && npx vitest run --testTimeout=60000`, with P1–P8 and P10 in `backend/test/sync-payload-validation.spec.ts`                                                   |
| Mutation       | `pnpm mutation` (Stryker) over `payload-schemas.ts`, inside its `shared/src/sync/*.ts` glob; `scripts/manual-mutation-sync-push.mjs` gains the `?valid` and reason mutants |
| Property-based | fast-check: any row a generator draws from the derived column kinds passes; any single-column corruption fails                                                             |
| Real execution | `sync-client.spec.ts` drives the real engine against the real Worker (P7); `direct-push` against the real Worker (P8)                                                      |
| Suite health   | backend suite with `--sequence.shuffle`                                                                                                                                    |
| Adversarial    | 500 changes of the fullest row; `__proto__`/`constructor` keys; 10k-element arrays and deep nesting inside the 16 KiB cap                                                  |

## 8. Real-data audit

The first draft planned a throwaway audit over the maintainer's real-data
phone database (Q3). It did not run: the overnight run had no access to that
database, and the maintainer has since said the phone's ShotLedger data is
disposable (2026-10-13). Writer conformance over demo data and the importers
stands in for it, and C7 and C8 were chosen so that the audit would not be
needed to keep a real row from being refused: C8 was relaxed, and C7 covers
only columns every writer fills with `toISOString()`.

## 9. Setup plan

- **Isolation:** the branch `feature/issue-697-drizzle-zod-mmc9le` (PR
  #813, which carries the schema move and this change). Dependencies
  installed there; the gauntlet runs there.
- **Git:** Conventional Commits, `git commit -s`, explicit paths only.
- **Files:**
  - `shared/src/sync/schema.ts` (the tables) and `shared/src/sync/tables.ts`
    (the map, moved from `sync-store.ts`); `eslint.config.mjs`, ADR 0021
  - `shared/src/sync/payload-schemas.ts`, `payload-schemas.test.ts`,
    `merge.ts` (`REJECTED_INVALID_PAYLOAD`)
  - `backend/src/routes/sync.ts`, `backend/src/db/queries.ts`,
    `backend/src/db/migrations.ts`, `backend/migrations/0000_sync_init.sql`
  - `backend/test/sync-payload-validation.spec.ts`, a full-row builder in
    `backend/test/rows.ts`, and fixture edits in the backend specs that push
    partial rows (N4)
  - `shared/src/sync-client/engine.ts`, `status.ts` and their tests
  - `app/src/db/queries/sync-store.ts`, the conformance tests in
    `app/src/db/`, `app/src/app/account.tsx`, `app/src/i18n/{en,sv}.json`
  - `docs/manual/` (the refusal count, en and sv), `docs/release.md`
    (deploy order, C5), `scripts/manual-mutation-sync-push.mjs`
  - `docs/specs/sync-payload-validation-evidence.md`
- **New dependencies:** `drizzle-zod@0.8.3` in `shared/` (C1, approved).

## 10. Risks

- **A writer this spec did not find.** A write path outside the conformance
  tests that sends a partial row or a local-time timestamp would have its
  rows refused and cleared. The refusal count (C3) makes it visible, and the
  row stays on the phone unless another device changes it; an edit after
  the fix pushes it again. Two are known: New Session's series length takes
  `1e20`, and a fält station's points take any run of digits (#837). Both
  are left to #837, which touches `shared/src/scoring/` and needs its own
  spec.
- **drizzle-zod's mapping changes on upgrade.** A Renovate bump could widen
  or narrow a type. The derivation test and P2 pin today's mapping, so a
  change in it fails CI.
- **Local is not production.** `json_valid` and `CHECK` enforcement are
  probed in the Workers pool (P10), not on a deployed D1.
- **Worker CPU is not measured.** The timing test runs `validatePayload` in
  Node on a developer machine and bounds 500 session rows at 1 s. It catches
  an order-of-magnitude regression, not a breach of the Worker's CPU limit,
  which only a deployed Worker under load would show.
- **A refused change can be overwritten.** It stays on the phone only until
  a pull brings a newer change to the same row (§2.3).

## 11. Questions for the maintainer

- **Q1** Approve C2–C14 as implemented, in particular C5 (strict keys plus a
  deploy-order rule), C3 (a visible refusal count) and C8 (ids only
  non-empty, not UUID)?
- **Q2** _Answered from the code:_ no D1 has run `0000` (§1), so C13 edits
  it in place. Correct?
- **Q3** _Not run_ (§8).
- **Q4** Should foreign-key integrity get its own issue, or stay a known
  limit until the phone enforces foreign keys itself?
- **Q5** Move the Drizzle tables into the Apache-2.0 `shared/src/sync/` (ADR
  0021), or keep them AGPL and validate against a generated zod-only column
  list instead? Asked on the #697 thread; the branch implements the first.
- **Q6** Strict keys (C5) refuse a not-yet-updated phone's rows after the
  server gains a column, whatever the deploy order, and refuse web edits of
  any row stored before the change until a phone pushes that row again.
  Accept that pre-1.0 (today: one user, phones updated together), or let
  the server accept a row that omits a nullable or defaulted column it
  knows, so that adding such a column refuses nothing on either path? A
  rename, a drop, or a new `NOT NULL` column without a default still
  refuses either way. The branch implements the first.

## Revisions

- **Revision 1 (2026-10-13), after the #727 schema cleanup and the
  maintainer's drizzle-zod decision.** C1 hand-written schemas → drizzle-zod
  over tables moved to `shared/` (PR #813); the drift test becomes a
  derivation test (§2.5, P9). C7 adds `performed_at` (every writer uses
  `toISOString()`); `external_synced_at` was dropped by #727. C8 UUID →
  non-empty string (§8). C13 new `0003` migration → edit `0000` in place
  (no D1 has run it). P2 gains "missing nullable key" and non-object
  payloads; P12 added for the reducer. N5 now names the approved dependency;
  N9 added. The real-data audit (§8) did not run.
- **Revision 2 (2026-10-14), during implementation.** Lint found that the
  Worker may compile only the Apache-2.0 `shared/src/sync/` and that it may
  import only zod (ADR 0017), so the tables move there instead of
  `shared/src/db/` and `drizzle-orm`/`drizzle-zod` are allowed in it (ADR
  0021, **awaiting the maintainer**: Q5). Writer conformance (§2.5) found one
  writer outside C7: a JSON-export import stored the file's `startedAt`
  verbatim, and `z.iso.datetime()` accepts whole seconds; the import now
  stores `toISOString()`. The engine counts a replayed refusal (a
  `duplicate` ack carrying `invalid_payload`) as `invalid` too, since the
  first ack may never have reached the phone. N6 gains a test of the log
  line.
- **Revision 3 (2026-10-14), after two verification rounds.** A refusal is
  reported as its entry clears (`onRefused` → a `refused` status event), not
  only in the cycle result, so a later failing batch cannot lose it (P12
  rewritten). The ammo screens' measure fields are held to the real column's
  range (`parseMeasure`, `REAL_MIN`/`REAL_MAX`). §2.1 states drizzle-zod's
  real bound; §2.5 drops a claim that the `shared/` builders' tests call
  `validatePayload` (the web-builder conformance lives in the app's
  `web-*.test.ts`). C5 describes skew in both directions and asks Q6; §2.3
  says a refused change can be replaced by a pull.
- **Revision 4 (2026-10-14), after the third verification round.** The
  JSON-export import stores maintenance `performedAt` as `toISOString()`,
  and the export format requires it to be a UTC instant, as `startedAt`;
  the conformance test now applies the file's records too. C5 and Q6 name
  the web's tail: web edits spread the stored row, so a row stored before a
  column change is refused on edit until a phone pushes it again. §2.1
  states `validatePayload`'s real signature. The backend P2 date row now
  agrees with its envelope, a settings row with non-JSON `value` is tested
  through the route, and the manual mutation script gains that mutant.
