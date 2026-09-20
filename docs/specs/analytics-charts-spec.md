# Spec: charts that can be read

Issue #349, the chart item. Companion to
[`analytics-session-set-spec.md`](analytics-session-set-spec.md), which covered
the same issue's session-count item and explicitly left the charts out at the
maintainer's instruction.

Tier 2 (normal). No money, auth, concurrency or data loss; nothing here writes
to the database.

## Spec approval: not obtained (autonomous run)

The maintainer chose the shape on 2026-09-20 — **"all three"** of the faults
below, with mixed maxima resolved as **one line per discipline** — and then
instructed that the remaining queue be completed overnight while they slept.
This spec is therefore written and executed **without the correlation-breaking
review that spec approval provides**. The evidence report records the same, and
claims correspondingly lower confidence. The spec is the artifact to review
after the fact, alongside the PR.

## Why

Three faults in one screen, all invisible on demo data and all found on the
267-session real-data pass.

1. **The x-axis is ordinal, not temporal.** `x` is computed from the array
   index, so 111 sessions that share one imported timestamp (2023-12-30, a
   ShotLog bulk-import artefact) spread evenly across the left third as though
   they were 111 separate dates. The shape of the line is a lie about when
   things happened.
2. **The labels carry no year.** `formatShortDate` asks for `month` and `day`
   only, so a three-year range reads "Dec 30 … Jun 23 … Sep 15" and there is no
   way to tell which year any of it is.
3. **"Session Score" plots different maxima on one axis.** A precision session
   (max 350) and a milsnabb session (max 600) become one saw-toothed line whose
   shape carries no information.

A fourth, milder problem rides along: at a few hundred points the per-point
circles (r=2.5 in a 320-unit viewBox) merge into a band.

## What changes

### `shared/src/scoring/analytics.ts`

`AnalyticsSessionPoint` gains **`disciplineId: string`**, taken from the
session's series — every series of a session carries the session's discipline,
so the value is well defined. This is the only change to `shared`, and it is
additive: no existing field moves or changes meaning.

### `app/src/components/time-series-chart-math.ts` (new)

The pure geometry, extracted so it can be tested without rendering SVG:

- `timeExtent(points)` → `{ minMs, maxMs }` over the points' timestamps.
- `timeScale(iso, extent, plotLeft, plotWidth)` → the x coordinate, positioned
  by **time**. A degenerate extent (every point sharing one timestamp) puts
  every point at the middle of the plot rather than dividing by zero.
- `axisNeedsYear(points)` → true when the first and last point fall in
  different calendar years.
- `groupByDiscipline(points, pick)` → one `TimeSeriesLine` per discipline,
  each line's points chronological, lines ordered by discipline id so a
  discipline keeps its colour between renders.
- `LINE_COLORS` — a small categorical palette, applied by index.

### `app/src/components/time-series-chart.tsx`

- Takes `lines: readonly TimeSeriesLine[]` instead of a single `points` array.
- Draws a legend when there is more than one line.
- Per-point circles only when a line has at most `MAX_DOTS` (60) points; the
  area fill only when there is exactly one line.
- x from `timeScale`, date labels from `axisNeedsYear`.

### `app/src/app/stats/report.tsx`

All three time charts group by discipline. `formatShortDate` becomes
year-aware.

## Acceptance criteria

Ids are the test names.

### The point's discipline — `analyticsSessionPoints`

- **AP-1** a point carries the `disciplineId` of its session's series.
- **AP-2** every other field is unchanged — the existing `analytics.test.ts`
  and `sighter-scope.test.ts` pass untouched.

### Time axis — `timeExtent` / `timeScale`

- **TC-1** the earliest point lands on the left edge, the latest on the right.
- **TC-2** a point halfway in **time** lands at the middle of the plot — not
  the middle by index. The regression for the ordinal-axis bug: three points
  at day 0, day 1 and day 100 must NOT be evenly spaced.
- **TC-3** when every point shares one timestamp the extent is degenerate and
  every point lands mid-plot, with no division by zero and no `NaN`.
- **TC-4** a single point lands mid-plot.
- **TC-5** points out of chronological order are still placed by their
  timestamp, not their position in the array.

### Year-aware labels — `axisNeedsYear`

- **TC-6** true when first and last fall in different calendar years.
- **TC-7** false when they fall in the same one, including 1 January and
  31 December of that year.
- **TC-8** false for an empty list and for a single point.

### Grouping — `groupByDiscipline`

- **TC-9** one line per discipline, each carrying only its own points.
- **TC-10** lines are ordered by discipline id, so colours are stable between
  renders of the same data.
- **TC-11** each line's points are chronological.
- **TC-12** a point the accessor rejects (`null`) is dropped, and a discipline
  left with no points produces no line at all rather than an empty one.
- **TC-13** an empty input produces no lines.

### Negative constraints (must NOT change)

- **N-1** `filterAnalyticsSeries`, `analyticsTotals`, `analyticsRecords`,
  `analyticsReportSessions`, `analyticsReportTotals` and `analyticsReportSet`
  keep their signatures and behaviour.
- **N-2** `shared/src/scoring` stays at 100% line and branch coverage.
- **N-3** no new dependency — no charting library. The charts stay hand-drawn
  `react-native-svg`, as `group-plot.tsx` and `distribution-bar-chart.tsx` are.
- **N-4** no database schema change, no migration, no write path touched.
- **N-5** the Shot Distribution chart is not touched. It reads well and is the
  counter-example the issue itself names.
- **N-6** no new i18n key without both `en` and `sv`.

## Setup plan

- **Isolation**: branch `feat/stats-charts-349` off `main`.
- **New dependencies**: none.
- **Files added**, by path:
  - `docs/specs/analytics-charts-spec.md` (this file)
  - `docs/specs/analytics-charts-evidence.md`
  - `app/src/components/time-series-chart-math.ts`
  - `app/src/components/time-series-chart-math.test.ts`
- **Git**: commit this spec first; checkpoint at GREEN.
- **Tools**: already present — `pnpm check`, `pnpm coverage`, `pnpm mutation`,
  the emulator.
- **Docs**: `docs/manual/guides/statistics.md` and its `.sv.md` gain a
  paragraph on what the charts show and why there is a line per discipline.

## Gauntlet to be run

| Layer          | Command                                                           |
| -------------- | ----------------------------------------------------------------- |
| Full suite     | `pnpm check`                                                      |
| Coverage       | `pnpm coverage` — 100% threshold on `shared/src/scoring`          |
| Mutation       | `pnpm mutation` (Stryker)                                         |
| Docs           | `mkdocs build --strict`, `docs-translation-check`, `docs:anchors` |
| Real execution | the emulator — the report screen, read and screenshotted          |

The chart maths is pure and unit-tested; the SVG itself is verified by looking
at it on the emulator, which is the only thing that can tell whether a chart is
legible.

Property-based tests: not planned. `fast-check` is not in the lockfile, and
adding a dependency is forbidden by N-3.
