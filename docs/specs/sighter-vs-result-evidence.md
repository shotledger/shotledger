# Sighter vs competition result — evidence

Spec: `docs/specs/sighter-vs-result-spec.md`, approved by the maintainer
2026-10-04 ("approved", replying to the spec path). Issue #573.

- **Tier:** 2.
- **Source state:** branch `feat/stats-sighter-vs-result` off `origin/main`
  at d776887. All numbers below are from one fresh run after the last code
  edit.
- **Toolchain:** vitest 5.0.3, Node 24.12.0, Stryker with the repo's
  `stryker.config.json`.
- **Entry points:** `pnpm check` and
  `pnpm exec stryker run --mutate shared/src/scoring/sighter-relation.ts`.

**Re-run at merge**, after rebasing onto `origin/main` at f54060d (#585 and
#591 landed; the conflicts in `shared/src/index.ts`, `report.tsx`,
`use-stats-data.ts`, the i18n files and the Statistics guide were additions on
both sides, all kept): `pnpm check` exit 0, 148 vitest files and 2753 tests
passed, 55 jest suites, en/sv 1160 keys each; Stryker on `sighter-relation.ts`
127 killed, 1 timeout, 1 survived (the same equivalent mutant), 99.22; mkdocs
strict, translation and anchor checks pass.

## Scenarios → tests

All in `shared/src/scoring/sighter-relation.test.ts`.

| Scenario                                                     | Test                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| SR1 perfect positive                                         | `SR1: a perfect positive relation`                                                       |
| SR2 perfect negative                                         | `SR2: a perfect negative relation`                                                       |
| SR3 below the minimum                                        | `SR3: below the minimum`                                                                 |
| SR4 no variance                                              | `SR4: no variance gives no correlation` (a flat sighter and a flat result)               |
| SR5 what qualifies                                           | `SR5: what does not qualify`                                                             |
| SR6 sighter and result values                                | `SR6: the point is mean per shot, and a final is not in the result`                      |
| SR7 pooled stage sighters                                    | `SR7: stage sighters are pooled`                                                         |
| SR8 disciplines apart, ordered                               | `SR8: disciplines stay apart, ordered by count then id`                                  |
| SR9 strength buckets                                         | `SR9: strength buckets and direction`; `SR9: bucket edges belong to the stronger bucket` |
| SR10 empty input                                             | `SR10: empty input`                                                                      |
| Points chronological, ties by session id (the model section) | `points are chronological, ties broken by session id`                                    |
| Property: r within [-1, 1]                                   | `stays within [-1, 1]` (fast-check)                                                      |
| Property: invariant under positive linear rescaling          | `is unchanged by a positive linear rescaling of either axis` (fast-check)                |
| Property: symmetric                                          | `is symmetric in its axes` (fast-check)                                                  |

Two more tests on `pearsonCorrelation`: `is null without variance`, and
`matches a hand-worked value` (x 1..5 against y 2, 4, 5, 4, 5: Sxy 6, Sxx 10,
Syy 6, so r = 6/√60). That test was written wrong first (Syy 6.8) and
corrected while the module was still a stub, before any implementation
existed.

## Must NOT

| Constraint                                                   | Evidence                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| No change to existing `shared/src/scoring/` exports or tests | `git diff origin/main -- shared/src/scoring` lists only the two new files                                |
| No sighter or final in the result, no training session       | SR5, SR6                                                                                                 |
| No pooled disciplines                                        | SR8                                                                                                      |
| No causal claim                                              | the card's caveat ("…not that one causes the other…") and the manual's "go together, not causes" section |
| No schema change, no dependency                              | no change under `app/src/db/schema*` or to any `package.json`                                            |

## Gauntlet

| Layer                     | Command                                                                 | Result                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite                | `pnpm check`                                                            | exit 0; vitest 147 files, 2737 tests passed; jest 55 suites passed                                                                                                                                              |
| Types, lint, format, i18n | in `pnpm check`                                                         | clean; en/sv 1143 keys each                                                                                                                                                                                     |
| Coverage                  | `vitest run --coverage` (100% gate)                                     | `sighter-relation.ts`: lines, statements, functions, branches 100%                                                                                                                                              |
| Mutation                  | `pnpm exec stryker run --mutate shared/src/scoring/sighter-relation.ts` | 127 killed, 1 timeout, 1 survived: score 99.22                                                                                                                                                                  |
| Property                  | three fast-check properties                                             | pass                                                                                                                                                                                                            |
| Suite health              | `vitest run … --sequence.shuffle`                                       | 17/17 passed in shuffled order                                                                                                                                                                                  |
| Real execution            | Android emulator, demo data, Statistics → All → Generate Report         | Card shows a scatter per discipline (Precision, Practice (Ring Target), National Combined Match); Precision has 4 competitions and reads "Needs 6 more competitions with a sighter before it can say anything." |
| Docs                      | `mkdocs build --strict`, `docs-anchor-check`, `docs-translation-check`  | pass                                                                                                                                                                                                            |

### Survivor, classified

- `sighter-relation.ts:119` `r > 0` → `r >= 0`: **equivalent**. The direction
  is computed only when `strength` is not `none`, which needs |r| ≥ 0.1, so r
  is never 0 there.

### Known limit

- The verdict sentences for 10 or more competitions (positive, negative,
  none, no variance) were not reached in the app: the demo data holds only 4
  qualifying precision competitions. What picks the sentence is unit-tested
  (`describeCorrelation`, SR1–SR4, SR9); the wording is plain i18n, checked
  for matching keys by `pnpm i18n:check`.
