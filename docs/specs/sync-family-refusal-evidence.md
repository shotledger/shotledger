# Refuse a refused row's whole family — evidence

Spec: `docs/specs/sync-family-refusal-spec.md` (issue #856, PR #857). This
report covers **Revision 3** (§11): the server keeps refused families and
their waiting rows. The phone-side hold of Revision 2 items 6–10, which
verification rounds 1–4 attacked, is removed; its history is kept at the
end.

**Spec approval: obtained** for Revision 3 as revised (`f461e61`), by the
maintainer on 2026-10-20: "Approve all", answering "Approve the revised #856
design (Revision 3) with the recommended answers to Q1–Q4?". Recorded in
`8246caa`. Q1 yes; Q2 the Discard action is a follow-up; Q3 item 6 dropped;
Q4 the protocol changes in place at version 1. **Revision 4 approved**:
items 1–8 by the maintainer on 2026-10-20 ("Approve", answering "Approve
the 8 small corrections the rebuild made to the #856 spec (Revision 4)?"),
and items 9–12, round 5's fixes, with the maintainer's "Fix, check again"
the same day, answering "Fix the round-5 findings in #856 as proposed, then
run a sixth independent check?". Both are recorded in the spec (`cdc4571`,
then items 10–12 as they were built).

- **Source state:** the head of `feature/856-sync-family-refusal` that this
  report is committed in. Source and tests last changed at `a0af247`; the
  commit after it is this report.
- **Independent verification: failed, round 5, at `27d3c0b`.** Round 5's
  findings are fixed in the commits listed under Independent verification,
  which no verifier has seen. Round 6 is approved and pending.
- **Toolchain:** Node 24.21.0, pnpm 12.11.2, vitest 5.0.3,
  `@cloudflare/vitest-plugin` 1.4.0 (backend), Stryker 10.0.0 with the vitest
  runner, fast-check 4.10.2, jest-expo (app), expo-sqlite 57.0.3. No
  dependency added or removed.
- **Entry point:** `pnpm check` from the repo root; then
  `cd backend && npx vitest run --sequence.shuffle --testTimeout=60000`; then
  `node scripts/manual-mutation-sync-push.mjs` (on a clean tree); then
  `npx stryker run --mutate 'shared/src/sync/judge.ts,shared/src/sync/family.ts,shared/src/sync/merge.ts,shared/src/sync/protocol.ts,shared/src/sync/schema.ts,shared/src/sync-client/engine.ts,shared/src/sync-client/rows.ts,shared/src/sync-client/shadow.ts,shared/src/sync-client/status.ts'`;
  then the docs gates (`docs/CLAUDE.md`). BUDGET's figures print with
  `cd backend && npx vitest run test/sync-family-refusal.spec.ts -t BUDGET --reporter=verbose`.
- **Tier 3** (the sync engine's push path, data loss, concurrency, a public
  protocol). Isolation: the worktree `/home/claude/wt856`, its dependencies
  installed there with `pnpm i --frozen-lockfile`.

## Spec → tests

Every Revision 3 scenario has a named test; the test's name starts with the
scenario's id. Files: **FR** `backend/test/sync-family-refusal.spec.ts` (the
real Worker on D1), **SC** `backend/test/sync-client.spec.ts` (two devices
running the shared engine against the real Worker), **JT**
`shared/src/sync/judge.test.ts`, **JP** `shared/src/sync/judge.property.test.ts`,
**EN** `shared/src/sync-client/engine.test.ts`, **SH**
`shared/src/sync-client/shadow.test.ts`, **ST**
`app/src/db/queries/sync-store.test.ts` (the phone's SQLite store),
**CT** `app/src/features/sync/sync-controller.test.ts`, **AC**
`backend/test/account.spec.ts`, **WP** `web/src/pull.test.ts`, **FP**
`backend/test/sync-family-refusal.property.spec.ts` (seeded sequences
through the Worker and D1), **WA** `web/src/account/account.test.ts` (the
web's Account page, rendered).

| Scenario                         | Tests                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1–F3, F5–F8, F10 (§4, standing) | FR `F…` describes; `shared/src/sync/family.test.ts` (`familyRefusals`)                                                                           |
| F4, F9 (revised)                 | FR F4, F9 (the replay's ack carries `arrival`, `blocker`, `current`)                                                                             |
| F11                              | FR F11; `shared/src/sync/family.test.ts` edge pins; `family.property.test.ts`                                                                    |
| H1′, H3′                         | FR H1′; SC H1′; EN H1′                                                                                                                           |
| H2′                              | FR H2′ (one batch, own arrivals, new seqs); SC H2′; EN H2′                                                                                       |
| H4, H5, H6 (standing)            | SC H4, H5, H6                                                                                                                                    |
| H7′, ROOT, DISCARD               | FR H7′, ROOT, DISCARD; ST H7′ ROOT DISCARD (foreign keys off, as in production) and the pin with them on                                         |
| H8′, H10′, H13′                  | FR H8′, H10′, H13′                                                                                                                               |
| H9′                              | SC H9′; EN H9′ (600 entries, a 500 batch: the outbox drains)                                                                                     |
| H11′                             | ST H11′ (the counts survive a restart); CT H11′                                                                                                  |
| H12 (standing)                   | FR H12                                                                                                                                           |
| V1, X5, X7, X8, X9, X10          | FR V1, X5, X7, X8, X9; SC X10; JT X8, X9, X10                                                                                                    |
| X1, X1b                          | SC X1, X1b                                                                                                                                       |
| AB, VC, REV1, REV3, L1, I3       | SC AB, VC, REV1, REV3, L1, I3; EN AB, VC, REV3; FR AB, L1                                                                                        |
| ECHO                             | SC ECHO (two pushes, Revision 4 item 3); EN ECHO; SH ECHO; ST ECHO (real engine)                                                                 |
| FRESH, STUCK                     | SC FRESH, STUCK; EN FRESH, STUCK; ST FRESH; FR STUCK; WP (the web's list); WA (the web page's two counts)                                        |
| V5-1, V5-2 (Revision 4 item 9)   | SC V5-1 (a fresh device; a signed-out one), V5-2; EN and SH V5-1 (only an own mark shadows; the pull keeps `own` at the listed arrival); ST V5-1 |
| REV2, DUP                        | FR REV2, DUP; EN REV2, DUP; ST DUP                                                                                                               |
| REV6                             | FR REV6 (T3 of R2, Revision 4 item 4); JT REV6                                                                                                   |
| RELEASEFAIL                      | FR RELEASEFAIL (a failure at each statement of the release batch leaves nothing)                                                                 |
| TOMBROOT, GAP, MOVEIN, OWN, FIRE | FR and JT, by id                                                                                                                                 |
| REVAL                            | FR REVAL (T2 waits on T1, Revision 4 item 1; the log line names table and columns); JT REVAL                                                     |
| FIRST, CONC                      | FR FIRST (two, one paused at the guard); FR CONC (five: the guard's message, the retry, four attempts, no fifth, the 503)                        |
| SNAP (§11.8's read order)        | FR SNAP: another push committed just before the `state_rev` read is seen by every later read; the read-order mutant                              |
| ACCT, GONE (item 11)             | AC ACCT (the dry run counts `syncRefusals`; no `sync_*` row of the user is left); FR GONE (a push paused across the deletion writes nothing)     |
| BUDGET (and item 10)             | FR BUDGET: the 500-change push, and the 1,000–10,000 row curve; figures below                                                                    |
| I1, I2                           | JP I1, I2, the stored-blocker property and the release property (300 runs each); FP (seed 856, 100 runs, through the Worker and D1)              |
| I3                               | SC I3, one fixed interleaving of two devices; no generated sequence (Known limits)                                                               |
| Pull: `arrival`, `refusals`      | FR pull describe; WP refusals of the last response                                                                                               |
| Both counts, phone and web       | `shared/src/sync-client/status.test.ts`; CT; `app/src/features/account/account-screen.test.tsx`; `countMarks` in SH; WP; the screenshot below    |
| Release order on ties            | JT "orders ties by code unit…" and "orders a tie by table before id" (Revision 4 item 8)                                                         |

## Must NOT

| Clause                                                  | How it is held                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 (amended): only the §11.7 fields change on the wire  | `protocol.test.ts`; the contract suite (`sync-contract.spec.ts`); every existing ack assertion, extended by the new fields only (Revision 4 item 5)                                                                                                                                                |
| N2 (amended): the pull gains only `arrival`, `refusals` | `sync.spec.ts` pull tests unchanged apart from `arrival`; FR pull describe                                                                                                                                                                                                                         |
| N3: payload validation and atomicity stand              | `sync-payload-validation.spec.ts`, `sync-concurrency.spec.ts`: assertions extended by the new fields only; `state_rev` compared apart (Revision 4 item 5)                                                                                                                                          |
| N4: a valid change in a free family is applied as today | `sync.spec.ts`, `sync-concurrency.spec.ts` green; FR control rows                                                                                                                                                                                                                                  |
| N5: no foreign-key check on the server                  | FR H7′, ROOT                                                                                                                                                                                                                                                                                       |
| N6: no id or value in a log line                        | FR REVAL and family-log assertions; manual mutants "the family log line names row ids", "the re-validation log names the row id", "the route logs the payload"                                                                                                                                     |
| Rule 8: no compatibility path                           | the baselines are edited in place (`app/src/db/migrations/0000_baseline.sql`, `backend/migrations/0000_sync_init.sql`); `migrations.test.ts` green. `arrival` and `refusals` are required on the wire, with no fallback (`protocol.test.ts` "the arrival and refusals fields are required (V5-7)") |
| No new dependency                                       | `package.json` and the lockfile unchanged; `pnpm licenses:check` green                                                                                                                                                                                                                             |

**Tests removed, each pinning only superseded behaviour** (§11.2, §11.6:
Revision 2 items 6–10, `sync_refused`, `sync_outbox.held`, the phone's
family walk). Every one tested the phone-side hold, which no longer exists.
The behaviour each protected is now held on the server and pinned by the
primed scenarios above:

- `shared/src/sync-client/engine.test.ts`, the "runSyncCycle — family
  refusal" describe (37 tests removed or rewritten): step 1's release and re-judging, step 2's
  holding, step 3's refused set, the held count, item 7–10's rules, and the
  family walk's reads. Replaced by EN "refusal marks (Revision 3)" (21) and
  SC's Revision 3 describe (18). The two `onRefused` tests became mark
  tests, with the same scenarios.
- `shared/src/sync/family.test.ts`, `familyRoot` (4): the phone's walk,
  removed. Its rule is now the server's, pinned in JT and FR.
  "refuses another change of the same session row with it" is replaced by
  "a later valid change of the same session row is not refused with it":
  §11.4 says a valid live change takes its row out of the bad set, so the
  later valid version wins (the one assertion that changed direction).
- `shared/src/sync-client/shadow.test.ts`, `replacesHeldEdit` (7): item 9's
  clock rule, removed; arrivals decide (SH `shadowPull`, ECHO, AB).
- `app/src/db/queries/sync-store.test.ts`, "held entries and the refused
  set" and "a deletion of a held row is never held (C3)" (10): the held
  column, its triggers and `releaseHeld`. Replaced by ST "refusal marks"
  (12). C3 needs nothing on the phone now: a deletion is never refused
  `family_refused` (FR H10′).
- `app/src/features/sync/sync-controller.test.ts`, "the held count" (3) and
  `shared/src/sync-client/status.test.ts` (4): the in-session refused sum
  and the cycle's held count. Replaced by counts read from the marks (CT,
  status tests): "takes the refused and waiting counts as read, and keeps
  them through a failure", H11′.
- `app/src/features/account/account-screen.test.tsx`, "shows it after a
  restart, when the refused line is gone (C5)": C5 is superseded; both
  lines now survive a restart (ST H11′).
- `backend/test/sync-client.spec.ts`, "the phone holds a refused row's
  family across pushes" and "a held edit does not shadow a pull" (16, H1–H17
  of Revision 2): restored to `main`'s file and rewritten as the 18 Revision
  3 tests.
- Round 5, V5-7 (`09c6f13`): three tests of the client's fallbacks for a
  missing `arrival` or `refusals`, which rule 8 removes: EN "an ack with no
  arrival drops any mark of its row", SH "a live change with no arrival is
  older than any mark", and the no-arrival half of EN "a refusal with no
  arrival or blocker still writes a mark" (its no-blocker half stays). The
  protocol tests that a response without the fields does not parse replace
  them.
- Round 5, V5-1 (`af2986d`): EN "the shadowing rules run against the page's
  refusals, not the marks they replace" asserted that a mark rebuilt at a
  new arrival shadows. Under item 9 that mark is not the device's own, so
  the test now asserts the stored version applies; it is the one assertion
  that changed direction in round 5.

## Gauntlet

All figures are from one fresh run after the last code change (`a0af247`).

| Layer                                     | Command                                                                                                                                             | Result                                                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite, types, lint, format, coverage | `pnpm check`                                                                                                                                        | exit 0: types (root, backend tests, app, web), export schema, i18n (1,541 keys each, 0 issues), licenses (98 packages), lint, format; vitest 253 files, 4,584 tests, coverage thresholds met; jest 112 suites, 1,071 tests |
| Backend, shuffled                         | `cd backend && npx vitest run --sequence.shuffle --testTimeout=60000`                                                                               | 31 files, 345 tests, seed `1792527869226`                                                                                                                                                                                  |
| Mutation, shared (tool)                   | `npx stryker run --mutate '…'` (entry point above)                                                                                                  | 96.57% (break 95): 616 killed, 4 timeouts, 16 survived, 6 no coverage; 98.10% without `schema.ts`. judge 95.75%, family 95.83%, protocol, merge and every `sync-client` file 100%                                          |
| Mutation, workerd and the store (manual)  | `node scripts/manual-mutation-sync-push.mjs`                                                                                                        | 59/59 killed, exit 0; both baselines pass                                                                                                                                                                                  |
| Properties                                | JP: I1, I2, the stored blocker and the release property, 300 runs each; FP, seed 856, 100 runs through the Worker and D1; `family.property.test.ts` | JP and `family.property` in `pnpm check`; FP in the backend run                                                                                                                                                            |
| Query plans                               | `EXPLAIN QUERY PLAN` of every statement a push prepares, in workerd's D1 (below)                                                                    | every list is scanned once; every record is reached by primary key                                                                                                                                                         |
| Docs                                      | `mkdocs build --strict`, `node scripts/docs-translation-check.mjs`, `node scripts/docs-anchor-check.mjs`, `prettier --check docs`                   | all four exit 0: mkdocs strict build clean; 29 translated pages current; no dangling anchors; prettier clean                                                                                                               |
| Real execution                            | the web account page against `wrangler dev`, below                                                                                                  | screenshot (round 4's build; see below)                                                                                                                                                                                    |
| Supply chain                              | no dependency changed; `pnpm licenses:check` in `pnpm check`                                                                                        | 98 packages, invariants hold                                                                                                                                                                                               |

**Stryker survivors, classified.** Sixteen survivors and six without
coverage, each equivalent or out of the vitest pool's reach. Line numbers
are at `a0af247`; round 5's `RefusalRecord.blocker` moved them by 6 to 8
lines, and the set is the one round 5 classified:

- `schema.ts` (4 survived, 6 no coverage): the Drizzle declarations of the
  `tags` and `session_tags` indexes (unchanged by this branch) and the
  primary keys of `sync_outbox` and `sync_refusal_marks`. No vitest test
  loads them; the phone's tables come from the baseline SQL, which
  `app/src/db/migrations.test.ts` checks column by column, and the
  primary key the store relies on is in that SQL.

- `judge.ts:141` and `:154`, `index === undefined ? undefined : …[index]`
  to `…[index]`: indexing with `undefined` already gives `undefined`.
- `judge.ts:155`, a tombstone's own link: a tombstoned row is deleted, so
  `root` never follows its link.
- `judge.ts:191`, every bad row indexed as a firearm blocker: lookups use a
  `firearms:` key only, which no other table produces.
- `judge.ts:192`, every bad row indexed as a session blocker: a session
  family's root is never a firearm-family key.
- `judge.ts:194`, `< 0` to `<= 0`: two bad rows tie only if they are the
  same row, and each row is listed once.
- `judge.ts:210` (two), a firearm's own link: a firearm has no ownership
  edge, so `link` is null either way.
- `judge.ts:256`, demoted filtered without the reason check: the route
  demotes only rows from the release list, which are all waiting rows.
- `judge.ts:270` (two), `familyRefusals`' empty snapshot given a string
  record or stored row: neither is a `family_refused` record nor a link,
  so the verdicts are unchanged. `familyRefusals` is called from tests
  only (round 5's observation).
- Round 5's first Stryker run left two more, in `protocol.ts:126`: V5-7
  made `arrival` required, and C3, C4 and U5 then failed for the missing
  field rather than for their own fault, so the payload refinement's
  mutants survived. `a0af247` gives those fixtures `arrival`; the rerun
  kills both.
- `family.ts:77`, `typeof payload !== 'object'` dropped: property access on
  a string or number payload gives `undefined`, so the owner is still null
  (the same survivor as in rounds 1–3).

**The manual mutants.** 59 mutants over `backend/src/db/queries.ts`,
`backend/src/routes/sync.ts` and `app/src/db/queries/sync-store.ts`: the
seq and row writes, the verdict reaching the batch, the guard and its
retries, the records following each push, the release (order, skips,
`last_seq`, record deletion), the walk's depth, re-validation, `current`,
`blocker`, the pull's `refusals`, the N6 log lines, and the phone's marks
(pull replace, ack update, the ack transaction, `current` through the
shadow rules, sign-out and restore resets, `own` read back), the snapshot's
read order, the release's join, and the guard against a deleted account.
The script fails closed on a
pattern that does not match exactly once, a file that does not restore, a
run that fails without a failing test, and any survivor.

How it got there, in order:

1. The first run (55 mutants) left 13 survivors. Seven were every mutant of
   the phone's store: the script ran them against the app's jest, which
   ignores `src/db/` (`app/jest.config.js`), so the store's own tests never
   ran. The baseline "passed" because jest found two other suites. A checker
   that could not fail; the store mutants now run on the root vitest, where
   those tests live, and each was checked by hand to fail there first.
2. Two were equivalent under Revision 3 and are retired, with the reason in
   the script: "an invalid payload outranks a tombstone" (the judge acks a
   live change over a tombstone `tombstoned`, so its `reason` is null) and
   "a duplicate rewrites the record" (a replay takes the record's delete
   branch, never the upsert).
3. Four were real gaps, each now pinned by a test seen failing against its
   mutant first (`91e849d`): the guard's four attempts ("tries the batch
   four times…", "gives up after the fourth failed guard…"), the release
   skipping a stored tombstone and a stored version after the record's
   arrival (written directly, as a defect would leave them; §11.5 calls the
   second "a guard" that "cannot happen"), and the walk's second step from
   a row whose ownership column is unreadable (TOMBROOT, two steps). This
   report said the release test pinned "at or after"; it seeded the record
   below the stored version, so it pinned "after" only, and a `>` for `>=`
   survived (round 5, E-3). `09486b9` adds the test at the record's own
   arrival and the `>` mutant.
4. Round 5 (six more): the snapshot reading `state_rev` last (V5-4,
   `efd2e53`, with SNAP); the `>` above (`09486b9`); a stored mark read
   back as the device's own (`af2986d`); the release joining its list on
   the table alone (`ab5a583`); and the guard's two halves for a deleted
   account (`956b4b4`). The blocker rewrite's mutant moved to the new
   statement. Each was seen killed by hand before the run.

**Stryker, in order.** The first run scored `judge.ts` 94.42% (235 killed and 2 timed out of 251).
Three survivors were real: the code-unit tie order (`binary`'s `<=` and its
`>` branch) and the inert rule for a tombstoned waiting row. `70541ad` adds
tests for them, each seen failing against a hand-made copy of its mutant.

## D1's limits

Read from Cloudflare's D1 limits page
(<https://developers.cloudflare.com/d1/platform/limits/>) on 2026-10-20.

| Limit (Free / Paid)                                                 | Measured by BUDGET                                                                                                                                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queries per Worker invocation: 50 / 1,000                           | at most 5 reads and 1 batch per attempt; 4 attempts make 24 calls. The page does not say whether a batch counts as one query or as its statements; the maintainer's ruling (§11.8) is one call |
| Bound parameters per query: 100 / 100                               | 45 at most in one statement (lists are one JSON parameter)                                                                                                                                     |
| Max SQL statement length: 100 KB / 100 KB, per statement in a batch | 1,833 characters at most; lists are bound, not inlined                                                                                                                                         |
| Max string, BLOB or row size: 2 MB / 2 MB                           | a payload is at most `MAX_PAYLOAD_BYTES` (16 KiB). The longest bound string at 10,000 waiting rows is 338,988 characters, the release list; at that rate, 2 MB is about 59,000 rows            |
| Max SQL query duration: 30 s, "the entire batch call"               | 500 changes releasing 2,000 rows: 408 ms for the whole push. At 10,000 waiting rows: below                                                                                                     |
| Arguments per SQL function: 32 / 32                                 | at most 2 (`json_extract`, `strftime`, `MAX`, `COALESCE`)                                                                                                                                      |
| Statements in the batch                                             | 2,507 = 5N + 7 for N = 500 (Revision 4 item 2)                                                                                                                                                 |

**The growth curve** (round 5, V5-3; workerd's local D1, so the figures are
local). Each point seeds the waiting rows directly, then times one push of
one tag, a fix that moves every waiting row's blocker, and the fix that
releases them all. BUDGET asserts, at 10,000, under 5 s for the tag push and
under 10 s for each fix, and checks the parameter, SQL-length and string
limits at every point.

| Waiting rows | Tag push, before (`27d3c0b`) | Releasing fix, before | Tag push, after | Blocker-moving fix, after | Releasing fix, after |
| ------------ | ---------------------------- | --------------------- | --------------- | ------------------------- | -------------------- |
| 1,000        | 1,078 ms                     | 1,005 ms              | 32 ms           | 56 ms                     | 68 ms                |
| 2,500        | 6,650 ms                     | 6,017 ms              | 48 ms           | 62 ms                     | 117 ms               |
| 5,000        | 27,161 ms                    | 22,811 ms             | 97 ms           | 103 ms                    | 224 ms               |
| 10,000       | 105,675 ms                   | 93,798 ms             | 147 ms          | 204 ms                    | 412 ms               |

Before, the time grew with the square of the waiting rows (×4 rows, ×16 to
×25 time) and passed D1's 30 s near 5,000; after, it grows with the rows.
The "before" column is the same test run against `27d3c0b`'s statements;
the "blocker-moving" case did not exist there. Memory: workerd gives no
per-request figure in tests; the largest objects a push holds are the
records it reads (no payloads) and, on a release, the waiting payloads it
re-validates: 178 characters of JSON per shot in BUDGET, so about 1.8 MB of
payload text at 10,000 shots, more once parsed.

**Query plans.** `EXPLAIN QUERY PLAN` of every statement a push prepares,
run in workerd's D1 with the push's own parameters (a scratch test, not
committed): each list is read once (`SCAN json_each`, `LIST SUBQUERY`, or a
materialized `SCAN b`), and every record and stored row is reached through
its primary key (`SEARCH … USING INDEX sqlite_autoindex_… (user_id=? AND
table_name=? AND row_id=?)`). The one full read of the user's records is
`readRecords` (`SEARCH sync_refusals … (user_id=?)`), once per attempt and
without payloads. No index was added.

## Local foreign keys (§11.6)

- **Production:** `app/src/db/client.ts` opens the database with
  `openDatabaseSync` and sets no `foreign_keys` pragma. expo-sqlite 57.0.3
  compiles SQLite without `SQLITE_DEFAULT_FOREIGN_KEYS`: its
  `android/build.gradle` flags are `SQLITE_ENABLE_BYTECODE_VTAB`,
  `SQLITE_TEMP_STORE=2`, `SQLITE_ENABLE_SESSION`,
  `SQLITE_ENABLE_PREUPDATE_HOOK`, `SQLITE_ENABLE_MATH_FUNCTIONS` (FTS and
  SQLCipher optional), and `ios/ExpoSQLite.podspec` sets the same set. So
  SQLite's default, foreign keys off, holds. The spec asked for a
  `PRAGMA foreign_keys` read in a dev build; that read was not made
  (Revision 4 item 6).
- **Tests:** `createTestDb({ foreignKeys: false })` matches production. ST
  H7′ ROOT DISCARD applies the orphan with it; the pin beside it shows the
  default test DB (foreign keys on) rejects the same apply at commit.

## Real execution

`wrangler dev` on a fresh local D1, the phone's web preview behind
`coi-proxy.mjs`, and the web app on `vite`, driven by a Playwright harness
(scratch, not committed). The phone loaded `/dev` demo data, created the
account `demo-856-rev3@example.invalid` and synced; the harness set one
session's `name` to null in the first push, as a writer bug would send it,
and the real server judged it. Pushes: the first acked 462 applied, 37
`family_refused` and 1 `invalid_payload`; three more applied 500, 500 and 78. The phone then showed "0 change(s) waiting to upload", "1 change(s)
refused by the server and not synced" and "37 change(s) waiting on a
refused change". The web app, signed in to the same account, showed the
same two lines on its account page's **Sync** card.

Screenshots: `/mnt/project-files/screenshots/856-held-count/rev3-phone-account-sync-en.png`
and `/mnt/project-files/screenshots/856-held-count/rev3-web-account-en.png`.

Running `expo start` writes `app/.expo/types/router.d.ts` (gitignored),
which makes `pnpm typecheck:app` fail on `falt-stations.tsx`, a file this
branch does not touch. CI never runs `expo start`; the file was deleted
before the final `pnpm check`.

## Known limits

- **Round 5's fixes are unverified**: round 6 is approved and pending.
- **I3 is not a generated property.** §11.10 asks for generated two-device
  sequences converging; SC I3 is one fixed interleaving (round 5, E-2).
  FP generates single-writer push sequences against D1 and checks I1 and
  I2, not convergence.
- **A device's own version of a waiting row** is shown only on that device
  until the release (Revision 4 item 9). Every other device, the web, and
  this device after a sign-out, restore or reinstall show the stored
  version, and the counts everywhere (the manual says so).
- **A first push racing an account deletion** still creates the user's
  sequence row (`?2` = 0 is the only case the guard cannot tell apart); a
  push judged from an existing row cannot (GONE).
- **The production `PRAGMA foreign_keys` read** in a dev build was not
  made (Revision 4 item 6).
- **The Discard action is a follow-up** (Q2): a refusal no edit can fix
  holds its family until the row or its session is deleted.
- **The web entry page's message for a waiting save** is #863.
- **C4's remaining gap** (§11.4) stands: rows linked only through rows the
  server has never seen are not joined until those rows arrive.
- **A held session's firearm counts its rounds anyway** (round 2's O-1):
  unchanged by Revision 3.
- **BUDGET runs on workerd's local D1**, not production; its wall times
  are local figures. The curve's shape, not its milliseconds, is the claim.
- **The screenshots are from round 4's build** (`27d3c0b`). Round 5
  changed no screen: the Account & Sync lines and the web's Sync card read
  the same counts, now pinned by WA for the web.

## Independent verification

**Failed: round 5, at `27d3c0b`.** No verifier has seen the round-5 fixes.
Round 6 is approved by the maintainer (2026-10-20) and pending.

### Round 5, at `27d3c0b`

- **Verifier:** a fresh-context Claude agent, blind first, in its own
  detached worktree (`/home/claude/wtverify5`), experiments in an isolated
  `git archive` copy. It read this report only after its blind record.
- **Attacked:** which tree the tests run; the gauntlet (`pnpm check` exit 0,
  4,571 and 1,071 tests; backend 336, shuffled; root vitest shuffled;
  scoped Stryker, the same 12 equivalent survivors; manual mutants 53/53;
  BUDGET); the approved spec against the contract (shadowing on devices
  that never held the waiting version, the account-deletion race, scale,
  the ack's mark rule, rule 8, duplicates in one push, the 503, web
  parity); its own mutants (snapshot read order, the walk's seeds and its
  tombstone stop, the release's `>=`); removed tests against their
  successors; the mapping in both directions.
- **Findings and resolutions:**
  - **V5-1, V5-2 (behavioural; spec gap):** marks rebuilt from the
    account's list shadowed on every device, so a fresh or signed-out
    device hid stored rows, and a device that missed an applied edit kept
    an older one. Resolved by Revision 4 item 9: only a device's own mark
    shadows (`af2986d`; the backup refusal `039a44e`). Tests: SC V5-1 (two),
    V5-2; EN, SH, ST.
  - **V5-3 (behavioural, liveness):** push time grew with the square of
    the waiting rows, past 30 s near 5,000. Resolved by item 10
    (`ab5a583`); the curve above.
  - **V5-4 (a gate that could not fail):** nothing pinned that the
    snapshot reads `state_rev` first. SNAP and its mutant (`efd2e53`).
  - **V5-5 (mapping):** (a) the release test pinned "after", not "at"
    (`09486b9`); (b) there was no seeded replay against D1, and the
    property file's header claimed one; FP now exists and the header names
    it (`d5f9286`); I3 stays a fixed interleaving (Known limits); (c) the
    web page's two counts had no rendering test; WA (`466de7e`).
  - **V5-6 (low):** a push judged before an account deletion could land
    after it. Resolved by item 11 (`956b4b4`), GONE.
  - **V5-7 (low):** the client tolerated a missing `arrival` or
    `refusals`. Now required, the fallbacks gone (`09c6f13`; the negative
    tests' fixtures `a0af247`).
  - **V5-8 (description):** the spec said an ack deletes the row's mark;
    the code spares a later one. The spec now says what the code does, the
    safer reading (item 12, `259e0f1`).
  - **E-1 to E-7 (this report):** E-1, the "SC I1, I2" citation was a name
    collision with sync-app-spec's I1 and I2 tests: removed, FP and JP
    cited. E-2, I3 and the missing replay: mapped as above. E-3, "at or
    after": corrected under the manual mutants. E-4, the 30 s row and the
    28,000-row claim: the curve, and the size limit restated. E-5, fresh
    and stale devices, and the manual's false sentence: item 9, and the
    manual (en, sv) now says what other devices and a signed-out phone
    show. E-6, the rule-8 row: now cites the required fields. E-7, the
    snapshot read order: SNAP, and the CONC row no longer stands for it.
- **Fixed after the last verified state, therefore unverified:**
  `efd2e53`, `09486b9`, `09c6f13`, `af2986d`, `039a44e`, `ab5a583`,
  `956b4b4`, `d5f9286`, `466de7e`, `259e0f1`, `a0af247` (with `cdc4571`
  and this report, docs only); round 6 pending.

## History: verification rounds 1–4 (the phone-side hold, superseded)

Kept as written at the time. These rounds attacked Revision 2's phone-side
hold, which Revision 3 removes; commit ids and file names below refer to
that code.

**Failed** at `6263df3` (round 1, on B1), at `aa4827d` (round 2, on B-1)
and at `b399be4` (round 3, on B-1). **Not performed** against the final
state: round 3's fixes came after the last verified state, and a fourth
round needs the maintainer's approval.

- **Verifier:** a fresh-context Claude agent (the same model family as the
  builder), run to `references/verifier.md`. Blind first, on four inputs:
  the task contract, the approved spec, the source state `6263df3` (a
  detached worktree, `/home/claude/wtverify`), and the entry point. It read
  the draft of this report only after writing its blind record. This breaks
  task-context correlation (it did not see the builder's reasoning or
  conversation); it does not break model correlation.
- **Rounds:** 3; the cap of 2 was raised to 3 by the maintainer's
  approval of a third round. Each is a new fresh-context verifier in its
  own detached worktree, installed fresh. Round 1, at `6263df3`:
  **failed** on B1. Round 2, at `aa4827d` (`/home/claude/wtverify2`):
  **failed** on B-1. Round 3, at `b399be4` (`/home/claude/wtverify3`):
  **failed** on B-1. Round 4: pending the maintainer's approval.
- **Grading:** the verifiers proposed the grades below. The coordinator
  relayed each round's findings to the builder to fix. The maintainer
  approved round 2's fixes (items 7 and 8) and a third round; round 3's
  grades and fixes, item 6, and stopping are the maintainer's to decide.
- **Attacked:** reran the gauntlet at `6263df3`; `pnpm check` (every gate
  through vitest green, 250 files, 4506 tests; jest 1070 of 1071, the date
  test that #862 later fixed), the backend (30 files, 290 tests), the scoped
  Stryker run and the manual mutation script (26/26). Planted its own
  mutants: ten in the SQLite store (S1–S9 killed; S10, `releaseHeld` also
  clearing change ids, survived as near-equivalent), fifteen in the engine
  (E1–E15: a refused row's own key in place of its root, a refused
  firearm's own later entry, step 1's release, release without un-hold, a
  replayed `invalid_payload` and more), and two against the F11 checker (an
  edge dropped, a reference listed as an edge). Reproduced a held deletion
  in the real SQLite store and engine. Read the web entry page against H12,
  and the spec text against the code.
- **Stryker timing.** The verifier's run counted 275 killed and 5 timed out
  where the builder's had 276 and 4. One mutant sits at the timeout bound
  and lands on either side by machine load; Stryker counts a timeout as a
  kill, so the score (99.29%) and the two survivors are the same.

### Round 1, at `6263df3`

- **Findings, behavioural:**
  - **B1, fixed in `8136c19`, not re-verified.** A deletion of a row whose
    outbox entry was already held stayed held. The triggers kept `held` on
    every upsert, so `readOutbox` skipped the tombstone and it never reached
    the engine's `deletedAt` guard, against C3 and H10. Repro: s1 synced, s1
    refused, t1 edited (held), t1 soft-deleted: the outbox kept
    `{shots:t1, held: 1}`, and the push carried nothing. Fix: the triggers
    clear `held` when the written row is a tombstone (spec Revision 2
    item 6, which records the conflict with §2.3's "an edit keeps it held").
    Tests: H10 in the mapping above.
  - **B2 = Revision 2 item 4, not fixed.** The web entry page shows "Saved."
    on `partlyRejected`, so a new session refused whole with its family
    reads as saved. The spec keeps the web unchanged; H12 pins only
    `pushChanges`. For the maintainer.
- **Findings, description and mapping** (disclosed, no new round):
  - **D1 = Revision 2 item 3:** §2.3 and §8 say "a new migration"; the
    baseline is edited in place, per hard rule 8.
  - **D2 = Revision 2 item 1:** N3 says P1–P12 pass with unchanged
    assertions; P8's changed (F2 against N3).
  - **D3 = Revision 2 item 2:** §4's invalid shot is `value: -1`; the tests
    use `value_tenths: null`, because the schema does not range-check.
  - **O1 (low, open):** F11 checks both edge lists against the Drizzle
    foreign keys, but nothing checks `FAMILY_KIND` against
    `OWNERSHIP_EDGES` for a new table; that is pinned by value only.
  - **O2 (no finding):** a fix written while the refused row's push is in
    flight is held for one cycle; the controller's rerun picks it up.
- Round 2 saw the B1 fix (`8136c19`) and found nothing wrong with it.

### Round 2, at `aa4827d`

- **Attacked:** a fresh install with a link check and a canary (an empty
  `familyRefusals` in the tree under test failed F1, F2, F3, F5 and F6);
  the gauntlet again (`pnpm check` exit 0, 4521 and 1071 tests; backend
  291, shuffled too; the root sync suites shuffled, 668 tests; manual
  mutation 26/26; Stryker without `merge.ts`, 257 mutants: 250 killed, 5
  timed out, the same two equivalent survivors, 99.22%). The approved spec
  against the diff line by line. A scratch end-to-end suite on the real
  Worker: pulls against held entries (V-A, V-C), an invalid row acked
  `tombstoned` with its family `family_refused` (V-D), and a control
  without the refusal (V-B). Its own mutants: `readBlocked` hoisted out of
  the loop, step 1 releasing from `readOutbox` instead of `pendingRowKeys`
  (killed by one unit test only; the backend suite does not kill it), four
  in the SQLite store, the controller's held count, the account screen's
  `heldCount > 0`, and `falt_stations` moved from ownership to reference
  (killed by the pins and the property test; F11 checks coverage, not
  classification). Every `_id` column of the synced tables checked by hand
  for a missing foreign key. The web page on a family refusal, the round
  count of a held session's firearm.
- **Findings, behavioural:**
  - **B-1, fixed in `2a55186`, not re-verified.** A `family_refused` entry
    could stay held forever with nothing refused: B deletes s1; A, unsynced,
    writes s1 with `name: null` and adds R1 and T1; A's push is acked s1
    `tombstoned` (C11 precedence) and R1, T1 `family_refused`, so s1 never
    entered the refused set and nothing released R1 and T1. Fix (Revision 2
    item 7): step 1 releases every held entry each push and step 2 judges
    each again; a refused row whose session is deleted locally blocks
    nothing. R1 and T1 go out, as before family refusal (N5). Tests: H13
    in the mapping, now named by the failure model's "a held row is never
    released" row.
  - **B-2, fixed in `0f35dee` as proposed, the resolution pending the
    maintainer; not re-verified.** A held entry shadowed a pulled change,
    and the cursor moved past it, so on release the older held edit
    overwrote another device's later edit everywhere (A-name over B-name),
    and another device's deletion was delayed. Fix (Revision 2 item 8): a
    pulled change for a held row is applied and the held entry dropped; an
    unheld entry still shadows. Tests: H14 and H15 in the mapping.
  - **B-3 = round 1's B2 = Revision 2 item 4, not fixed.** For the
    maintainer, as before.
- **Findings, description and mapping:**
  - **S-1 = D1** (item 3), **S-2 = D2** (item 1), **S-4 = D3** (item 2):
    disclosed as before.
  - **S-3 = Revision 2 item 6:** the soft-delete release contradicts §2.3's
    approved text; disclosed as unapproved.
  - **T-1, fixed in `215f44b`:** `heldCount > 0` mutated to `> 1` in
    `account.tsx` survived; a test at a count of one now kills it.
  - **O-1, not fixed (observation):** a held session's shots still move
    `firearms.round_count`, and the firearm row is a reference, never held.
    Recorded under Known limits for the maintainer.
  - The round-1 report's failure model claimed H2, H3, H7 and H8 covered
    "a held row is never released"; B-1 was such a row. The row now names
    H13.
  - The verifier first misread its own Stryker table (killed and timed-out
    columns) and corrected it after comparing; the figures above are the
    corrected ones.
- Round 3 saw these fixes (`2a55186`, `d179178`, `0f35dee`, `215f44b`) at
  `b399be4`; its B-1 and B-2 are in item 8's and item 7's code.

### Round 3, at `b399be4`

- **Attacked:** an environment check first (the store, the shared link and
  the workerd sourcemaps all inside its own worktree; no `.bin` shim
  pointing elsewhere); the gauntlet again (`pnpm check` exit 0, 4530 and
  1072 tests; backend 295; Stryker 300 mutants, 293 killed, 5 timed out,
  the two equivalent survivors; manual mutation 26/26). The spec against
  the issue's examples, C4's gap, an invalid ownership column, item 6's
  triggers per table, item 8 against the protocol's echo of a device's
  own pushes. Its own engine mutants (M1–M11: the held drop removed, no
  step-1 release, no deleted-root skip, no id reset, the pending keys read
  before the drop, no step-1 forget: all killed; M7, forgetting refusals
  for shadowed changes too, survived as equivalent). F11 fed known-bad
  edge lists, and a server mutant returning tombstones from
  `familyRefusals` (killed by the shared tests, not the backend family
  spec). A scratch end-to-end suite on the real Worker: ECHO and CONTROL
  (B-1), FIXMIDPUSH (L-1), RELEASEFAIL (B-2). Failed pushes between
  release and re-hold, partial cycles, undelete, a hard delete of a held
  row, a mid-cycle rerun.
- **Findings, behavioural:**
  - **B-1, fixed in `c4499fe` as proposed, the resolution pending the
    maintainer; not re-verified.** A pull returns this device's own pushes.
    When A1 of s1 landed in a push and A2 was written mid-push and held,
    the rerun pulled A1 back and item 8 dropped A2 for it: A2 was lost on
    every device. Fix (Revision 2 item 9): a pulled change drops a held
    edit only when it is a tombstone (the server's R2) or its `updatedAt`
    is strictly later than the local row's; otherwise it is shadowed. The
    proposal was to mirror the server's last-write-wins exactly; the
    server compares no timestamps at all (`merge.ts` R3 orders by arrival,
    `seq`), and a held edit has not arrived, so only R2 is mirrored
    exactly and the rest is a clock comparison, which item 9 says. Equal
    times keep the held edit; nothing is applied or advanced for a
    shadowed change beyond the page's cursor, as for any shadowed change.
    Tests: H16 in the mapping.
  - **B-2, fixed in `3282cb8` (tests completed in `97c2ccb`) as proposed,
    pending the maintainer; not re-verified.** Step 1 released every held
    entry, so a push that failed before step 2 read them all left
    still-blocked entries unheld to shadow the next pull. Fix (Revision 2
    item 10): step 1 judges each held entry where it lies and releases, in
    one call, only the ones nothing blocks; a failure anywhere leaves every
    still-blocked entry held. Tests: H17 in the mapping.
  - **L-1 = round 1's O2, not fixed (low).** A fix of the refused row
    written mid-push is held for one cycle; the controller's rerun sends
    it. Nothing is lost.
- **Findings, description and mapping:**
  - **Item 6** (the soft-delete release) reported for the human, as
    before; still pending.
  - **D-1, fixed in `c4499fe` and `3282cb8`:** §6's rows "A held row is
    lost" and "A held edit overwrites another device's later change" now
    name H16 and H17, with a new row for an older pulled change; the
    manual (en and sv) no longer says a dropped held change fares "as it
    would have been had it synced in time", and says the two devices'
    clocks decide.
  - **The Swedish term, fixed in `3ec10d5`:** the refused line said
    "avvisades" and the held line "nekad"; both say "nekad", as §2.4, and
    so does the manual's section. The i18n gate passes.
  - **This report was stale at `b399be4`:** the approval state, "round 3:
    pending", the Known limits and the 4-against-5 timeouts. Refreshed.
  - Coverage notes, no finding: the property test generates complete
    pushes only; F8's route case does not pin a tombstone linked to a
    refused row; F11 checks coverage, not `FAMILY_KIND` (round 1's O1).
- **Fixed after the last verified state, therefore unverified:**
  `c4499fe` (item 9), `3282cb8` and `97c2ccb` (item 10), `3ec10d5` (the
  Swedish wording). Round 4 is pending the maintainer.

**Builder's adversarial pass.** A hostile payload in the family walk: a
non-object, a numeric or null parent id, an index past the push, a
tombstone that carries a payload, the same row twice in one push (session:
refused with it; firearm: not below itself, so not refused). A held entry
rewritten mid-push (rev-matched hold misses, the write goes out as a new
change). A refused row written again after step 1 in the same cycle (held,
then released by the next cycle's step 1). A refused row gone locally, and
an orphan whose parent is missing. 600 held entries with a 500 batch.

### Round 4, at `12a2cc6`

**Failed** (recorded in the spec, §11 preamble and §11.1). Findings: B-1,
re-queuing a still-invalid row released its family (X9, X10); B-2, a lost
response or a crash in the ack loop split a family (X1, X1b, X8); D-1, the
clock rule was false in the first cycle of a hold (X7). The maintainer
answered with the decision that became Revision 3: the server keeps the
refused families. X1, X1b, X7, X8, X9 and X10 are Revision 3 scenarios,
mapped above.
