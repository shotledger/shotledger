# Training vs competition — executable spec

Issue #570. Maintainer decision (2026-10-04): a **Training vs Competition**
section in the existing Statistics report, shown when the Type filter is
**All**, with mean, median, best and spread side by side, the session counts
behind each side, and the gap called out.

Written before implementation; append-only during the task.

**Spec approval:** the maintainer, 2026-10-04, replying to the two spec
paths: "approved". They added an idea for later, a divided Statistics page,
filed as #588 and outside this spec.

- **Tier:** 2 (normal). A pure fold over in-memory series; no money, auth,
  concurrency or persistence.
- **Setup plan**
  - Isolation: branch `feat/stats-training-vs-competition` off `origin/main`
    in the existing `findings` worktree (a dedicated worktree already, so the
    maintainer's main checkout is untouched).
  - Git: DCO-signed commits (`git commit -s`), spec committed first, then a
    commit per GREEN; one PR.
  - Tools to install: none.
  - New dependencies: none. The UI uses existing components.
  - Files added, by path:
    - `shared/src/scoring/session-type-comparison.ts`
    - `shared/src/scoring/session-type-comparison.test.ts`
    - `docs/specs/session-type-comparison-spec.md` (this file) and
      `docs/specs/session-type-comparison-evidence.md`
  - Files changed: `shared/src/index.ts` (export), `app/src/app/stats/report.tsx`,
    `app/src/features/stats/use-stats-data.ts`, `app/src/i18n/{en,sv}.json`,
    `docs/manual/guides/statistics(.sv).md`.
  - Gauntlet: `pnpm check` (vitest + 100% coverage gate: the new file falls
    under `stryker.config.json`'s `shared/src/scoring/*.ts`, which
    `vitest.config.ts` also reads), `pnpm mutation` scoped to the new file
    with `--mutate`, and the app run on the emulator.

## The model

`compareSessionTypes(series, scope)` takes the report's matched series (the
same `AnalyticsSeries[]` and `SighterScope` the report's totals use) and
returns one **row per like-for-like group**:

- **A group is one discipline and one series length.** A series' length is
  its shot-row count, or `totalOverride.shotCount` for an imported total-only
  series. Comparing a 10-shot training series with a 5-shot match series says
  nothing, and neither does comparing precision with milsnabb.
- **The series counted** are the ones the report's totals count: those
  `isScoredSeries` keeps under the same `scope` (sighters only with
  _Include sighters_; empty series never).
- **A row exists only when both sides have at least one series.** A group
  shot only in training has nothing to compare against.
- Each side reports, in tenths: `sessionCount` (distinct sessions),
  `seriesCount`, `meanSeriesTenths`, `medianSeriesTenths`, `bestSeriesTenths`,
  `seriesSdTenths` (sample SD, `null` below two series), `meanShotTenths`
  (shot rows only; `null` if the side has none) and `innerTensPerSeries`
  (X count over the series that have shot rows; `null` if none do).
- `gapSeriesTenths` = competition `meanSeriesTenths` − training
  `meanSeriesTenths`. Negative means competition scores lower.
- Rows are ordered by total series count (both sides) descending, then
  `disciplineId`, then series length ascending, so the output is total and
  deterministic.

## Scenarios

```gherkin
Scenario: TC1 one discipline, both sides
  Given training session T1 with precision 5-shot series totalling 45 and 47
  And competition session C1 with precision 5-shot series totalling 43 and 41
  When compared
  Then there is one row: precision, length 5
  And training is sessionCount 1, seriesCount 2, mean 460, median 460,
      best 470, sd 14.142 (to 3 decimals)
  And competition is mean 420, median 420, best 430
  And gapSeriesTenths is -40

Scenario: TC2 one side only
  Given only training series
  Then there are no rows

Scenario: TC3 series lengths are not mixed
  Given training 5-shot and 10-shot precision series, and competition 5-shot ones
  Then there is one row, for length 5, and the 10-shot series are in no row

Scenario: TC4 disciplines are not mixed, and rows are ordered
  Given precision with 6 series in all and milsnabb with 3, both on both sides
  Then the rows are precision first, then milsnabb

Scenario: TC5 sighters follow the report's scope
  Given a competition sighter series totalling 30 and a competition series totalling 45
  And a training series totalling 44
  When compared without Include sighters, competition mean is 450
  When compared with Include sighters, competition mean is 375

Scenario: TC6 imported totals count as series, not as shots
  Given a competition side made only of total-only series (480 and 460 over 5 shots)
  Then competition mean is 470 and meanShotTenths and innerTensPerSeries are null
  And the row still exists, grouped under length 5

Scenario: TC7 median
  Given a side with series 40, 50, 45 (odd) the median is 450
  Given a side with series 40, 50, 45, 47 (even) the median is 460

Scenario: TC8 session counts are distinct sessions
  Given training sessions T1 (3 series) and T2 (1 series)
  Then training sessionCount is 2 and seriesCount is 4

Scenario: TC9 SD needs two series
  Given a side with a single series, its seriesSdTenths is null

Scenario: TC10 inner tens per series
  Given a side with two 5-shot series holding 3 X and 1 X
  Then innerTensPerSeries is 2

Scenario: TC11 empty input
  Given no series, there are no rows

Scenario: TC12 equal sides
  Given identical series on both sides, gapSeriesTenths is 0
```

Plus one fast-check property: swapping every series' `sessionType` swaps the
two sides of every row and negates `gapSeriesTenths`.

## UI (verified on the emulator, not by these tests)

- The card appears in the report only when the Type filter is **All** and at
  least one row exists. With Training or Competition picked, it is not shown.
- Per row: the discipline name and "5-shot series", then two columns,
  Training and Competition: Sessions, Mean, Median, Best, Spread (SD),
  Avg X. Values are shown in points (tenths ÷ 10).
- A line calls out the gap: "Competition averages 4.0 points per series below
  training." / "… above training." / "Competition and training average the
  same."
- `docs/manual/guides/statistics.md` and `.sv.md` describe the card.

## Must NOT

- Change any existing export of `analytics.ts` or `stats.ts`, or any existing
  test or assertion.
- Change the DB schema, add a dependency, or touch a form screen (those
  belong to #569).
- Show the card when the Type filter is Training or Competition.
- Compare across disciplines or across series lengths.

## Revisions

- (none yet)
