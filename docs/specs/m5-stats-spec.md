# M5 statistics — executable spec

**Spec approval: not obtained (autonomous run).** This document is the
artifact to review after the fact, per `.claude/skills/old-coder/SKILL.md`.
Written before implementation; append-only during the task.

## Scope

Two new pure modules in `shared/src/scoring/`, both under the old-coder
mandatory rule (CLAUDE.md: "mandatory for changes to `shared/scoring/`"):

- `standardmedalj.ts` — §6.5b point thresholds, new module (did not exist
  before M5).
- `stats.ts` — the statistics engine consumed by the `/stats` tab and the
  session-detail Stats toggle.

No dependency changes for these two files (plain TS, no new packages — the
setup plan below covers the _UI_ chart dependency separately, which is a
component-layer decision, not part of this module's spec).

## Setup plan

- **Isolation:** working branch `feat/m5-stats`, no worktree — this repo's
  existing convention (M3/M4 also worked directly on the feature branch);
  blast radius is one PR reviewed via the gauntlet, matching Tier 2/3
  calibration below.
- **Files the gauntlet will add**, by path:
  - `shared/src/scoring/standardmedalj.ts`, `shared/src/scoring/stats.ts`
  - `shared/src/scoring/standardmedalj.test.ts`, `shared/src/scoring/stats.test.ts`
  - `docs/specs/m5-stats-spec.md` (this file), `docs/specs/m5-stats-evidence.md`
- **New dependencies:** none for these two modules. (`react-native-svg` is
  added separately for the chart components — justified in the M5 report,
  not part of this spec's gauntlet.)
- **Git:** commit at spec approval point (here, autonomous) and again after
  GREEN, consistent with M3/M4 history on this repo.
- **Gauntlet composition:** `pnpm coverage` (vitest v8, 100% threshold,
  `vitest.config.ts` already scopes to `shared/src/scoring/**` and
  `shared/src/disciplines/**` — the new files land inside that include glob
  automatically) + `pnpm mutation` (Stryker; `stryker.config.json`'s
  `mutate` glob is `shared/src/scoring/*.ts`, already covers the new files)
  - `pnpm mutation:schema` (unaffected — no schema changes) + `pnpm check`
    (typecheck/lint/full suite, zero new failures against the 223-test
    baseline from M4).

## Calibration

**Tier 2** (normal — small pure-math feature, not money/auth/concurrency).
Full loop: RED → GREEN → REFACTOR per behavior, then the standard gauntlet.
No property-based tests added beyond what table-driven cases already give
(the domain is closed-form arithmetic over small fixed tables, not a parser
or serializer with round-trip/idempotence invariants).

## Domain facts (from `.claude/skills/spsf-domain/SKILL.md` and §6.5/§6.5b)

1. Sighter (`isSighter`) series are excluded from every score statistic but
   **included** in volume metrics (total shots, rounds fired). **Amended**
   by `docs/specs/sighters-in-statistics-spec.md` (2026-09-16): that is the
   in-session rule. `scoredSeries`/`scoredShots` still default to it — so
   B18-B31 below are unchanged — but now take an optional `SighterScope`
   that the Statistics tab passes to count sighters as ordinary series.
2. Standardmedalj evaluates **beforeFinal** (the grundomgång, i.e. the
   non-final scored series) when a session has a final — never the
   after-final total.
3. Märke/guldserie thresholds are age-reduced by birth year and are only
   defined for 5-shot `spsf-precision` series with a mapped vapengrupp
   (A/AM/AP/AG/A-opt → A row, B → B row, C → C row). Reused from
   `marke.ts`, not re-specified here.
4. Standardmedalj thresholds (§6.5b, SHB C.5.1.2.3/C.5.1.2.5, verified) —
   precision, by series count and vapengrupp:

   | Series | A/A-opt silver | A brons | B silver | B brons | C silver | C brons |
   | ------ | -------------- | ------- | -------- | ------- | -------- | ------- |
   | 6      | 277            | 267     | 282      | 273     | 283      | 276     |
   | 7      | 323            | 312     | 329      | 319     | 330      | 322     |
   | 10     | 461            | 445     | 470      | 455     | 471      | 460     |

   Militär snabbmatch (fixed at 12 scored series): silver A 540 · R 552 ·
   B 561 · C 564; brons A 516 · R 528 · B 537 · C 540.

   `>10` series (precision only, per SHB C.5.1.2.3): threshold = 10-series
   value ÷ 10 × series count. **Implementation choice (not a regulatory
   value, so not a VERIFY):** the SHB text does not state a rounding rule
   for non-multiples of 10; this implementation rounds to the nearest
   integer point (`Math.round`), documented here so it is auditable.
   Series counts that are neither 6, 7, 10, nor >10 (i.e. 1–5, 8, 9) have
   no defined row and the table is **not** extrapolated for them —
   `standardmedaljForSession` returns `null` thresholds in that case
   (documented limitation, matches "table has no such row" rather than a
   guess).

## Behaviors — `standardmedalj.ts`

Points are always in whole-point units (`tenthsToScore` output), matching
`marke.ts`'s convention.

### B1. Exact threshold hit at a tabulated series count

`standardmedaljPoints({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:C', seriesCount: 7, totalPoints: 330 })`
→ `{ valor: 'silver', silverThreshold: 330, bronsThreshold: 322 }`
(330 ≥ silver row exactly).

### B2. Brons band

`standardmedaljPoints({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:A', seriesCount: 6, totalPoints: 270 })`
→ `{ valor: 'brons', silverThreshold: 277, bronsThreshold: 267 }`
(267 ≤ 270 < 277).

### B3. Below brons

`standardmedaljPoints({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:B', seriesCount: 10, totalPoints: 300 })`
→ `{ valor: null, silverThreshold: 470, bronsThreshold: 455 }` (300 < 455).

### B4. `>10` series scaling, silver

11 series, group C: `silverThreshold = round(471/10*11) = round(518.1) = 518`,
`bronsThreshold = round(460/10*11) = round(506) = 506`.
`standardmedaljPoints({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:C', seriesCount: 11, totalPoints: 520 })`
→ `{ valor: 'silver', silverThreshold: 518, bronsThreshold: 506 }`.

### B5. `>10` series scaling, brons

Same setup, `totalPoints: 510` → `{ valor: 'brons', silverThreshold: 518, bronsThreshold: 506 }`
(510 ≥ 506, < 518).

### B6. Series count with no defined row

`standardmedaljPoints({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:C', seriesCount: 8, totalPoints: 400 })`
→ `{ valor: null, silverThreshold: null, bronsThreshold: null }`.

### B7. Milsnabb, fixed 12-series table, silver

`standardmedaljPoints({ disciplineId: 'spsf-milsnabb', weaponGroup: 'spsf:R', seriesCount: 12, totalPoints: 555 })`
→ `{ valor: 'silver', silverThreshold: 552, bronsThreshold: 528 }`.

### B8. Milsnabb, wrong series count (not the fixed 12)

`standardmedaljPoints({ disciplineId: 'spsf-milsnabb', weaponGroup: 'spsf:R', seriesCount: 6, totalPoints: 555 })`
→ `{ valor: null, silverThreshold: null, bronsThreshold: null }` (milsnabb
has no 6-series row — only the fixed 12-series program exists in v1).

### B9. Unmapped/unknown weapon group

`standardmedaljPoints({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:R', seriesCount: 7, totalPoints: 330 })`
→ `{ valor: null, silverThreshold: null, bronsThreshold: null }` (R has no
row in the precision table — precision never uses R, per spsf-domain rule).
Also covers `weaponGroup: null/undefined`.

### B10. Non-SPSF/unknown discipline

`standardmedaljPoints({ disciplineId: 'generic-rings', weaponGroup: 'spsf:C', seriesCount: 7, totalPoints: 330 })`
→ `{ valor: null, silverThreshold: null, bronsThreshold: null }`.

### B11. Session-level evaluator, no final — `standardmedaljForSession`

Input: `disciplineId: 'spsf-precision'`, `weaponGroup: 'spsf:C'`,
`hasFinal: false`, `beforeFinalSeriesCount: 7`, `beforeFinalTenths: 3300`
(→ 330 pts), `totalSeriesCount: 7`, `totalTenths: 3300`.
→ same as B1: `{ valor: 'silver', silverThreshold: 330, bronsThreshold: 322 }`
— evaluates the (only) scored total, which equals beforeFinal here.

### B12. Session-level evaluator, WITH final — evaluates beforeFinal, not total

Championship precision: 7 grundomgång series scored 330 pts (silver-band on
its own), plus a 3-series final worth another 150 pts (total would be 480,
which would read as a >10-series band if wrongly evaluated against the
10-series row). Input: `hasFinal: true`, `beforeFinalSeriesCount: 7`,
`beforeFinalTenths: 3300`, `totalSeriesCount: 10`, `totalTenths: 4800`.
→ `{ valor: 'silver', silverThreshold: 330, bronsThreshold: 322 }` — proves
the evaluator used the 7-series beforeFinal row (330/322), not the
10-series total row (461/445), which `4800` (480 pts) would otherwise hit
at a different band. This is the one behavior that specifically encodes
"standardmedalj evaluates beforeFinal" (spsf-domain rule 3).

## Behaviors — `stats.ts`

All monetary-analogue precision is tenths (integer `value_tenths`, §3);
functions return tenths, callers apply `tenthsToScore` for display, matching
`totals.ts`/`marke.ts` convention. A `StatsSeries` fixture shape:

```ts
{ id, sessionId, startedAt, disciplineId, weaponGroup, shooterClass,
  firearmId, ammoLotId, isSighter, isFinal, shots: [{valueTenths, isInnerTen}] }
```

### B13. `meanTenths` — simple mean

`meanTenths([{valueTenths:90,isInnerTen:false},{valueTenths:80,isInnerTen:false},{valueTenths:100,isInnerTen:true}])`
→ `90` (mean of 90,80,100 = 90).

### B14. `meanTenths` — empty input

`meanTenths([])` → `null` (undefined for zero shots, not `NaN` or `0`).

### B15. `sampleStandardDeviationTenths` — hand-computed

Values (tenths): `[80, 90, 100]`. Mean = 90. Squared deviations:
`100, 0, 100` → sum `200`. Sample variance = `200 / (3-1) = 100`. SD = `10`.
`sampleStandardDeviationTenths([{valueTenths:80,...},{valueTenths:90,...},{valueTenths:100,...}])`
→ `10`.

### B16. `sampleStandardDeviationTenths` — fewer than 2 values is undefined

`sampleStandardDeviationTenths([{valueTenths:90,isInnerTen:false}])` → `null`
(sample SD needs n≥2; `[]` also → `null`).

### B17. `xCount` / `xRate`

Shots: 5 shots, 2 flagged `isInnerTen`. `xCount(shots)` → `2`.
`xRate(shots)` → `2/5 = 0.4`. `xRate([])` → `null`.

### B18. Sighter exclusion from score stats, inclusion in volume

Session with 2 series: series A `isSighter:true` (5 shots, all value 90),
series B `isSighter:false` (5 shots, all value 90).

- `scoredShots([A,B])` → only B's 5 shots (sighter excluded).
- `volumeShotCount([A,B])` → `10` (both series counted).
- `meanTenths(scoredShots([A,B]))` → `90` (sighter shots never enter the
  mean).

### B19. `bestWorstSeries` — picks by series total, sighters excluded

Three series, non-sighter: totals 400, 460, 430 tenths (5×80, 5×92, 5×86).
A fourth series is a sighter with total 500 (must be ignored despite being
highest). `bestWorstSeries([s1(400),s2(460),s3(430),sighter(500)])` →
`{ best: {id: 's2', totalTenths: 460}, worst: {id: 's1', totalTenths: 400} }`.

### B20. `bestWorstSeries` — tie-break is first occurrence in input order

Two non-sighter series both totalling 450 tenths.
`bestWorstSeries([s1(450), s2(450)])` →
`{ best: {id:'s1',totalTenths:450}, worst: {id:'s1',totalTenths:450} }`
(first element wins both when tied — documented, not "undefined behavior").

### B21. `bestWorstSeries` — no scored series at all

Only a sighter series present, or empty input.
`bestWorstSeries([sighterOnly])` → `{ best: null, worst: null }`.
`bestWorstSeries([])` → `{ best: null, worst: null }`.

### B22. `sessionTrend` — chronological per-session mean

Two sessions: session `s1` startedAt `2026-01-10`, one non-sighter series
mean 88 (tenths 880); session `s2` startedAt `2026-01-05` (earlier date but
appears LATER in the input array — proves the function sorts), one
non-sighter series mean 92 (tenths 920).
`sessionTrend([seriesOf(s1), seriesOf(s2)])` →
`[{sessionId:'s2', startedAt:'2026-01-05...', meanTenths:920}, {sessionId:'s1', startedAt:'2026-01-10...', meanTenths:880}]`
— ascending by `startedAt`, one point per session (sighter series pooled
out before averaging, per B18).

### B23. `sessionTrend` — a session with only sighter shots is omitted

A session whose only series is a sighter is dropped from the trend (no
score to plot), rather than emitting a `null`/`NaN` point.

### B24. `compareRecentSeries` — recent vs previous, same discipline+class

10 non-sighter `spsf-precision` / class `'2'` series in chronological
order with tenths totals-per-shot mean of, respectively (means, tenths):
`80,82,84,86,88,90,92,94,96,98`. With `n=4`: recent = last 4 series' pooled
shot mean (means 90,92,94,96,98 → wait, n=4 means last 4 series =
indices 6-9, means 92,94,96,98); previous = the 4 before that (indices
2-5, means 84,86,88,90). Each series here has exactly 1 shot for
arithmetic simplicity (mean per shot == that series' single value), so the
pooled mean over a set of series equals the mean of the listed values.
`recentMeanTenths = mean(92,94,96,98) = 950` (95.0 pts).
`previousMeanTenths = mean(84,86,88,90) = 870` (87.0 pts).
`deltaTenths = 950 - 870 = 80`.
`compareRecentSeries(series, {disciplineId:'spsf-precision', shooterClass:'2'}, 4)`
→ `{ recentMeanTenths: 950, previousMeanTenths: 870, deltaTenths: 80, recentCount: 4, previousCount: 4 }`.

### B25. `compareRecentSeries` — filters out non-matching discipline/class

Same 10 series as B24 plus 4 more series of a different `shooterClass`
interleaved chronologically among the most recent ones. The mismatched
series are excluded from both `recent` and `previous` before the N-window
is taken — the result is identical to B24 (the extra series simply don't
count).

### B26. `compareRecentSeries` — fewer than N series available

Only 3 matching series exist, `n=100`. `recentCount: 3`,
`previousCount: 0`, `previousMeanTenths: null`, `deltaTenths: null`
(nothing to compare against — never fabricate a zero baseline).

### B27. `compareRecentSeries` — default N is 100

Calling without the third argument uses `n=100`
(`compareRecentSeries(series, target)` behaves identically to passing
`100` explicitly) — verified by asserting both calls produce the same
result on a 5-series fixture (n≥count in both cases, so both degenerate to
"use everything, no previous window").

### B28. `guldserieCount` — reuses `marke.ts`, sighters **included**

Four `spsf-precision`, `spsf:C`, 5-shot non-sighter series with points
totals `44, 46, 47, 40` (birthYear null, so no age reduction; C guld
threshold = 46). Guldserie = totals ≥ 46 → 2 of those (46, 47) qualify. A
fifth series, a sighter, totals 50 and qualifies too.
`guldserieCount(series, { birthYear: null })` → `3`.

**Amended 2026-09-17** (maintainer: "a sighter always counts towards
guldserie"). This behavior previously excluded the sighter and returned
`2`; see `docs/specs/sighters-in-statistics-spec.md` §2.3.

### B29. `guldserieCount` — non-precision or wrong series length never counts

A `spsf-milsnabb` series scoring 50 (5 shots) — `guldserieCount` → `0` for
that series regardless of points, because `marke.ts`'s `MARKE_DISCIPLINES`
only contains `spsf-precision` (delegated behavior, re-asserted here as a
regression guard for the stats layer's plumbing).

### B30. `aggregateByFirearm` — grouping, volume vs score split

Two firearms. Firearm `f1`: one sighter series (5 shots, val 90) + one
scored series (5 shots, val 90, 1 X). Firearm `f2`: one scored series
(5 shots, val 80). A series with `firearmId: null` is excluded from every
bucket (documented: unassigned series don't aggregate under a firearm).
`aggregateByFirearm(series)` →

```
[
  { key: 'f1', volumeShotCount: 10, scoredShotCount: 5, meanTenths: 900,
    sdTenths: null, xCount: 1, xRate: 0.2, sessionCount: 1 (or however many
    distinct sessionIds appear), guldserieCount: <n> },
  { key: 'f2', volumeShotCount: 5, scoredShotCount: 5, meanTenths: 800,
    sdTenths: null, xCount: 0, xRate: 0, sessionCount: 1, guldserieCount: <n> },
]
```

(`sdTenths: null` here because each bucket's scored shots are uniform value
— SD of identical values is mathematically `0`, not `null`; the fixture in
the real test file uses non-uniform values so this is corrected to a
concrete non-null number — see test file for the exact figures. This
placeholder inconsistency is intentionally called out: the authored test
uses `f1` shots `[90,90,90,90,100]` so SD ≠ 0, sdTenths computed exactly as
in B15's method.)

### B31. `aggregateByAmmoLot` — same contract, keyed by `ammoLotId`

Mirrors B30 with `ammoLotId` as the grouping key — verifies the aggregate
function is generic (implemented once, both exported names call the shared
`aggregateBy(series, keyFn)` with `s => s.firearmId` / `s => s.ammoLotId`).

## Negative constraints (must NOT change)

- `totals.ts`, `marke.ts`, `entry.ts` exports and behavior: unchanged.
  `stats.ts` calls `isGuldserie`/`guldserieThreshold` from `marke.ts` and
  `tenthsToScore` from `totals.ts` rather than re-implementing them.
- 223 pre-existing vitest tests (M4 baseline) still pass, zero new failures.
- No change to the DB schema, query layer, or any M0-M4 screen's exported
  behavior — M5 only adds `/stats` content and the session-detail Stats
  toggle.
- `pnpm typecheck`/`pnpm lint` stay green.

## Gauntlet layers planned

| Layer           | Command                    | Threshold                                                                                                                                        |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full suite      | `pnpm check` (root)        | 223+ prior tests unmodified, zero new failures                                                                                                   |
| Coverage        | `pnpm coverage`            | 100% lines/functions/branches/statements on `shared/src/scoring/**` (existing `vitest.config.ts` threshold, fails closed — nonzero exit on miss) |
| Mutation        | `pnpm mutation` (Stryker)  | ≥95% break threshold per `stryker.config.json` (`high:100, low:95, break:95`); survivors classified equivalent or fixed                          |
| Schema mutation | `pnpm mutation:schema`     | unaffected by this change (no zod schema edits); rerun to prove zero regression                                                                  |
| Format/lint     | `pnpm format`, `pnpm lint` | zero new warnings                                                                                                                                |

Skipped layers and why: property-based tests (closed-form arithmetic over
fixed tables, no round-trip/idempotence invariant to state — table-driven
cases already enumerate the boundary rows); supply-chain audit (no new
runtime dependency in these two files); fuzzing (no parser/deserializer
here).
