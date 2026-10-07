# Evidence report — web bulk edit (Tier 3)

Spec: [`web-bulk-edit-spec.md`](web-bulk-edit-spec.md), including its §8
Revisions R1–R4.

- **Spec approval: not obtained (autonomous run).** The spec was written,
  committed and implemented in one run; the key choices B1–B10 and the
  revisions are listed in the PR for the maintainer. Confidence is
  correspondingly lower: nobody but the author has read the contract.
- **Source state:** commit `41f55c7` (the code and the mutation script; the
  spec revisions and this report are committed on top). Branch
  `feat/web-bulk-edit`, on `feat/web-series-entry-impl` at `d6e1168` (#669).
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, fast-check 4.10.2, TypeScript 6.0.2 / native 7.0.2;
  backend vitest 4.1.11 with `@cloudflare/vitest-plugin`).
- **Entry point:** `pnpm check`; `cd backend && npx vitest run
--testTimeout=60000`; `npx stryker run --mutate
shared/src/sync-client/bulk-edit.ts`; `node
scripts/manual-mutation-web-bulk.mjs`.
- **Independent verification:** not performed. Declared downgrade: the
  adversarial pass was the author's own.

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

- B7 deviation, pinned by P1's second case: when a session's only link to a
  name is to a _deleted_ tag, the web adds the tag and shows it; the phone's
  `addSessionTag` counts the dead link and shows nothing. The web follows
  what readers show.
- A phone that edited the same session or firearm offline can overwrite the
  web's edit, or the reverse (ADR 0019 consequences; B4 narrows the window
  to the seconds between the fresh pull and the push).
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
