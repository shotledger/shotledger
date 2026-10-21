# Evidence report — web bulk edit (Tier 3)

Spec: [`web-bulk-edit-spec.md`](web-bulk-edit-spec.md), including its §8
Revisions R1–R29 (R5, R16, R18 and R21–R24 withdrawn).

> **Round 5 is the current evidence:**
> [Round 5](#round-5-the-maintainers-rulings-r25r29). Rounds 1–4 are kept as
> history; what they say about the counter correction no longer describes
> the code.

- **Spec approval: approved first-hand by the maintainer on 2026-10-08**,
  after an independent review: B1–B6 and B8–B10, B7 as amended (R27),
  R1–R4, R6–R15 and R17–R20, with the changes recorded as R25–R29; R5, R16,
  R18 and R21–R24 withdrawn. Rounds 1–4 ran before that approval.
- **Source state (round 1):** commit `41f55c7`. Branch `feat/web-bulk-edit`,
  on `feat/web-series-entry-impl` at `d6e1168` (#669).
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, fast-check 4.10.2, TypeScript 6.0.2 / native 7.0.2;
  backend vitest 4.1.11 with `@cloudflare/vitest-plugin`).
- **Entry point:** `pnpm check`; `cd backend && npx vitest run
--testTimeout=60000`; `npx stryker run --mutate
shared/src/sync-client/bulk-edit.ts`; `node
scripts/manual-mutation-web-bulk.mjs`.
- **Independent verification:** round 1 **failed** (one confirmed bug, two
  confirmed gate/test gaps, three plausible findings, one wording finding),
  graded by the coordinator. Round 2 fixes all seven; round 2's source state
  has **not** been re-verified, so it is a declared downgrade to `not
performed` for that state.

## Failure model (Tier 3)

| Way this can hurt                                                     | Layer that catches it                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A rewritten session loses a column (or one this build does not know)  | K7 (pulled payload spread, `future_column` survives), P3/P4 on the real schema           |
| A link to a tag id the phone does not have fails every phone's apply  | K2 (the new tag travels first, in the same push), P1, W1                                 |
| The firearm counters drift from what the phone's own edit would write | K8–K10, K17 (independent one-session-at-a-time oracle), P3 (twin of `updateSession`), W2 |
| A bulk edit half-lands                                                | One push = one D1 transaction (B3); K15 refuses > 500 rather than splitting              |
| A lost response, retried, moves the counters twice                    | W3 (replay → all `duplicate`, no new seq), U6, browser check 3                           |
| A session the user did not see or select is changed                   | K17 ("touches nothing else"), U3 (only selected **and** shown), manual mutant            |
| A session deleted elsewhere is resurrected or written                 | K13 (left out, counted), W4 (server refuses `tombstoned`, rest lands)                    |
| A tag removed on the web reappears through a same-name copy           | K5 (every link to any tag of the name), P2 (twin of `removeSessionTag`), manual mutant   |
| Shooting data left in the browser                                     | N1 grep gate (negative control below)                                                    |
| An automatic retry loop                                               | U6 (push count 1, Retry resends the held request); no timer in `apply.ts`                |

## Spec → test mapping

| Scenario                       | Test                                                                                        | Status |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------ |
| K1–K16                         | `shared/src/sync-client/bulk-edit.test.ts` › K1…K16                                         | pass   |
| K17 property (fast-check, 500) | `bulk-edit.test.ts` › K17                                                                   | pass   |
| P1–P5                          | `app/src/db/queries/web-bulk.test.ts` (P1 has a second case pinning B7)                     | pass   |
| W1–W4                          | `backend/test/web-bulk.spec.ts` (Workers pool, real D1 + better-auth)                       | pass   |
| U1–U4                          | `web/src/bulk/model.test.ts`                                                                | pass   |
| U5–U8                          | `web/src/bulk/apply.test.ts`                                                                | pass   |
| N1 no browser storage          | `apply.test.ts` › N1 grep gate                                                              | pass   |
| N2 no outbox, no auto retry    | U6                                                                                          | pass   |
| N3 no endpoint/protocol/schema | K16 (`PushRequestSchema`), W1–W4 (real `/sync/push`); no migration in diff                  | pass   |
| N4 no dropped column, no null  | K7, P1–P4                                                                                   | pass   |
| N5 only the action's rows      | K1–K13, K17                                                                                 | pass   |
| N6 no `settings`, no ammo lots | review: the builder writes only `tags`, `session_tags`, `sessions`, `firearms` (K16 tables) | pass   |
| N7 phone unchanged             | no `app/src` source change (only a test and i18n); `pnpm typecheck:app`; jest 698/698       | pass   |
| Browser checks                 | headless Chromium over CDP against `wrangler dev`; see below                                | pass   |

## Gauntlet (final fresh run, after the last code edit)

| Layer                                           | Command                                                                | Result                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                           | exit 0; vitest 171 files, 2997 tests passed; jest 698 passed; i18n 1265 keys, 0 issues   |
| Coverage (gated)                                | `pnpm check` (`vitest run --coverage`, 100% threshold)                 | 100% statements 3468/3468, branches 2153/2153, functions 792/792, lines 2953/2953        |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                     | 15 files, 157 tests passed (W1–W4 included)                                              |
| Mutation (tool)                                 | `npx stryker run --mutate shared/src/sync-client/bulk-edit.ts`         | 238 killed, 0 survived, 0 no coverage: 100.00%                                           |
| Mutation (tool, page modules)                   | `npx stryker run --mutate 'web/src/bulk/*.ts,!web/src/bulk/*.test.ts'` | 398 killed, 2 survived: 99.50% (equivalent, below)                                       |
| Mutation (hand, fails closed)                   | `node scripts/manual-mutation-web-bulk.mjs`                            | 11/11 killed: 4 against the K17 property alone, 3 against the phone twin, 4 page mutants |
| Property-based                                  | K17 (500 runs)                                                         | pass                                                                                     |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=301 <new suites>`   | 4 files, 35 tests passed                                                                 |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check` | built; 25 translated pages current; no dangling anchors                                  |
| Supply chain                                    | `pnpm licenses:check`; diff of `package.json` files and the lockfile   | 97 packages, invariants hold; no dependency change                                       |

**Negative controls.** The N1 grep gate failed with `// localStorage`
appended to `web/src/bulk/model.ts` (1 failed), then passed restored. P3 failed
with the builder's source-firearm move removed, then passed restored. The
manual runner requires every unmutated suite to pass first and refuses a
mutant pattern that does not match exactly once.

## Real execution (browser checks)

`wrangler dev` on port 8801 with a synthetic account (nine training sessions
over two seasons, seeded through `/sync/push`), the built web app served by
the Worker, a headless Chromium driven over CDP. Screenshots are in the
session scratchpad, not the repo.

1. Filter 2025 (4 shown), select all shown, Add Tag "Season 2025" (new) →
   "Changed 4 sessions."; the server holds a link from each of s1–s4 to the
   new tag. The same again → "Nothing to change…", nothing sent.
2. All 9 selected, Remove Tag offers exactly the selection's tags; removing
   "Club night" → "Changed 3 sessions. 6 already were that way."; no live
   link to it remains.
3. Filter 2026 (5 shown), Change Firearm to the second gun, with the push's
   response dropped after it reached the server → "Could not reach the
   server…" and **Retry**; Retry → "Changed 5 sessions." Counters: first gun
   400 → 350, second 0 → 50 (5 sessions × 10 shots, moved **once**).
4. Search "outdoor" (2 shown), Change Location "Forest range" → both moved,
   the other seven untouched.
5. Offline (DevTools emulation) → Apply disabled, "You are offline…".
6. 390 px wide, English and Swedish: no page-level horizontal scroll (the
   menu wraps; the table scrolls inside its card). This check found the
   overflow, fixed in R2.

## Layers not run as specified

- **SUBSTITUTED:** Stryker ran on the new shared module only
  (`--mutate`); the web modules are outside `stryker.config.json`'s list, so
  they got the hand mutants instead. Cannot detect: a test that asserts
  nothing in a web branch no hand mutant touches.
- **SUBSTITUTED:** suite health is one shuffled run (seed 301) of the new
  suites, not every suite.
- **N-A:** the browser checks are manual by design; they ran headless.

## Structural blind spot

The phone's apply path runs on better-sqlite3, not expo-sqlite (P1–P5,
`asBound`). A difference in how expo-sqlite binds a value would not show
here; #669's evidence report has the same limit.

## Known limits

- A phone that edited the same session or firearm offline can overwrite the
  web's edit, or the reverse (ARCHITECTURE.md § Web app, races; B4 narrows the window,
  which with a Retry runs from the first pull to the Retry, R10).
- Merging duplicate ammo lots is not in this layer (spec §6).
- A firearm deleted on another device between the fresh pull and the push is
  refused (`tombstoned`) while the sessions moved onto it land; they then name
  a deleted firearm, as #669's entry does in the same race.

## Honest notes

- Stryker's first run left 13 survivors (94.84%). Two were real gaps (the
  canonical tag picked by insertion order rather than smallest id; a padded
  location at the limit), now tested; the rest were redundant sorts and an
  equivalent null check, removed from the code rather than tested around.
- The browser check found the narrow-width overflow (R2).
- `pnpm check` first failed on a type error in the K17 oracle (a tuple map
  typed too loosely); fixed in the test, no assertion changed.

## Round 2 (after the independent verifier, R5–R12)

- **Source state:** commit `3e0c9ea` (code, tests and the mutation script;
  the docs and this report are committed on top), rebased onto #669 at
  `8860a12` (its held-request and user-binding fix, R13/R14, which R12
  mirrors; vitest now runs in `America/Sao_Paulo`).
- **Spec approval (at the time):** not obtained; R5–R12 were flagged in the PR. R5
  changes B3: a refused moved session now costs a second push.

### Findings → fixes

| Verifier finding                                                     | Fix                                                                       | Evidence                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| CONFIRMED: counters move for a refused session (f2 15, should be 13) | R5 counter plan + correction, built once, resent identically on Retry     | K18–K21, W5 (real Worker: 97/13, replay `duplicate`), R5 page tests |
| CONFIRMED gate gap: table list and targets in the component untested | R8 `request.ts` (form → action, tables, targets, deps), `messages.ts`     | `request.test.ts`, `messages.test.ts`; hand mutants killed (below)  |
| CONFIRMED test gap: discipline series length → literal 5 survived    | R9 air-pistol total-only fixture in K9                                    | hand mutant "always counts five" killed                             |
| PLAUSIBLE: a throwing builder hangs the page in "applying"           | R7 caught → "Could not save"; the component's promise also has a `.catch` | R7 test                                                             |
| PLAUSIBLE: quadratic volume count (4.1 s, 300 sessions / 36k shots)  | shots, series, stations indexed once                                      | one-off timing on the same shape: 10.5 ms (probe not committed)     |
| PLAUSIBLE: Add Tag reports success on a tag deleted meanwhile        | R6 tag liveness checked after the push; the page says so                  | R6 tests                                                            |
| Docs: B4's "seconds" untrue with Retry; counter overwrite undersold  | R10 B4 and the manual reworded                                            | review                                                              |
| (found by the R5 browser check) a refused session counted as changed | R11                                                                       | U7/R5 expectations                                                  |
| (coordinator) mirror #669's held-request and user binding            | R12 `Built.userId`, `accountChanged`, one Apply/Retry button              | R12 tests in `apply.test.ts`                                        |

### Gauntlet (fresh, at `3e0c9ea`)

| Layer                                           | Command                                                                | Result                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                           | exit 0; vitest 174 files, 3037 tests; jest 698; i18n 1270 keys, 0 issues; 97 packages                             |
| Coverage (gated)                                | `pnpm check`                                                           | 100% statements 3755/3755, branches 2370/2370, functions 873/873, lines 3190/3190 (now incl. `web/src/bulk/*.ts`) |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                     | 15 files, 158 tests passed (W1–W5)                                                                                |
| Mutation (tool)                                 | `npx stryker run --mutate shared/src/sync-client/bulk-edit.ts`         | 280 killed, 1 survived: 99.64% (equivalent, below)                                                                |
| Mutation (hand, fails closed)                   | `node scripts/manual-mutation-web-bulk.mjs`                            | 19/19 killed, incl. 2 against K21 alone and the verifier's three surviving mutants                                |
| Property-based                                  | K17, K21 (500 runs each)                                               | pass                                                                                                              |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=301 <new suites>`   | 6 files, 65 tests passed                                                                                          |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check` | built; 25 translated pages current; no dangling anchors                                                           |

**The three surviving mutants are equivalent.** In `bulk-edit.ts`'s
`liveFirearm` and `model.ts`'s `bulkRows`, `firearmId === null ? undefined :
…get(firearmId)` → `false ? … : …get(firearmId)`: `Map.get(null)` on a map
keyed by string ids is `undefined`, as the guarded branch. In `bulkRows`'s
sort, `<` → `<=`: the keys include the unique id, so no two are equal. The
first page-module run had 12 survivors; 3 were redundant guards in
`filterRows` (rewritten without them) and 6 were gaps (a payload without
`deleted_at`/`location`/`firearm_id`, the cross-session tag sort,
`afterEdit(IDLE)`), now tested.

### Real execution (round 2)

Same `wrangler dev` (port 8801) and synthetic account. Two sessions moved
from the second gun to the first; the push was held in DevTools while
another client deleted one of them, then let through. Page: "Changed 1
session. 1 change was refused: deleted on another device. Their rounds were
taken back out of the firearms' round counts." Counters 40 → 30 and 360 →
370: only the surviving session's 10 rounds moved. (The first run of this
check said "Changed 2 sessions"; that is R11.) Screenshot
`09-refused-corrected.png` in the session scratchpad.

### Known limits (round 2)

- Between the edit and its correction the counters are briefly wrong (two
  transactions, R5). Closing the tab while the correction waits for Retry
  leaves them wrong; the page says the counts still need correcting.
- The firearm rows are absolute values: a phone saving series on the same
  firearm between the web's pull and its push (or its Retry) loses those
  rounds, or the web loses its move (B4 as reworded in R10). Not prevented.

## Round 3 (after the full PR review, R13–R20)

- **Source state:** commit `a4a1743`, rebased onto #669 at `caffb4d` (its
  shared re-sign-in, `unconfirmed` flag and fieldset fixes). Not
  independently re-verified.
- **Spec approval (at the time):** not obtained; B1–B10 and R1–R20 awaited
  the maintainer. B7 unchanged: #676 is still open.

| Review finding                                     | Fix                                                    | Evidence                                                     |
| -------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| 1 Add Tag with no live target creates a stray tag  | R13                                                    | K13 (seen failing before the fix)                            |
| 2 re-sign-in; a dropped correction not said        | R15 shared `SignInAgain`, App remount, carried message | `apply.test.ts` R12/R15, `messages.test.ts`, `carry.test.ts` |
| 3 a correction whose rebuild throws blocks forever | R16 give up after 3 attempts                           | `apply.test.ts` R16                                          |
| 4 a late throw could rebuild a correction          | R18 held before it is sent                             | `apply.test.ts` R18                                          |
| 5 refused links counted as changed                 | R17                                                    | U7                                                           |
| 6 edits during Apply                               | R19 fieldset + focus                                   | page wiring (no React tests; checked by typecheck and lint)  |
| 7 `submitRequest`                                  | R20 kept as the seam                                   | review                                                       |
| (#669) unconfirmed push                            | R14 held for Retry                                     | `apply.test.ts` R14, `messages.test.ts`                      |

### Gauntlet (fresh)

| Layer                                           | Command                                                                                                    | Result                                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tests + types + lint + format + i18n + licenses | `pnpm check` (at `97b650b`)                                                                                | exit 0; vitest 177 files, 3058 tests (`seed.test.ts` included; it had timed out once under a load of ~40 from other sessions, and passed 20/20 alone then); jest 698; i18n 1274 keys |
| Coverage                                        | `pnpm check`                                                                                               | 100% statements 3788/3788, branches 2400/2400, functions 884/884, lines 3220/3220                                                                                                    |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                         | 15 files, 158 tests                                                                                                                                                                  |
| Mutation (tool)                                 | `npx stryker run --mutate 'shared/src/sync-client/bulk-edit.ts,web/src/bulk/*.ts,!web/src/bulk/*.test.ts'` | 740 killed, 4 survived (99.46%)                                                                                                                                                      |
| Mutation (hand)                                 | `node scripts/manual-mutation-web-bulk.mjs`                                                                | 19/19 killed                                                                                                                                                                         |
| Docs gates                                      | `mkdocs build --strict`; translation check; anchor check                                                   | built; 25 pages current; no dangling anchors                                                                                                                                         |

Of the 4 survivors, 3 are the equivalent ones of round 2 (`Map.get(null)`
guards twice, the unique-key sort). The fourth was real: a correction where
only `rounds_since_maintenance` differs (the total floored either way). A K19
case was added at `a4a1743` and fails against that mutant (2 failed), then
passes restored; `bulk-edit.test.ts` 23/23. The rest of the gauntlet ran at
`97b650b`, one test-only commit earlier.

## Round 4 (after the second independent verifier, R21–R24)

- **Source state:** commit `f156260` on #669 at `caffb4d`. Not re-verified
  independently; spec approval not obtained at the time.
- **Verifier findings:** CONFIRMED 1 (a refused session's rounds were put
  back onto its source, which the deleting device had already backed out)
  → R21; PLAUSIBLE 2 (a delta on a target another device rewrote) → R22;
  PLAUSIBLE 3 (a dropped held firearm change said nothing) → R23; PLAUSIBLE
  4 (account not re-checked before a correction) → R24.
- **Model fixed in the tests, not only the code.** K21, W5 and P6 used to
  have the deleting device push only the tombstone; now it backs the rounds
  out of the source and pushes that firearm with the tombstones, as
  `deleteSessionAndSeries` does (P6 runs the phone's own function). The old
  source re-add fails K21 alone, P6 alone, and W5–W7 (3 failed), each run
  against that mutant and then restored.
- **Verifier cases on the real Worker:** V1 → W5 (f1 95/95, f2 13/13, a
  resent correction `duplicate`); V2 → W6 (f1 0/0, no correction); V3 → W7
  (no correction, f2 named to check, left at 15).

| Layer                                           | Command                                                                                                    | Result                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                                                               | exit 0; vitest 177 files, 3064 tests; jest 698; i18n 1277 keys                    |
| Coverage                                        | `pnpm check`                                                                                               | 100% statements 3808/3808, branches 2418/2418, functions 885/885, lines 3236/3236 |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                         | 15 files, 160 tests (W1–W7)                                                       |
| Mutation (tool)                                 | `npx stryker run --mutate 'shared/src/sync-client/bulk-edit.ts,web/src/bulk/*.ts,!web/src/bulk/*.test.ts'` | 787 killed, 4 survived (99.49%), all equivalent                                   |
| Mutation (hand)                                 | `node scripts/manual-mutation-web-bulk.mjs`                                                                | 24/24 killed, incl. the R21 source re-add against K21 alone and P6 alone          |
| Docs gates                                      | `mkdocs build --strict`; translation check; anchor check                                                   | built; 25 pages current; no dangling anchors                                      |

The four survivors: the two `Map.get(null)` guards and the unique-key sort
(as before), and `unverified: []` on a correction not yet built, which is
always replaced by the build's own list before it is read.

## Round 5 (the maintainer's rulings, R25–R29)

- **Source state:** code and tests at `6b1aca0b`, docs at `f527aea1`, this
  report on top. Branch `feat/web-bulk-edit` rebased onto #669 at
  `a0c61f59` (`git rebase --onto a0c61f59 caffb4d1`); the only conflict was
  the menu, which now takes its `Page` from `web/src/shell/route.ts`
  (`#bulk` added there and to `route.test.ts`).
- **Independent verification:** since performed. The branch was rebased
  again onto #669 at `d546999a` (#669's verification fixes only) and
  verified at `2eb4c5e6`; see _Independent verification (round 3)_ below.

### What changed

| Ruling                                              | Change                                                                                                                           | Evidence                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Drop the counter correction (R5, R16, R18, R21–R24) | `CounterPlan`, `countersAfter`, `buildCounterCorrection`, the correction stage, `MAX_CORRECTION_ATTEMPTS`, their strings removed | K18–K22, P6, W5–W7 and their 9 hand mutants removed; one push per action (U6, R25 tests)   |
| Name the firearms to check instead (R25)            | builder returns `firearms: { target, sources }`; `applied.firearmsToCheck`; one line naming them                                 | K23; R25 cases in `apply.test.ts`; `messages.test.ts`; 3 new hand mutants; browser check 6 |
| No warning on a dropped held change (R26)           | `afterEdit` drops any held request silently; `accountChanged` has no `dropped`                                                   | U8, R12 cases; `carry.ts` kept for the generic `accountChanged` line across the remount    |
| B7 agrees with the phone (R27)                      | P1's B7 case asserts both show the tag; the deviation note is gone                                                               | `web-bulk.test.ts` P1 (passes on main's `addSessionTag` since #676)                        |
| Rebase (R28, R29)                                   | backend spec origin `https://localhost`; R1 now exports two helpers                                                              | W1–W4 fail with `https://example.com` (4 failed), pass with `https://localhost`            |

Lines removed by the rework commit (`git show --numstat 6b1aca0b`): source
(`bulk-edit.ts`, `web/src/bulk/*.ts{,x}`) +137 / −360; tests +137 / −842;
i18n +4 / −14; the hand-mutant script +23 / −64.

### Gauntlet (fresh, after the last code edit)

| Layer                                           | Command                                                                                                    | Result                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                                                               | exit 0; vitest 187 files, 3125 tests; jest 714; i18n 1270 keys, 0 issues; 97 packages |
| Coverage (gated)                                | `pnpm check`                                                                                               | 100% statements 3808/3808, branches 2393/2393, functions 893/893, lines 3234/3234     |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                         | 19 files, 196 tests passed (W1–W4)                                                    |
| Mutation (tool)                                 | `npx stryker run --mutate 'shared/src/sync-client/bulk-edit.ts,web/src/bulk/*.ts,!web/src/bulk/*.test.ts'` | 630 killed, 3 survived, 0 no coverage: 99.53% (all equivalent, below)                 |
| Mutation (hand, fails closed)                   | `node scripts/manual-mutation-web-bulk.mjs`                                                                | 19/19 killed (7 unmutated suites pass first)                                          |
| Property-based                                  | K17 (500 runs)                                                                                             | pass                                                                                  |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=301 <the bulk suites>`                                  | 7 files, 62 tests passed                                                              |
| Traceability                                    | `pnpm reqstool:tags && pnpm reqstool:status`                                                               | exit 0; 21 tests passed, 0 failed; 0 SVCs missing tests                               |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check`                                     | built; 26 translated pages current; no dangling anchors                               |

**The three survivors are equivalent.** `bulk-edit.ts`'s `live`:
`firearmId !== null && …` → `true && …`: `Map.get(null)` on a map keyed by
string ids is `undefined`, so `isLive` is false either way. `model.ts`'s
`bulkRows`: the same `Map.get(null)` guard, and the sort's `<` → `<=`, whose
keys include the unique id, so no two are equal.

### Real execution (round 5)

`wrangler dev` on port 8801 with a fresh local D1, the built web app served
by the Worker, headless Chrome driven over CDP, one synthetic account
(`@example.invalid`; two firearms, nine sessions of 10 shots, 2025 and
2026). Screenshots in `~/tmp/sl-301-bulk-shots/`, not in the repo or the PR.

1. Filter 2025 (4 shown), select all, Add Tag "Season 2025" (new) →
   "Changed 4 sessions."; the server holds 4 live links to it.
2. All 9 selected, Remove Tag "Season 2025" → "Changed 4 sessions. 5
   already were that way."; 0 live links remain.
3. Filter 2026 (5 shown), Change Firearm to Pistol B → "Changed 5
   sessions."; counters A 400 → 350, B 0 → 50.
4. Search "outdoor" (2 shown), Change Location "Forest range" → "Changed 2
   sessions."; 2 sessions at Forest range.
5. Filter Jan–Mar 2026 (2 shown, on B), Change Firearm to Pistol A, with the
   push held (CDP `Fetch`) while the other device deleted one of them the
   phone's way (B backed out to 40, then the tombstones), then let through →
   "Changed 1 session. 1 change was refused: deleted on another device.
   Check the round counts of Training Pistol A and Training Pistol B with
   Adjust Round Count on the phone." One push; counters A 370, B 30.

### Known limits (round 5)

- **A refused moved session stays counted on the target** (step 5: A is 370,
  the phone's truth 360). The web writes no correction, as the phone writes
  none for its own refused push; the page names the target and the refused
  sessions' known sources, and the user corrects the count with Adjust
  Round Count. A firearm the page has no row for is not named. Closing the
  tab before reading the message leaves the count unexplained.
- A held firearm change dropped by an edit, or by another account signing
  in, is not mentioned (R26). If it did land, the next Apply sees those
  sessions as already moved; if its answer had refused a session, that
  refusal is not reported.
- The firearm rows are absolute values: a phone saving series on the same
  firearm between the web's pull and its push (or its Retry) loses those
  rounds, or the web loses its move (B4). Not prevented.

## Independent verification (round 3)

- Verifier: Claude Code, Fable 5.1; fresh context; given the repo @
  `2eb4c5e6` (on #669 at `d546999a`) + the task contract (with the
  maintainer's rulings) + the SPEC + the entry point. Not given the
  builder's conversation. Correlation broken: task context. Not broken:
  model.
- Rounds: 3 (cap 2; the maintainer approved a third on 2026-10-09). Rounds 1
  and 2 failed (above). Round 3 verdict: `passed`.
- Numbers at `2eb4c5e6`: `pnpm check` exit 0, vitest 187 files / 3137
  tests, jest 714; backend 19 files / 196 tests (W1–W4 by name); Stryker
  630 killed, 3 survived (99.53%, the three equivalent survivors above);
  `manual-mutation-web-bulk.mjs` 19/19; reqstool 21 tests, 0 SVCs missing.
- Attacked: the run; spec vs contract (each action against the phone's
  `getOrCreateTag`, `addSessionTag`, `removeSessionTag`, `updateSession`,
  `applyRoundCountDelta`, `sessionVolumes` and `sync-store.applyOne`; the
  server's `changeStatements`; the 500 limit; account switch; the
  refused-session message; i18n); test-gaming (20 mutants of its own, all
  killed); checker coverage (the N1 gate and the manual-mutation script
  fed known-bad input, both fail); the mapping in both directions. No
  correction path is left: one push per `applyEdit`.
- Findings, graded by the maintainer on 2026-10-10, fixed and disclosed,
  no new round:
  1. B7/K5 claimed links to deleted tags are removed; the web never pulls a
     deleted tag (R30).
  2. A target firearm deleted between pull and push is not named (R31):
     documented as an accepted limit, by the maintainer's ruling.
  3. Round 5 named #669 at `a0c61f59`; the verified tip sits on
     `d546999a` (3137 tests rather than 3125).
  4. Wording: _Known limits_ still said "the seconds between the fresh pull
     and the push" (retracted by R10); the manual said only shots move with
     a firearm change, leaving out extra rounds and fält stations.
     Note: the since-maintenance floor is pinned by K8/K17's independent
     oracle, not by the phone twin P3 alone, whose seed never reaches 0.
- Canary: not run.
- Fixed after the last verified state, therefore unverified: none in code;
  the spec, this report and the manual only.
