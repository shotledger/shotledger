# Sync payload validation on push — evidence

Spec: `docs/specs/sync-payload-validation-spec.md` (issue #697, PR #813).

**Spec approval: partly obtained.** C1 (drizzle-zod) is the maintainer's
decision of 2026-10-13. C2–C14 and Q1–Q6 are **not approved (autonomous
run)**: the spec was revised and implemented overnight while the maintainer
was away, so the spec is the artifact to review after the fact. Q5 (ADR 0021,
moving the Drizzle tables into the Apache-2.0 `shared/src/sync/`) is the
precondition of the whole branch. This PR does not merge until the
maintainer approves.

- **Source state:** `7bc160a` on `feature/issue-697-drizzle-zod-mmc9le`,
  with `main` at `31195e0` merged in (`c46c9d8`): #814's
  `firearms.archived_at`, #819's derived maintenance counter and #812's
  `maintenance_interval_months` are ported to `shared/src/sync/schema.ts`,
  which matches `main`'s tables byte for byte. Then the round-3 fixes.
- **Later merge:** `main` at `3357be5` merged in (`be3c731`): no schema
  change to port; #794's ammo-lot merge spec fixtures filled to whole rows
  (N4). Re-run there: `pnpm check` exit 0 (vitest 237 files, 4324 tests;
  app jest 970), backend 29 files, 263 tests, exit 0. The shuffle, Stryker
  and manual-mutation rows below were not re-run.
- **Toolchain:** Node 24.21.0, pnpm 12.11.2, vitest 5.0.3,
  `@cloudflare/vitest-pool-workers` (backend), Stryker 10.0.0 with the
  vitest runner, fast-check, jest-expo (app). `drizzle-orm` 0.45.4,
  `drizzle-zod` 0.8.3, `zod` 4.6.5 in `shared/`.
- **Entry point:** `pnpm check` from the repo root, then
  `cd backend && npx vitest run --testTimeout=60000`, then
  `node scripts/manual-mutation-sync-push.mjs` and
  `npx stryker run --mutate 'shared/src/sync/payload-schemas.ts,shared/src/sync/tables.ts,shared/src/sync/protocol.ts,shared/src/sync-client/engine.ts,shared/src/sync-client/status.ts,shared/src/json-export/types.ts'`
  and `pnpm mutation:schema`.

## Spec → tests

| Scenario                                   | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 a valid row of every table is applied   | `backend/test/sync-payload-validation.spec.ts` "P1 …" (every table through the real D1 with the CHECK); `payload-schemas.test.ts` "P1 accepts F and S" and the per-table `fullRow` cases                                                                                                                                                                                                                                                                                                 |
| P2 a malformed row is refused              | backend "P2 …": one test per row of the Examples table (15 tests; the impossible-date row agrees with its envelope); "a settings row whose value is not JSON" through the route; `payload-schemas.test.ts` "P2 a malformed firearm is refused" and the per-column fresh-derivation block                                                                                                                                                                                                 |
| P3 one bad row does not hold the good ones | backend "P3 …" (consecutive seqs around the refusal); "a verdict belongs to its change, not to its clientChangeId" (round-1 F7)                                                                                                                                                                                                                                                                                                                                                          |
| P4 a refusal replays as a duplicate        | backend "P4 …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P5 a tombstone outranks an invalid payload | backend "P5 …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P6 a tombstone is never payload-validated  | backend "P6 …"; `payload-schemas.test.ts` "P6 never checks a tombstone"                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P7 the phone counts and clears a refusal   | `backend/test/sync-client.spec.ts` "P7 …" (real engine, real Worker, two devices); `engine.test.ts` §2.3 tests, including "counts every invalid_payload refusal in a push, alongside an applied change" (round-1 F6) and the replayed refusal                                                                                                                                                                                                                                            |
| P8 the web sees the refusal                | backend "P8 …" (`pushChanges` against the real Worker)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P9 a new column reaches the schema         | `payload-schemas.test.ts` "P9 a column added to a table reaches its schema with no edit here"                                                                                                                                                                                                                                                                                                                                                                                            |
| P10 the CHECK refuses non-JSON             | backend "P10 …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P11 unknown pulled columns are dropped     | `app/src/db/queries/sync-store.test.ts` "drops columns this build does not know and payloads with no id" (existing)                                                                                                                                                                                                                                                                                                                                                                      |
| P12 the refusal count reaches the screen   | `status.test.ts` P12 (the reducer counts `refused` events, no cycle outcome changes the sum); `engine.test.ts` "reports each refusal as it clears, even when a later batch fails the cycle" and "reports a replayed refusal and not an applied or rejected change"; `sync-controller.test.ts` "counts each refusal the engine reports, though the cycle fails after it"; `app/src/features/account/account-screen.test.tsx` (the line with its count, and none at 0)                     |
| §2.1 flag and integer classification       | "pins the 0/1 flag columns of every table"; "pins the counting (non-flag) integer columns of every table" (round-1 F4)                                                                                                                                                                                                                                                                                                                                                                   |
| §2.5 writer conformance                    | `app/src/db/sync-conformance.test.ts` (demo data; a JSON-export import applied with its records, whole-second `startedAt` and `performedAt`); importer tests and `shared/src/json-export/import.test.ts` M6 (a maintenance date must be a UTC instant); `app/src/db/queries/web-*.test.ts` for the web builders; `app/src/features/ammo/quantity.test.ts` (`parseQuantity`, `parseMeasure`) and the `parseMaintenanceInterval` tests; "a real column accepts exactly REAL_MIN..REAL_MAX" |

**RED.** Round 3's fixes were RED first: the conformance test with the
file's records and whole-second `performedAt` reported
`maintenance_events:performed_at:custom`, the import test took a date-only
and an offset `performedAt`, and the new backend date and settings rows
each failed against a throwaway mutant (round-trip check removed; settings
skipped in the route). Round 2's fixes were RED first: the engine, reducer and controller
refusal tests failed (3 failed in shared, 1 in the controller with the
wiring removed), the account render test failed with `> 0` changed to
`>= 0`, and the `parseMeasure` and real-bound tests failed before the code.
Before the route code existed, the backend file failed 19 of 26
(every P2 row, P3, P4, P8; `red-route`), P6 was proved able to fail with a
throwaway "validate tombstones" mutant, P7 failed on the missing `invalid`
count, and P10 failed before the `CHECK` was added. After round 1, the F7
test failed against the clientChangeId-keyed route (1 failed), and the F6
test killed the `invalid = 1` mutant before the engine was restored. P11
passes on `main` and is regression armour.

## Must NOT

| Constraint                              | Evidence                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 protocol version and shapes          | `protocol.ts` gains only the `REAL_MIN`/`REAL_MAX` constants; no schema, field or status code changes; the reason value `invalid_payload` (`merge.ts`) is new |
| N2 pull path unchanged                  | no diff to `pullTablePage`, the pull route or `applyOne`                                                                                                      |
| N3 atomicity C1–C9                      | `backend/test/sync-concurrency.spec.ts` passes unchanged; the manual mutation script's original atomicity mutants are still killed                            |
| N4 only fixtures filled out             | backend specs that pushed partial rows now build whole rows through `backend/test/rows.ts`; no assertion changed                                              |
| N5 no dependency beyond drizzle-zod     | `shared/package.json` adds `drizzle-zod` 0.8.3 and `drizzle-orm` 0.45.4 (already in `app/` and `backend/`)                                                    |
| N6 no value or id in a log or ack       | backend "N6 …" (the log line carries paths and codes only); `payload-schemas.test.ts` "N6 an issue never carries the offending value"                         |
| N7 413 and `setting_not_synced` first   | existing route tests unchanged and passing                                                                                                                    |
| N8 no FK or generated-column logic      | none in the diff                                                                                                                                              |
| N9 drizzle-zod out of the phone and web | `payload-schemas.ts` is not in the barrel; the ESLint rule lets the backend import it by path. No rule stops the app or web from importing it: a convention   |

## Gauntlet

All numbers from runs at the source state above unless marked.

| Layer            | Command                                                                | Result                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite       | `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`                    | exit 0; vitest 232 files, 4247 tests; coverage 100% on the gauntlet modules; app jest 964 tests                                                                                                                                                                                                   |
| Backend          | `npx vitest run --testTimeout=60000`                                   | 28 files, 258 tests, exit 0                                                                                                                                                                                                                                                                       |
| Suite health     | the same with `--sequence.shuffle`                                     | 28 files, 258 tests, seed 1791959976623, exit 0                                                                                                                                                                                                                                                   |
| Manual mutation  | `node scripts/manual-mutation-sync-push.mjs`                           | baseline passes; 19/19 mutants killed (12 atomicity, 7 for this change), exit 0                                                                                                                                                                                                                   |
| Stryker (scoped) | the command in the entry point                                         | 314 tested: 306 killed, 2 timed out, 6 survived; score 98.09%. `payload-schemas.ts` 98.18 (2 equivalent, below), `protocol.ts`, `engine.ts`, `status.ts` 100. `json-export/types.ts` 91.49: its 4 survivors are in refinements this change does not touch (lines 226 and 275), so they predate it |
| Property         | fast-check in `payload-schemas.test.ts`                                | passes (any generated row passes; any single-column corruption fails)                                                                                                                                                                                                                             |
| Real execution   | `sync-client.spec.ts` (P7) and `pushChanges` (P8) in workerd           | pass, inside the backend run                                                                                                                                                                                                                                                                      |
| Schema mutation  | `pnpm mutation:schema`                                                 | **not completed**: it stops on `main` at `31195e0` on a stale line number in `shared/src/disciplines/schema.ts`, a file this change does not touch (#844); the 12 mutants before it were killed                                                                                                   |
| Docs             | `mkdocs build --strict`, `docs-anchor-check`, `docs-translation-check` | pass                                                                                                                                                                                                                                                                                              |

**Equivalent mutants.** `catch {}` in `isJsonText` returning `undefined`
instead of `false` (both falsy to `refine`), and `join('')` for
`join('.')` on issue paths (every path is at most one level deep). Stryker
cannot activate mutants in `PAYLOAD_SCHEMAS`'s module-load construction;
the "wire rules on a freshly derived schema" block re-derives the schemas
inside the tests so the same code runs per test and its mutants are judged.

## Independent verification

- Verifier: Claude (same model family), fresh context, given the repo at an
  exact SHA, the task contract (#697 plus the maintainer's C1 decision), the
  spec and the entry point. Not given the builder's conversation. Correlation
  broken: task context. Not broken: model.
- **Round 1** at `f5319b8`: **failed**. Attacked the run (all gates
  reproduced; scoped Stryker 83.65%), spec against contract (the wedge path,
  every timestamp writer, release skew), the tests (prototype keys, `1e400`,
  2^53, null payloads, own mutants), the checkers (Stryker scope, the manual
  mutation runner, the N6 log line, N9), and the mapping. Findings and what
  was done:
  - F1 behavioural: the ammo quantity and New Firearm maintenance interval
    screens stored `12.5`/`1e20`, which the server refuses → fixed
    (`parseQuantity`, `parseMaintenanceInterval`), tests added.
  - F2 (the maintainer grades): a refused change is overwritten by a later
    pull from another device; the manual, the screen string and §2.3 said
    nothing is lost → wording fixed in all three. Behaviour unchanged; Q1.
  - F3 spec gap: strict keys refuse a not-yet-updated phone after the
    server gains a column, in either deploy order → C5 and `docs/release.md`
    step 0 corrected; **Q6 for the maintainer**.
  - F4 mapping: the flag pin could not catch a flag named outside `is_*` →
    a second pin covers every counting integer column.
  - F5 checker: Stryker could not judge the module-load schemas → the
    fresh-derivation tests (`a91b3a7`), scoped score 99.08% then.
  - F6 test gap: `invalid = 1` survived → test added.
  - F7 behavioural: verdicts keyed by `clientChangeId` → keyed by index.
  - F8 mapping: the timing test cannot see Worker CPU → labelled a Node-side
    sanity bound; known limit.
- **Round 2** at `7031519` (the merged head): **failed**. All gauntlet
  numbers reproduced. Attacked: hostile payloads (prototype keys, 2^53 and
  1e20 in integer columns, non-objects), the envelope and the SQL reason
  order, P3b, N3/N4/N6/N9, the P11 guard, the outbox trigger, every
  timestamp writer, the single `sync_rows` write path, the docs; and the
  phone's number fields, the engine's accounting across batches, and the
  screen line. Findings and what was done:
  - Behavioural: the ammo measure fields stored `1e15`, which the server
    refuses (real columns are bounded to ±2^47) → `parseMeasure` and
    `REAL_MIN`/`REAL_MAX`, tests added. Series length and fält station
    points do the same and are disclosed as #837.
  - Behavioural: a refusal cleared in one push batch was not counted if a
    later batch failed the cycle → reported per refusal (`onRefused`, a
    `refused` status event), tests added.
  - Mapping: the Account & Sync line had no test → render test added.
  - Description: §2.1's "finite number" for reals, ADR 0021's claim that
    `schema.ts` is under coverage and Stryker, and §2.5's claim about the
    `shared/` builders' tests → corrected (spec Revision 3).
  - Noted, not changed: `applyPush`'s `invalid` defaults to an empty set
    (the route is its only production caller, and the atomicity tests call
    it without one); tombstones are not checked beyond the envelope (in
    scope, §2.3); the manual mutation script counts a timeout as a kill.

- **Round 3** at `c46c9d8`, approved by the maintainer (2026-10-14):
  **failed**. All gauntlet numbers reproduced (one `pnpm check` run hit a
  jest timeout in an untouched file under load and passed on rerun).
  Attacked: the apply path's constraints; every timestamp writer on the
  phone, the importers and the web; skew between web, phone and server;
  schema probes (2^53, `1e20`, `1e15` in a real, −0, enum case, empty
  strings, `archived_at`, `settings.value` of `''` and `'null'`); 17
  on-disk mutants of `payload-schemas.ts` (15 killed, 2 equivalent); route
  mutants; the drift spec fed a bad file; the conformance helper's scope;
  the mapping. Findings and what was done:
  - Behavioural: the JSON-export import stored maintenance `performedAt` as
    the file named it, so whole seconds, a date alone or an offset was
    refused on push. The conformance test never applied the file's records,
    so it could not see this → the format requires a UTC instant, the
    import stores `toISOString()`, the conformance test applies the
    records; tests added, manual updated.
  - Spec gap (the maintainer's): web edits spread the stored row, so after
    a column change a web edit of an older row is refused until a phone
    pushes it again → C5, Q6 and release step 0 say so.
  - Mapping: the backend P2 impossible-date row was refused by the
    envelope check, not the date check → the envelope now agrees, and the
    row fails with the date check removed.
  - Mapping: no route test refused a settings row → a non-JSON `value` is
    refused through the route, and the manual script kills a mutant that
    skips settings.
  - Description: §2.1 gave the wrong `validatePayload` signature → fixed.

**Independent verification: not performed against final source state
`7bc160a` (nor the later merge `be3c731`).** Three rounds were performed, the third with the maintainer's
approval; the last verified state `c46c9d8` returned failed, and the
round-3 fixes listed above are unverified. A fourth round needs the
maintainer's approval.

## Known limits

- **Release skew (C5, Q6).** Any column change of a synced table refuses
  the changes of whichever phones run the other schema until they update,
  and web edits of rows stored before the change until a phone pushes them
  again.
- **Refused changes can be overwritten** by a pull of the same row from
  another device (§2.3).
- **Foreign keys are not checked** (C14, Q4).
- **N9 is a convention**, not a lint rule.
- **No screenshot** of the Account & Sync refused line: showing it needs a
  signed-in phone and a refused push, which this run could not stage. The
  line is render-tested.
- **`firearms.archived_at`** (#814) is not held to the `toISOString()`
  shape: the JSON-export import keeps a file's value as it is (spec C7).
- **Worker CPU is not measured**; the timing test is a Node-side bound.
- **Local is not production**: `json_valid` and `CHECK` are probed in the
  Workers pool, not on a deployed D1.
- The other unbounded number fields (fält station points, series length,
  the series route's `pos`) are #837, outside this change.
- **`applyPush`'s `invalid` defaults to an empty set**: the route is its
  only production caller, and the atomicity tests call it without one.
- **Tombstones are not shape-checked** beyond the envelope; they cannot
  wedge a phone (§2.3).
- **The manual mutation script counts a timeout as a kill.**
