# M7 CSV export/import — SPEC (old-coder)

Status: **autonomous run — spec approval: not obtained.** Written and
implemented in the same pass per the M7 task brief ("old-coder MANDATORY for
shared/csv ... autonomous run noted"). Confidence claim is downgraded
accordingly: the correlation-breaking human review did not happen before
code was written. Treat this file as the after-the-fact artifact for review.

Tier: **3 (high stakes — data loss).** A lossy CSV round trip silently
deletes a shooter's history.

## Scope

`shared/src/csv/` (pure, DB-free — matches `shared`'s existing shape: no
expo-sqlite dependency there). Two boundaries:

- **shared/src/csv**: RFC 4180 codec, row schema + zod validation, pure
  serialize (domain objects → CSV text) and pure parse+plan (CSV text →
  validated rows → grouped sessions → a dry-run plan against an
  `ExistingIndex` the caller supplies). No I/O, no DB, no expo APIs.
- **app/src/db/csv/**: glue. Reads the DB into the plain objects `shared`
  expects, calls `shared`, then executes the plan (upsert) against the DB
  inside a transaction. Owns file I/O (expo-file-system) and the share
  sheet (expo-sharing). This layer is routine app work, not old-coder scope.

## Column set (extends the documented §6.8 set for the schema as it now

stands — sessions carry program_id/competition_level/is_championship/
competition_name/weapon_group/shooter_class/extra_rounds; series carry
is_sighter/is_final; shots carry value_tenths/is_inner_ten)

One row per shot, plus a defined representation for shot-less structures.
24 columns, in this order:

```
session_id, session_name, session_type, discipline_id, program_id,
competition_level, is_championship, competition_name, weapon_group,
shooter_class, firearm, ammo_lot, started_at, location, notes,
decimal_scoring, extra_rounds, tags, series_position, is_sighter,
is_final, shot_position, value_tenths, is_inner_ten
```

Notes:

- `is_inner_ten_decimal` is **excluded** — schema marks it DEPRECATED,
  nothing writes it, it would only be noise.
- `firearm` is `"{make} {model}"` (e.g. `"Pardini SP"`); `ammo_lot` is the
  lot's `label`. Import matches existing firearms/lots by this exact
  string (case-sensitive), creating a bare firearm/lot (make+model split
  on the first space, or a lot with only `label` set) when no match
  exists — matching the documented "referenced by name, creates missing"
  behavior. Empty string = no firearm/lot on that session.
- `tags` is `|`-joined tag names (RFC 4180 quoting handles any `|` inside
  a name — none of the seed tags contain one, but the codec doesn't
  assume that).
- Booleans (`is_championship`, `decimal_scoring`, `is_sighter`,
  `is_final`, `is_inner_ten`) serialize as `1`/`0`; the parser accepts
  `1`/`0`/`true`/`false` (case-insensitive) on import for hand-edited
  files.
- Session-level columns (everything through `tags`) repeat on every row
  belonging to that session — flat/denormalized, as RFC 4180 has no
  nesting.

### Row kinds (shot-less structures)

A session's rows are generated as follows:

1. **Shot row** — one per shot: `series_position`/`is_sighter`/`is_final`
   from the shot's series, `shot_position`/`value_tenths`/`is_inner_ten`
   from the shot.
2. **Empty-series row** — a series with zero shots: `series_position`/
   `is_sighter`/`is_final` set, `shot_position`/`value_tenths`/
   `is_inner_ten` blank.
3. **Session-only row** — a session with zero series (e.g. an
   `extra_rounds`-only plinking session): all of `series_position`
   through `is_inner_ten` blank. Exactly one such row per shot-less
   session (never zero rows for a session — every session is
   represented).

A session with both series and shots never emits a session-only row (its
shot/empty-series rows already carry the session-level columns).

## Round-trip losslessness (the property this spec exists to guarantee)

**Claim:** `import(export(state)) ` reproduces, for every session, the same
`value_tenths`/`is_inner_ten` sequences per series (in position order), the
same `is_sighter`/`is_final`/`extra_rounds`, and the same session-level
scoring inputs (`discipline_id`, `program_id`, `competition_level`,
`weapon_group`, `shooter_class`, `decimal_scoring`) — so every
`shared/scoring` and `shared/compliance` statistic computed over the
imported state equals the statistic computed over the original state.

**Not claimed:** identical row/series/shot **ids** after a merge into a
non-empty DB (ids are regenerated unless the session id already exists and
the row is treated as a match), identical `created_at`/`updated_at`
timestamps, or preservation of soft-deleted rows (export only emits
non-deleted data, matching every existing query's `deleted_at IS NULL`
filter).

**Session id handling:** on import, a session row's `session_id` is
reused as the new row's primary key **only if no existing session with
that id survives non-deleted in the target DB**; otherwise it is treated
as a match (session fields updated in place, rows re-synced) per the dry
run choice. Series/shot ids are always freshly generated on import — no
CSV column exposes them, so nothing outside the file could reference the
old ones.

## Behaviors (test list)

RFC 4180 codec (`csv-codec.ts`):

1. `stringifyRows` quotes a field containing a comma, a quote (doubled),
   or a newline; leaves a plain field unquoted.
2. `parseCsv` round-trips arbitrary field content including embedded
   commas/quotes/`\r\n`/`\n`, a header row, and CRLF or LF line endings.
3. `parseCsv('')` → zero data rows, no throw.
4. A field that is only whitespace parses as-is (not trimmed) — only
   structural CSV whitespace (outside quotes) is insignificant.

Export (`export.ts`):

5. A session with 2 series (2 shots + 1 shot) emits exactly 3 shot rows,
   all sharing `session_id`/session-level columns.
6. A session with one empty series emits exactly 1 empty-series row.
7. A session with zero series and `extra_rounds: 5` emits exactly 1
   session-only row with `extra_rounds=5` and every position/value/
   inner-ten column blank.
8. A session with zero series and no `extra_rounds` still emits exactly 1
   row (every session appears at least once).
9. `firearm`/`ammo_lot`/`tags` render as configured strings; a session
   with no firearm/ammo/tags renders those columns empty.
10. Output round-trips through `parseCsv` back to the same header + row
    count.

Import parsing + validation (`import.ts`):

11. A well-formed row parses into a typed `CsvRow`; `value_tenths`
    outside 0–109 is a row-level error, not a thrown exception.
12. An unparseable boolean, a missing required column (`session_id`,
    `session_type`, `discipline_id`, `started_at`), or a `session_type`
    outside the enum is a row-level error naming the row number and
    column.
13. Two rows with the same `session_id` but conflicting session-level
    values (e.g. different `session_name`) is a row-level error on the
    second row — session identity must be internally consistent within
    one file.
14. `groupRowsIntoSessions` groups by `session_id`, orders series by
    `series_position` then shots by `shot_position`, and rejects (row
    error) a duplicate `(series_position, shot_position)` pair within a
    session.
15. A session-only row (blank series_position) mixed with shot rows for
    the same `session_id` is a row-level error (ambiguous: is this
    session shot-less or not).

Dry-run plan (`plan.ts`):

16. Given an `ExistingIndex` with no matching session/firearm/lot/tag
    names, every session is planned `create`, every firearm/lot/tag
    referenced is planned `create`.
17. A session whose id is present in `ExistingIndex.sessionIds` is
    planned `update` (match), not `create`.
18. A firearm/lot/tag name present in the index is planned `reuse`
    (matched), not `create` — case-sensitive exact match only.
19. The plan is a pure function of `(groups, index)` — same inputs, same
    output (no randomness/time in the plan itself; timestamps are the
    caller's job at apply time).

Property-based (fast-check, already a devDependency):

20. **Round trip**: for a generated `SessionExport[]` (arbitrary sessions/
    series/shots within schema-legal ranges), `parseCsv(stringifyRows(
buildCsvRows(sessions))) ` regrouped and replayed against an
    `ExistingIndex` built from nothing reproduces, per session, the same
    ordered `(valueTenths, isInnerTen)` list per series, the same
    `isSighter`/`isFinal`/`extraRounds`, and the same scoring-input
    session fields as the input.

App-level round-trip through the query layer (`app/src/db/csv/*.test.ts`,
not shared — needs expo-sqlite/better-sqlite3):

21. Seed a test DB (`createTestDb`) with firearms, ammo, tags, sessions
    with a mix of scored series, an empty series, a sighter/final series,
    and an extra-rounds-only session. Export via the app glue, wipe every
    table, import the export, and assert `listAllStatsSeries` fed through
    `computeStats` (or the exact statistic set M5 exposes) is
    **identical** before and after, plus `sumExtraRounds`/
    `countVolumeRounds` identical.

## What this must NOT do

- Must not silently drop a row on a parse error — row errors are
  collected and returned, never thrown past the dry-run boundary (the UI
  needs the full list to show the report).
- Must not apply (upsert) anything during dry-run — `buildDryRunPlan` has
  no DB access at all (it's in `shared`, which has none to begin with).
- Must not weaken `value_tenths` range validation (0–109, matching
  `addShot`'s existing `RangeError` guard) to "accept and clamp".

## Setup

- No new dependencies. RFC 4180 codec hand-rolled (~80 lines) rather than
  add a CSV library not in §2's fixed list — small, fully covered by
  tests, and the property test is exactly the kind of check that catches
  a hand-rolled parser's edge cases.
- fast-check is already a root devDependency (`stryker`/mutation-adjacent
  tooling); used here for the round-trip property, nothing new to
  install.
- Files added, by path:
  - `shared/src/csv/csv-codec.ts` (+ `.test.ts`)
  - `shared/src/csv/types.ts` (row schema/zod)
  - `shared/src/csv/export.ts` (+ `.test.ts`)
  - `shared/src/csv/import.ts` (+ `.test.ts`)
  - `shared/src/csv/plan.ts` (+ `.test.ts`)
  - `shared/src/csv/round-trip.property.test.ts`
  - `shared/src/csv/index.ts`
  - `app/src/db/csv/build-export.ts`, `apply-import.ts` (+ tests)
  - `app/src/db/csv/round-trip.test.ts`
- Isolation: working directly on `feat/m7-release` (already a dedicated
  branch per the M7 task's git instructions) — no separate worktree;
  blast radius is one new module plus its glue, not the wider tree, and
  `pnpm check`/`pnpm coverage` run against the same tree that lands.
- Git: checkpoint commit after this spec, then per GREEN/REFACTOR step,
  per the project's commit conventions (Conventional Commits, DCO `-s`).

## Gauntlet plan (Tier 3, scaled to this repo's existing layers)

| Layer                    | Command                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit + property suite    | `pnpm vitest run shared/src/csv` (then full `vitest run`)                                                                                                                                                                                                                                                                                                                                                         |
| Types                    | `pnpm typecheck`                                                                                                                                                                                                                                                                                                                                                                                                  |
| Lint                     | `pnpm lint`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Coverage (changed lines) | `pnpm coverage` — repo threshold is 100% on `shared/src/{scoring,disciplines}`; `csv/` isn't in that glob, so changed-line coverage is asserted by eyeballing the vitest coverage table for `shared/src/csv/**` in the same run (100% target, recorded in EVIDENCE) rather than a hard `--fail-under`, since the repo's own coverage gate doesn't cover this directory — noted as a real gap, not silently closed |
| Mutation                 | manual — no Stryker config for `csv/`; 5 hand-mutants against `csv-codec.ts`/`plan.ts` (the two riskiest: quoting logic, match-vs-create branching), suite must kill all 5                                                                                                                                                                                                                                        |
| App round-trip           | `cd app && pnpm exec jest --passWithNoTests` (covers `app/src/db/csv/round-trip.test.ts`)                                                                                                                                                                                                                                                                                                                         |
| Real execution           | manual: run the round-trip test's fixture through the actual `stringifyRows`/`parseCsv` once outside the test harness (a scratch script) and print byte length + row count, to confirm it isn't only passing inside mocks                                                                                                                                                                                         |

Failure modes considered (Tier 3 failure model):

- Lossy quoting (comma/quote/newline in a name) → codec round-trip test (#2) + property test (#20).
- Silent row drop on validation error → row errors always returned, never thrown (tested #11/#12).
- Duplicate-id collision on import into non-empty DB → match-not-create branch (#17), app-level test seeds one pre-existing session with a colliding id.
- Partial apply on error mid-transaction → app glue wraps apply in one DB transaction (better-sqlite3/expo-sqlite both support `db.transaction`); tested by forcing an error on the last session and asserting nothing committed.
- Ordering drift (series/shots re-ordered by SQL scan) → explicit `series_position`/`shot_position` sort on both export and import grouping (#14), asserted by the property test using non-sequential input order.
