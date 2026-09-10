# Analytics report engine — executable spec

**Spec approval: not obtained (autonomous run).** This document is the
artifact to review after the fact, per `.claude/skills/old-coder/SKILL.md`.
Written before implementation; append-only during the task.

## Scope

One new pure module under `shared/src/scoring/`, which CLAUDE.md puts under
the mandatory old-coder rule:

- `shared/src/scoring/analytics.ts` — the filter + aggregation engine behind
  the rebuilt Statistics tab (a filter form that generates a report, rather
  than the M5 always-live view).

Out of scope for this spec, covered by ordinary vitest instead:

- `shared/src/export/json-log.ts` — pure JSON report shaping (no scoring
  math; it consumes this module's output and the existing
  `shared/src/csv` `SessionExport` shape).
- Everything in `app/` — DB glue, hooks, screens, SVG chart components.

`shared/src/scoring/stats.ts` is **not modified**: `AnalyticsSeries` extends
its `StatsSeries` rather than adding fields to it, so the M5 engine and its
evidence stay untouched.

## Setup plan

- **Isolation:** git worktree `~/tmp/shotledger-wt-analytics`, branch
  `feat/analytics-filters` off `origin/main` (two other agents work in
  parallel on the session and home screens).
- **Files the gauntlet will add**, by path:
  - `shared/src/scoring/analytics.ts`
  - `shared/src/scoring/analytics.test.ts`
  - `docs/specs/analytics-report-spec.md` (this file),
    `docs/specs/analytics-report-evidence.md`
- **New dependencies:** none. Charts are drawn by hand with
  `react-native-svg`, already a direct dependency (see the M5 decision and
  the 2026-09-02 share-cards row in `docs/decisions-log-archive.md` —
  `victory-native` and
  `@shopify/react-native-skia` are _not_ in the lockfile despite the stale
  library table in `docs/implementation-plan.md` §"Libraries").
- **Gauntlet composition:** `pnpm coverage` (vitest + v8; `vitest.config.ts`
  already includes `shared/src/scoring/**/*.ts` at a 100% threshold, so the
  new file is inside the gate automatically) + `pnpm mutation` scoped to the
  new file (`stryker.config.json`'s `mutate` glob is
  `shared/src/scoring/*.ts`, so the unscoped run covers it too; the scoped
  run is what the evidence records, for runtime reasons) + `pnpm check`.

## Calibration

**Tier 2** (normal). Pure, closed-form aggregation over small in-memory
arrays — no money, auth, concurrency or persistence. Full RED → GREEN loop
per behavior with table-driven cases; no property-based tests (there is no
round-trip or idempotence invariant to exploit — the functions are folds).

## Domain facts

From `.claude/skills/spsf-domain/SKILL.md`, §6.3/§6.5 and the M5 spec, all
already encoded in `stats.ts` and reused here rather than re-derived:

1. Sighter series (`isSighter`) are excluded from every score statistic but
   **included** in volume metrics.
2. `value_tenths` is the single integer storage for both scoring modes;
   division by 10 happens only at display time.
3. A WebShooter-imported series (Amendment WS1) has no shot rows — only
   `totalOverride: { tenths, shotCount }`. It counts in series-level and
   volume metrics and is invisible to per-shot metrics.
4. `isInnerTen` means the shooter pressed `(X)` — a centrumtia. A plain ten
   is not a centrumtia.

Genuinely new, and deliberately federation-agnostic (the app is
international by design — see `app/PRODUCT.md`'s Positioning):

5. **A "ten" is any shot with `valueTenths >= 100`.** In integer scoring a
   ten is exactly 100; in decimal scoring it is 100–109. Rounding
   `tenthsToScore` instead would count a 10.9 as an eleven. No SPSF-specific
   rule is involved — this is the generic ring-scoring definition and holds
   for any federation using a 10-ring target.

## Behaviors — `analytics.ts`

Naming: `A-<n>` behaviors are asserted one-to-one by
`shared/src/scoring/analytics.test.ts`.

### Types

```ts
interface AnalyticsSeries extends StatsSeries {
  sessionType: 'training' | 'competition';
  /** Tag ids of the OWNING SESSION, denormalised onto each of its series. */
  tagIds: readonly string[];
}

interface AnalyticsFilter {
  fromIso: string | null; // inclusive lower bound on series.startedAt
  toIso: string | null; // inclusive upper bound
  sessionType: 'training' | 'competition' | null;
  disciplineId: string | null;
  shotsPerSeries: number | null;
  tagIds: readonly string[]; // OR-match; empty = no tag filter
}
```

### `filterAnalyticsSeries(list, filter)`

- **A-F1** A filter with every field null/empty returns the input unchanged
  (same order, same members). `ANY_ANALYTICS_FILTER` is that value.
- **A-F2** `fromIso` keeps series with `startedAt >= fromIso`; `toIso` keeps
  `startedAt <= toIso`. Both bounds are **inclusive** (the app passes
  `T00:00:00.000Z` / `T23:59:59.999Z`, matching M5's `periodRange`).
- **A-F3** `sessionType` keeps only series whose owning session has that
  type; `null` keeps both.
- **A-F4** `disciplineId` keeps only exact matches; `null` keeps all.
- **A-F5** `shotsPerSeries` keeps only series whose **fired shot count**
  equals it. The fired count is `totalOverride.shotCount` when set,
  otherwise `shots.length` — so a WebShooter series is filterable by its
  imported length even without shot rows.
- **A-F6** A non-empty `tagIds` keeps a series when its `tagIds` intersects
  the filter's (OR, not AND — "any of these tags"). An empty filter list
  keeps everything, including untagged series.
- **A-F7** Predicates compose with AND across fields.
- **A-F8** Sighter series are **not** dropped here — filtering is about
  membership, not scoring. The aggregation functions apply the sighter rule.

### `analyticsSessionPoints(list)`

One point per distinct `sessionId`, ascending by `startedAt`, ties broken by
`sessionId` so the order is total and deterministic.

```ts
interface AnalyticsSessionPoint {
  sessionId: string;
  startedAt: string;
  scoredSeriesCount: number; // non-sighter series carrying a score
  scoredShotCount: number; // non-sighter shots
  sessionTotalTenths: number; // sum of scored series totals
  meanSeriesTotalTenths: number | null;
  meanShotTenths: number | null;
  innerTenCount: number;
  tenCount: number;
}
```

- **A-P1** Sighter series contribute to none of these fields.
- **A-P2** `sessionTotalTenths` sums the scored series' totals; an override
  series contributes `totalOverride.tenths`.
- **A-P3** `scoredSeriesCount` counts non-sighter series that carry a score
  — i.e. `totalOverride != null || shots.length > 0`. An empty just-created
  series is not counted, so adding one never drags the mean down.
- **A-P4** `meanSeriesTotalTenths = sessionTotalTenths / scoredSeriesCount`,
  or `null` when that count is 0 (never `0`, never `NaN`).
- **A-P5** `meanShotTenths` is the mean of the session's non-sighter shots,
  `null` when there are none. An override series has no shots and so cannot
  move it.
- **A-P6** `innerTenCount` counts non-sighter shots with `isInnerTen`.
- **A-P7** `tenCount` counts non-sighter shots with `valueTenths >= 100`
  (domain fact 5), inner tens included — a centrumtia is also a ten.
- **A-P8** The startedAt of a session is taken from its first series in
  input order; every series of a session carries the same session
  `startedAt` by construction.
- **A-P9** An empty input gives an empty array.

### `analyticsRecords(points)`

```ts
interface AnalyticsRecord {
  sessionId: string;
  startedAt: string;
  value: number;
}
interface AnalyticsRecords {
  bestSessionTotalTenths: AnalyticsRecord | null;
  mostInnerTens: AnalyticsRecord | null;
  mostTens: AnalyticsRecord | null;
}
```

- **A-R1** `bestSessionTotalTenths` is the maximum `sessionTotalTenths`
  among points with `scoredSeriesCount > 0`; `null` when none qualify.
- **A-R2** `mostInnerTens` / `mostTens` are the maxima among points with
  `scoredShotCount > 0`; `null` when none qualify. A set where every session
  has zero inner tens still yields a record of value 0 — that is a real record
  ("best so far is none"), and the UI shows it as `0`.
- **A-R3** Ties keep the **earliest** session (the first in the points'
  chronological order) — documented, not undefined behaviour.
- **A-R4** An empty input gives all three as `null`.

### `analyticsTotals(list)`

The "sum (all x shots)" half of the maintainer's request, alongside the
per-shot half.

```ts
interface AnalyticsTotals {
  sessionCount: number;
  scoredSeriesCount: number;
  volumeShotCount: number; // every shot, sighters included
  scoredShotCount: number;
  sumTenths: number; // sum over scored series (overrides included)
  meanShotTenths: number | null;
  meanSeriesTenths: number | null;
  innerTenCount: number;
  tenCount: number;
}
```

- **A-T1** `sessionCount` is the number of distinct `sessionId`s in the
  input, sighter-only sessions included (they were still range days).
- **A-T2** `volumeShotCount` delegates to `stats.ts`'s `volumeShotCount` —
  sighters and override shot counts included (domain facts 1 and 3).
- **A-T3** `sumTenths`, `scoredSeriesCount`, `meanSeriesTenths` are the
  series-level sums/mean over non-sighter scored series (override totals
  included); `meanSeriesTenths` is `null` when there are none.
- **A-T4** `scoredShotCount`, `meanShotTenths`, `innerTenCount`, `tenCount`
  are the per-shot figures over non-sighter shots; `meanShotTenths` is
  `null` when there are none.
- **A-T5** An empty input gives all counters 0 and both means `null`.
- **A-T6** `analyticsTotals` and `analyticsSessionPoints` agree: the sum of
  the points' `sessionTotalTenths` equals `sumTenths`, and likewise for
  `innerTenCount` / `tenCount` / `scoredShotCount` / `scoredSeriesCount`.
  (Consistency test, not a separate behaviour.)

## Non-goals

- No SQL. The engine takes plain arrays; the app assembles them
  (`app/src/db/queries/stats.ts`).
- No formatting, no i18n, no `Date` arithmetic beyond ISO string compare —
  ISO-8601 UTC strings sort lexicographically, which is what M5 already
  relies on.
- No new discipline/federation knowledge. Every filter dimension is a
  plain value the DB already stores, so the report works for any federation.

## Gauntlet exit criteria

1. `pnpm check` green (typecheck, app typecheck, i18n, lint, format, vitest,
   jest).
2. `pnpm coverage` green — 100% lines/functions/branches/statements over
   `shared/src/scoring/**`, the new file included.
3. Stryker over `shared/src/scoring/analytics.ts` at ≥95% mutation score
   (the repo `break` threshold), with any survivor explained in the evidence
   report.
