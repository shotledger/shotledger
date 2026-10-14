# This session vs your usual form — evidence

Spec: `docs/specs/session-vs-usual-form-spec.md` (issue #798).

**Spec approval: not obtained (autonomous run).** The maintainer asked for
#798 to be done overnight and was asleep while it ran, so the spec was not
reviewed before the code. Confidence is correspondingly lower: the spec,
especially its "Decisions taken here", is the artifact to review after the
fact.

## Spec → tests

All in `shared/src/scoring/usual-form.test.ts`.

| Scenario                               | Test                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UF1 the 100 series before the session  | `UF1: the baseline is the 100 series before the session`; `UF1: ties on startedAt keep input order, and baselineSize bounds the window`                 |
| UF2 discipline, class, sighters, empty | `UF2: the baseline matches discipline and class, and leaves out sighters and empty series`; `UF2: a missing class matches only a missing class`         |
| UF3 per-series and per-shot figures    | `UF3: per-series and per-shot figures`                                                                                                                  |
| UF4 expected total and over/under      | `UF4: expected total and over/under`; `UF4: scoring under the expected total gives a negative over/under`                                               |
| UF5 shares of 10s and 9-or-better      | `UF5: shares of 10s and 9-or-better`; `UF5: the boundaries are 10.0 and 9.0 exactly`                                                                    |
| UF6 stored totals                      | `UF6: stored totals count per series, not per shot`; `UF6: a side of stored totals only has no per-shot figures`                                        |
| UF7 hits discipline                    | `UF7: a hits discipline has no shares`; `UF7: a discipline the app does not know is treated as rings`                                                   |
| UF8 no baseline                        | `UF8: no baseline`                                                                                                                                      |
| UF9 short baseline                     | `UF9: 19 earlier series show figures but no verdict; 20 give one`                                                                                       |
| UF10 bands                             | `UF10: the verdict follows the bands`                                                                                                                   |
| UF11 standard error of n               | `UF11: z is the difference over the standard error`; `UF11: the verdict weighs the session series count`; `UF11: worse sessions get the worse verdicts` |
| UF12 flat baseline                     | `UF12: a zero SD gives 0 for no difference, and an infinite z otherwise`; `UF12: a flat baseline`                                                       |
| UF13 unknown session                   | `UF13: an unknown session is null`                                                                                                                      |
| UF14 own session never its baseline    | `UF14: the session itself and sessions at the same time are never its baseline`                                                                         |
| UF15 only sighters                     | `UF15: a session of only sighters has no figures and no verdict`                                                                                        |
| Property: verdict monotone in the mean | `raising every session series never makes the verdict worse` (fast-check, 100 runs)                                                                     |
| Constants (100 / 20)                   | `the baseline is 100 series and the verdict needs 20`                                                                                                   |

The bar positions and the signed-number formatting are pinned in
`app/src/features/session/usual-form-scale.test.ts` (5 tests).

RED: every test but the constants one failed against a stub that threw
`not implemented` (24 failed, 1 passed) before the implementation was written.
The UF15 delta assertions and the second UF7 test were added after the
mutation run below; they passed at once, and the re-run shows the two mutants
they target killed.

## Must NOT

| Constraint                                 | Evidence                                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| No other `stats.ts` export or test changed | `git diff origin/main -- shared/src/scoring/stats.ts shared/src/scoring/stats.test.ts` removes only `compareRecentSeries` and its `describe` block |
| No schema change, no dependency            | the diff touches no `app/src/db/schema*`, no `drizzle/`, no `package.json` or lockfile                                                             |
| No raw z-score shown, no invented baseline | the UI reads only `verdict` (`usual-form-card.tsx`); UF8 (no baseline → every baseline figure `null`); "No earlier series …" line in the app       |
| The maths lives in `shared/`               | `usual-form-card.tsx` and `use-session-stats.ts` call `compareWithUsualForm`; the app adds only bar positions and number formatting                |

## Gauntlet

All numbers from runs after the last code edit.

| Layer          | Command                                                                                             | Result                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite     | `pnpm check`                                                                                        | exit 0, after rebasing on `origin/main`; vitest 219 files, 3725 tests passed; jest 71 suites, 794 tests passed                                                         |
| Types          | `pnpm typecheck`, `pnpm typecheck:app`, `pnpm typecheck:web` (in `pnpm check`)                      | 0 errors                                                                                                                                                               |
| Lint + format  | `pnpm lint`, `pnpm format`, `pnpm i18n:check` (in `pnpm check`)                                     | 0 warnings; en.json and sv.json 1372 keys each, 0 issues                                                                                                               |
| Coverage       | `vitest run --coverage` (100% threshold on `shared/src/scoring/*.ts`)                               | passes; `usual-form.ts` lines, statements, functions, branches 100%                                                                                                    |
| Mutation       | `pnpm exec stryker run --mutate shared/src/scoring/usual-form.ts`                                   | 131 killed, 0 survived, 0 no coverage: score 100.00                                                                                                                    |
| Property       | fast-check property in the test file                                                                | passes                                                                                                                                                                 |
| Suite health   | `vitest run shared/src/scoring/usual-form.test.ts --sequence.shuffle`                               | 26/26 passed in shuffled order                                                                                                                                         |
| Real execution | web preview (`expo start --web` behind `coi-proxy.mjs`), demo data, a precision session → **Stats** | "Vs. Your Usual Form · Compared with the 65 series before this session. · About usual", both bars, "Expected 198.7 · Scored 200 · +1.3", shares of 10s and 9-or-better |
| Supply chain   | no dependency change                                                                                | n/a                                                                                                                                                                    |
| Docs           | `mkdocs build --strict`, `docs-anchor-check`, `docs-translation-check`                              | pass                                                                                                                                                                   |

## Resolved during the run

- The first mutation run left 2 survivors (98.47%): `delta`'s `a !== null`
  check (an empty session side would have subtracted from `null`) and the
  optional chaining on `getDiscipline(...)` (an unknown discipline). Both got
  the tests named above; the re-run is the 100.00 in the table.
- Exporting `stats.ts`'s private `seriesTotalTenths` collided with
  `entry.ts`'s export of the same name through `shared/src/index.ts`, so
  `usual-form.ts` keeps its own copy, as `analytics.ts` and
  `session-type-comparison.ts` already do.
