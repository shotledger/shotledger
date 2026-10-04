# Training vs competition — evidence

Spec: `docs/specs/session-type-comparison-spec.md`, approved by the
maintainer 2026-10-04 ("approved", replying to the spec path). Issue #570.

- **Tier:** 2.
- **Source state:** branch `feat/stats-training-vs-competition`, rebased on
  `origin/main` at d776887. All numbers below are from one fresh run after the
  last code edit.
- **Toolchain:** vitest 5.0.3, Node 24.12.0, Stryker (`pnpm exec stryker`,
  the repo's `stryker.config.json`).
- **Entry points:** `pnpm check` (types, lint, format, i18n, vitest with the
  100% coverage gate, jest) and
  `pnpm exec stryker run --mutate shared/src/scoring/session-type-comparison.ts`.

**Re-run at merge**, after rebasing onto `origin/main` at 0ec0c09 (#585
landed): `pnpm check` exit 0, 147 vitest files and 2736 tests passed, 55 jest
suites; Stryker on `session-type-comparison.ts` 86 killed, 0 survived (100.00);
mkdocs strict, translation and anchor checks pass.

## Scenarios → tests

All in `shared/src/scoring/session-type-comparison.test.ts`.

| Scenario                                                      | Test                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC1 one discipline, both sides                                | `TC1: one discipline, both sides`                                                                                                                                                                                  |
| TC2 one side only                                             | `TC2: one side only gives no rows`                                                                                                                                                                                 |
| TC3 series lengths not mixed                                  | `TC3: series lengths are not mixed`                                                                                                                                                                                |
| TC4 disciplines not mixed, ordered                            | `TC4: disciplines are not mixed, and rows are ordered by series count`; `TC4: equal series counts order by discipline id, then series length`; `TC4: the order counts both sides, not the difference between them` |
| TC5 sighters follow the scope                                 | `TC5: sighters follow the report scope`                                                                                                                                                                            |
| TC6 imported totals                                           | `TC6: imported totals count as series, not as shots`                                                                                                                                                               |
| TC7 median                                                    | `TC7: median of an odd and an even count`                                                                                                                                                                          |
| TC8 distinct sessions                                         | `TC8: session counts are distinct sessions`                                                                                                                                                                        |
| TC9 SD needs two series                                       | `TC9: SD needs two series`; `TC9: SD is the sample SD, over n - 1`                                                                                                                                                 |
| TC10 inner tens per series                                    | `TC10: inner tens per series, and the mean per shot`                                                                                                                                                               |
| TC11 empty input                                              | `TC11: empty input, and empty series, give no rows`                                                                                                                                                                |
| TC12 equal sides                                              | `TC12: equal sides have no gap`                                                                                                                                                                                    |
| Property: swapping session types swaps sides, negates the gap | `swapping every session type swaps the sides and negates the gap` (fast-check, 100 runs)                                                                                                                           |

Tests added beyond the scenario list, each pinning a rule the spec already
states: the second and third TC4 tests (the ordering rule's tie-breaks, and
that it sums both sides), the second TC9 test (sample SD over n−1), and the
mean-per-shot assertions in TC10. The third TC4 test and the second TC9 test
were added after mutation testing found that nothing pinned those rules. Both
passed on first run, and the mutation run below shows the mutants they target
now killed.

## Must NOT

| Constraint                                                         | Evidence                                                                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No change to existing `analytics.ts` / `stats.ts` exports or tests | `git diff origin/main -- shared/src/scoring/analytics.ts shared/src/scoring/stats.ts shared/src/scoring/*.test.ts` touches only the new test file      |
| No schema change, no dependency, no form screen                    | the diff touches no `app/src/db/schema*`, no `package.json`, no form screen                                                                            |
| Card not shown with Training or Competition picked                 | `typeComparison` is `[]` unless `sessionType === null` (`use-stats-data.ts`); on the emulator, Session Type → Training → Generate Report shows no card |
| No comparison across disciplines or series lengths                 | TC3, TC4                                                                                                                                               |

## Gauntlet

| Layer          | Command                                                                                        | Result                                                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite     | `pnpm check`                                                                                   | exit 0; vitest 147 files, 2736 tests passed; jest 55 suites passed                                                                                                                                                                                |
| Types          | `pnpm typecheck`, `pnpm typecheck:app` (in `pnpm check`)                                       | 0 errors                                                                                                                                                                                                                                          |
| Lint + format  | `pnpm lint`, `pnpm format` (in `pnpm check`)                                                   | 0 warnings                                                                                                                                                                                                                                        |
| Coverage       | `vitest run --coverage` (100% threshold on `shared/src/scoring/*.ts`; exits non-zero below it) | `session-type-comparison.ts`: lines, statements, functions, branches 100%                                                                                                                                                                         |
| Mutation       | `pnpm exec stryker run --mutate shared/src/scoring/session-type-comparison.ts`                 | 86 killed, 0 survived, 0 no coverage: score 100.00                                                                                                                                                                                                |
| Property       | fast-check property in the test file                                                           | passes                                                                                                                                                                                                                                            |
| Suite health   | `vitest run … --sequence.shuffle`                                                              | 16/16 passed in shuffled order                                                                                                                                                                                                                    |
| Real execution | Android emulator, demo data, Statistics → 12 mo → Generate Report                              | Card shows "Precision · 5-shot series" (Training 16 sessions, mean 40.0; Competition 4 sessions, mean 40.3; "Competition averages 0.2 points per series above training.") and a Practice (Ring Target) table; hidden with Session Type = Training |
| Supply chain   | no dependency change                                                                           | n/a                                                                                                                                                                                                                                               |
| Docs           | `mkdocs build --strict`, `docs-anchor-check`, `docs-translation-check`                         | pass                                                                                                                                                                                                                                              |

## Resolved during the run

- The first mutation run left 3 survivors (96.51%): an equivalent `[]` →
  `["Stryker was here"]` on the group's initial array (the junk element is
  dropped by the session-type filter), the ordering sum `a + b` → `a - b`,
  and the SD divisor `/ (n - 1)` → `* (n - 1)`, which two series cannot tell
  apart. The latter two got the tests named above. The equivalent one went
  away when the grouping was refactored under green to create each group with
  its first series.
