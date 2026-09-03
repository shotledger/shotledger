# Analytics report engine — evidence report

Companion to `docs/specs/analytics-report-spec.md`. Branch
`feat/analytics-filters`, worktree off `origin/main` @ `4404b47`.

## What was built

| Path                                   | Role                                                       |
| -------------------------------------- | ---------------------------------------------------------- |
| `shared/src/scoring/analytics.ts`      | The gauntleted module — filter + aggregation engine        |
| `shared/src/scoring/analytics.test.ts` | 29 behaviour-tagged tests (`A-F*`, `A-P*`, `A-R*`, `A-T*`) |
| `shared/src/export/json-log.ts`        | JSON report shaping (ordinary vitest, not the gauntlet)    |
| `shared/src/export/json-log.test.ts`   | 8 tests                                                    |

`shared/src/scoring/stats.ts` was **not** modified — `AnalyticsSeries`
extends `StatsSeries`, so the M5 engine and its evidence stand unchanged.

## Gauntlet results

### `pnpm check` — green

```
en.json: 690 keys, sv.json: 690 keys, 0 issues
eslint .                    (clean)
prettier --check .          All matched files use Prettier code style!
vitest run                  95 files, 1391 tests passed
jest (app)                  18 suites, 145 tests passed
```

Baseline before this branch: 94 files / 1381 vitest tests. The 10 new
vitest tests are the analytics ones not already counted in the scoped run
above, plus the JSON export's.

### `pnpm coverage` — 100% over the new module

```
Statements   : 100% ( 1817/1817 )
Branches     : 99.9% ( 1045/1046 )
Functions    : 100% ( 425/425 )
Lines        : 100% ( 1558/1558 )
```

The single uncovered branch is **pre-existing on `origin/main`** and lies
in `shared/src/sync-client/photo-queue.ts` (17/18 branches), not in
anything this branch touches. Verified by stashing the branch's changes and
re-running: the clean tree reports the identical `Branches: 99.9%
(1002/1003)` failure. `shared/src/scoring/analytics.ts` itself is at 100%
on all four counters (it contributes 61 statements, 43 branches and 26
functions to the covered totals above).

Flagged rather than fixed: `photo-queue.ts` belongs to the sync work, and
patching another feature's coverage gap inside an analytics PR would hide
it. It should be a small standalone fix.

### `pnpm mutation` (Stryker), scoped to the new file

```
npx stryker run --mutate 'shared/src/scoring/analytics.ts'

File          | % Mutation score | # killed | # survived |
analytics.ts  |            98.70 |      152 |          2 |
```

Break threshold is 95. Scoped rather than repo-wide purely for runtime;
`stryker.config.json`'s `mutate` glob (`shared/src/scoring/*.ts`) already
covers the file, so the unscoped run exercises it too.

**Both survivors are equivalent mutants**, in `filterAnalyticsSeries`:

```
if (filter.fromIso !== null && series.startedAt < filter.fromIso)   ->  if (true && ...)
if (filter.toIso   !== null && series.startedAt > filter.toIso)     ->  if (true && ...)
```

With the guard removed, the surviving comparison is `<string> < null` /
`<string> > null`. JavaScript coerces `null` to `+0` and any ISO-8601
timestamp to `NaN`, and every relational comparison against `NaN` is
`false` — so the mutant behaves exactly like the original for every input
the type system admits. Killing them would require a `startedAt` that
numerically coerces below zero (e.g. `'-1'`), which is not a timestamp.
Recorded here rather than worked around; the same class of survivor is
already documented for the M3 modules.

A third survivor was found and **killed** rather than excused:
`shot.valueTenths >= TEN_TENTHS` -> `< TEN_TENTHS` inside `analyticsTotals`
survived because the fixture happened to have as many tens as non-tens.
Test `A-T4: tenCount takes only shots at 10.0 and above` (values
`[100, 105, 99]`) makes the two counts differ.

## Behaviour coverage map

Every `A-` tag in the spec appears in at least one test name:

- `A-F1` … `A-F8` — `describe('filterAnalyticsSeries')`, 9 tests
- `A-P1` … `A-P9` — `describe('analyticsSessionPoints')`, 7 tests
- `A-R1` … `A-R4` — `describe('analyticsRecords')`, 5 tests
- `A-T1` … `A-T6` — `describe('analyticsTotals')`, 5 tests, including the
  cross-check that the totals and the per-session points agree

## Decisions taken during implementation

1. **A ten is `valueTenths >= 100`**, not `Math.round(tenthsToScore(v)) === 10`.
   The rounding form counts a decimal-scored 10.9 as an eleven. Documented
   as domain fact 5 in the spec because it is the one genuinely new rule
   here, and it is federation-neutral.
2. **Tag filtering is OR, not AND.** "Show me KM and Tävling sessions" is
   the natural reading of a multi-select tag filter; AND would return
   nothing for the demo data, where no session carries both.
3. **Sighter series survive `filterAnalyticsSeries`.** Filtering answers
   "which series is this report about"; the sighter rule is a scoring
   rule, and the aggregations already own it. Folding it into the filter
   would have silently dropped sighters from the volume metric.
4. **`analyticsRecords` returns `null`, never a fabricated zero**, when no
   session qualifies — the report then says so in words instead of drawing
   an empty chart or printing an unexplainable `0`.
5. **`scoredSeriesCount` requires a score, not just a series.** An empty
   just-created series would otherwise drag `meanSeriesTotalTenths` down
   the moment it is added, which is the bug `seriesAverageTenths` already
   guards against in `totals.ts`.

## Not covered by this gauntlet

`app/` is ordinary UI work under the CLAUDE.md carve-out ("routine UI work
uses normal tests instead"): the screens, the SVG chart component, the DB
glue in `app/src/db/queries/stats.ts` and the export hook are verified by
`pnpm check` plus the on-device pass recorded in the PR, not by coverage or
mutation thresholds.

## Device verification (`shotledger3` AVD, Metro 8083)

Dev build from this worktree, demo data via `/dev` (1169 shots, 30 sessions,
tags `KM` / `Träning` / `Tävling`). No real data, no PII — every number and
name below comes from the synthetic seed.

| Checked                    | Result                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Filter form, `en` and `sv` | All six cards render; each has its one-line explanation                                                                               |
| Interval chips             | `30 d / 6 mo / 12 mo / Max / Custom` and `30 dgr / 6 mån / 12 mån / Max / Anpassa` all fit on **one line, no wrapping**               |
| Records entry point        | Chevron + pressed state; reads as tappable                                                                                            |
| Tag filter                 | Multi-select pills; `Tävling` alone matched **7 of 30** sessions, `Träning`+`Tävling` matched 30 (OR)                                 |
| Report header              | Filter echoed with tag **names**; "Sessions that match your filter: N"                                                                |
| Records card               | Highest session score 489.0, most inner tens 6, most tens 14 — each naming its session, each tappable through to the session          |
| Sum vs per-shot totals     | 1169 shots / 7382.0 total / 30 sessions / 185 series alongside mean/shot, mean/series, SD, X%                                         |
| Charts                     | Three time-series charts with gridlines, y-axis values and localized date ticks (`Mar 6 / Jun 1 / Sep 2`, `6 mars / 1 juni / 2 sep.`) |
| Dark theme                 | Purple Rain lavender line + area, gridlines and axis text legible                                                                     |
| Export picker              | PDF / JSON / CSV rows plus the "the vault is never part of an export" note                                                            |

All three exports were run end to end and the artifacts inspected:

- **JSON** — `shotledger-report-2026-09-02.json`, 185 KB. `format`/`version`
  first, filter echoed with tag names, summary carrying both halves
  (`totalScore: 7382`, `meanScorePerShot: 7.981`, `shotsFired: 1169`,
  `scoredShotCount: 925`), all three records, and 30 sessions with their
  series and shots. No vault content anywhere in the document.
- **CSV** — `shotledger-report-2026-09-02.csv`, 1080 rows over the M7
  24-column header, 30 distinct `session_id`s: the same filtered set.
- **PDF** — `expo-print` produced a PDF in the Print cache and the share
  sheet opened.

One artifact worth recording, not a bug: editing `use-stats-data.ts` while
the report screen was mounted produced a render error, because Fast Refresh
preserves the hook's `useState` object across the edit and that object
predates the new field. A full app restart clears it; it cannot happen to a
user.

### Environment notes for the next agent

- **The Android package is `app.shotledger`, not `com.anonymous.app`.** The
  CLAUDE.md agentic-loop section still names the prebuild default, which
  costs a few minutes when `pm list packages | grep anonymous` comes back
  empty after a successful install.
- `expo run:android` was avoided entirely: `expo prebuild --platform
android`, then `./gradlew assembleDebug -PreactNativeDevServerPort=8083`,
  then `adb -s <serial> install -r -d` and an explicit
  `app://expo-development-client/?url=...` intent. With three agents sharing
  the machine this is the only way to be sure the build lands on the
  intended AVD.
