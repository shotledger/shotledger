# Sighters in the Statistics tab — executable specification

> Old-coder SPEC artifact for `feat/sighters-in-statistics` (issue #138,
> "Statistics and analytics").
> Absolute path:
> `/home/jimisola/cloud/dev/clones/jimisola/github/shotledger/docs/specs/sighters-in-statistics-spec.md`
> Evidence report: `docs/specs/sighters-in-statistics-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** Spec and implementation
> were written in the same session, so the correlation-breaking review the
> old-coder loop depends on did not happen. This document is the artifact the
> maintainer reviews after the fact, and §2 lists the readings he may want to
> overrule.

Tier: **2**. Pure aggregates over data the app already stores; a wrong value
misleads a shooter's reading of his own history but cannot corrupt stored data,
a session result, or a compliance document. `shared/src/scoring/` is under
CLAUDE.md's mandatory old-coder rule, so the full loop runs anyway.

Scope of the loop: `shared/src/scoring/stats.ts`,
`shared/src/scoring/analytics.ts` and `shared/src/export/json-log.ts`. The UI
changes (`app/src/app/(tabs)/stats.tsx`, `app/src/app/stats/report.tsx`,
`app/src/features/stats/use-stats-data.ts`, i18n, the manual) are routine work
per CLAUDE.md and get the app's normal checks, but are listed in §5 so this spec
is the whole contract.

## 0. Setup plan (what approving this authorizes)

- **Isolation:** branch `feat/sighters-in-statistics` off `origin/main`, in this
  agent's own git worktree (`pnpm i`'d at the start of the run — a fresh
  worktree carries no `node_modules`).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths staged,
  `main` never touched. PR opened, never merged.
- **New dependencies: none.** Reuses vitest, `@vitest/coverage-v8`, fast-check
  and Stryker, all already wired.
- **Files added:** this spec, its evidence report,
  `docs/manual/guides/statistics.md` and `docs/manual/guides/statistics.sv.md`.
- **Files modified:** `shared/src/scoring/stats.ts`,
  `shared/src/scoring/stats.test.ts`, `shared/src/scoring/analytics.ts`,
  `shared/src/scoring/analytics.test.ts`, `shared/src/export/json-log.ts`,
  `shared/src/export/json-log.test.ts`,
  `app/src/features/stats/use-stats-data.ts`, `app/src/app/(tabs)/stats.tsx`,
  `app/src/app/stats/report.tsx`,
  `app/src/features/export/use-report-export.ts`,
  `app/src/i18n/{en,sv}.json`, `mkdocs.yml`,
  `.claude/skills/spsf-domain/SKILL.md`, `docs/specs/m5-stats-spec.md`,
  `docs/specs/analytics-report-spec.md`,
  `docs/manual/guides/logging-a-session{,.sv}.md`.
- **No schema change, no migration, no new native module, no stored state.**
  The toggle is filter-form state, serialised into the report route's params
  exactly like every other filter dimension.

## 1. The request

Issue #138, "Statistics and analytics": _Sighters in the Statistics tab._
Today `scoredSeries()` drops sighter series everywhere, so a sighter is absent
from period means as well as from session totals.

**Maintainer's decision, verbatim (2026-09-16):**

> "there is no difference between a sighter and a normal series outside of a
> session. for a session and the in-session stats does not include sighter. but
> in the global statistics sighters and normal series are the same. however the
> user shall be able to exclude sighters"

## 2. Reading the decision — and the three places it did not settle

The decision draws a **scope** line, not a metric line:

| scope                                                     | sighter is…                                          |
| --------------------------------------------------------- | ---------------------------------------------------- |
| inside a session (session total, result card, Stats tab)  | never counted in a score figure (spsf-domain rule 2) |
| outside a session (the Statistics tab's generated report) | an ordinary series, unless the user excludes it      |

That is a **narrowing of spsf-domain rule 2**, which read "excluded from every
score and score statistic". Rule 2 in `.claude/skills/spsf-domain/SKILL.md` was
wrong twice over — about the cross-session scope and about guldserie (§2.3) —
and is **rewritten** in this PR to state the in-session, cross-session, volume
and guldserie cases separately. The underlying SHB fact (a provserie does not
count towards a **result**) is untouched, because a cross-session mean is not a
result.

Three questions the sentence above does not answer. §2.1 and §2.2 were this
agent's readings, stated rather than quietly chosen, and the maintainer
**confirmed both on 2026-09-17**. §2.3 was read wrongly and he corrected it the
same day; it now records his ruling.

### 2.1 Volume always counts sighters, even with the toggle off — **stated reading**

"Exclude sighters" removes them from the **score** figures, not from _Shots
fired_. A round fired at a target was fired whether or not it was a sighter, and
the firearm round counter, ammo usage and licence activity all rest on that.

The consequence is a property worth stating plainly, because it is what makes
the feature explainable: **with the filter off, the Statistics report reproduces
exactly today's behaviour** — the same numbers, from the same code paths. The
toggle only ever adds sighters to the score side.

The alternative (treating the toggle as "which series is this report about", so
that excluding also drops them from volume) was rejected: it would make the
report understate rounds fired, contradicting the second half of spsf-domain
rule 2, which the decision did not touch.

### 2.2 Records and personal bests follow the toggle — **stated reading**

`analyticsRecords` derives entirely from `analyticsSessionPoints`, so records
inherit whatever the points do. With sighters included, **a personal best can be
set on, or inflated by, a sighter series**:

- _Best session score_ for a session that contains a sighter is now the sum of
  every series in it — a **larger number than that session's own screen shows**,
  because the session screen still excludes the sighter. Two places in the app
  will print different totals for the same session.
- _Most inner tens_ / _Most tens_ likewise count a sighter's shots.

This is the sharp edge the task flagged, and it is a genuine cost. It is
accepted rather than carved out, for three reasons: the decision says the two
kinds of series are "the same" in global statistics and carves nothing out; a
uniform rule is the only one a user can predict from a single toggle; and the
escape hatch exists — switching the filter off restores agreement with every
session screen. A carve-out would instead produce a report whose headline mean
and whose records were computed over different sets, which is the harder
inconsistency to explain.

**If the maintainer disagrees**, the change is small and local: make
`analyticsRecords` (or the `points` fed to it) always use the sighter-free
scope. The spec records this as the alternative rather than the loser of a
silent decision.

### 2.3 The guldserie count always counts sighters — **maintainer's ruling, 2026-09-17**

> "I sighter always counts towards guldserie. I told you this before."

A 50 on a provserie earns the märke exactly like any other series. This is not
scope-dependent and not filter-dependent: `guldserieCount` counts sighters
unconditionally, in a session and out of one, with the Sighters filter set
either way.

**This replaces a wrong reading in the first draft of this spec**, which had
`guldserieCount` skipping sighters as a conservative "award eligibility"
carve-out. The ruling above is the maintainer's, not an inference, and it is
recorded here rather than the reading it corrects. `scoredSeries` is therefore
not used inside `guldserieCount` at all any more — it iterates the list
directly, so there is no sighter predicate left to get wrong.

Existing behaviour that changes as a result: `stats.test.ts` B28
(`m5-stats-spec.md`) asserted that a qualifying sighter did **not** count; that
assertion is corrected to `3` rather than `2`, and the M5 spec's B28 amended
with it. Per-firearm and per-ammo-lot buckets carry the same `guldserieCount`,
so they inherit the correction.

The root cause was `.claude/skills/spsf-domain/SKILL.md` rule 2, which said
sighters are "excluded from every score and score statistic" — wrong about the
cross-session scope and wrong about guldserie. Rule 2 is rewritten in this PR
to state all four cases distinctly.

### 2.4 Scope: the Statistics tab only

The other cross-session aggregates in `stats.ts` — `sessionTrend`,
`compareRecentSeries`, `aggregateByFirearm`, `aggregateByAmmoLot` — keep
excluding sighters unchanged. `sessionTrend`, `aggregateByFirearm` and
`aggregateByAmmoLot` have **no** app caller today (tests only);
`compareRecentSeries` is shown _inside_ a session, and has no filter UI, so
including sighters there would give the user a figure he cannot switch off —
the opposite of the decision's last clause. Listed as a follow-up, not done
here.

## 3. The mechanism

One optional scope argument, defaulting to today's behaviour, threaded from the
Statistics tab's filter form down to the two aggregation entry points. No
behaviour changes anywhere the argument is not passed.

```ts
// shared/src/scoring/stats.ts
export interface SighterScope {
  /**
   * Cross-session scope: a sighter is an ordinary series. Default `false` —
   * the in-session scope, where a sighter never counts.
   */
  includeSighters?: boolean;
}
```

- `scoredSeries(list, scope?)` — returns the list unfiltered when
  `includeSighters` is true, else the non-sighter series (today's behaviour).
- `scoredShots(list, scope?)` — the shots of whatever `scoredSeries` returns.
- `volumeShotCount(list)` — **unchanged signature and behaviour** (§2.1).
- `guldserieCount(list, options)` — no scope parameter; **stops filtering
  sighters out** and iterates the list directly (§2.3).
- `sessionTrend`, `compareRecentSeries`, `aggregateBy*` — **unchanged** (§2.4).

```ts
// shared/src/scoring/analytics.ts
export function analyticsSessionPoints(list, scope?: SighterScope): AnalyticsSessionPoint[];
export function analyticsTotals(list, scope?: SighterScope): AnalyticsTotals;
```

`filterAnalyticsSeries` and `AnalyticsFilter` are **not** touched: filtering
answers "which series is this report about" (A-F8), and this is a scoring
question, not a membership one. `analyticsRecords(points)` is not touched
either — it inherits the scope through its input (§2.2).

### Behaviors — `stats.ts`

| id   | Given                                                                                | Then                                                                             |
| ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| SS-1 | `scoredSeries([sighter, normal])` with no scope argument                             | `[normal]` — the default is unchanged, every existing caller keeps its behaviour |
| SS-2 | `scoredSeries([sighter, normal], { includeSighters: false })`                        | `[normal]` — an explicit `false` is the same as omitting it                      |
| SS-3 | `scoredSeries([sighter, normal], { includeSighters: true })`                         | `[sighter, normal]` — same members, **input order preserved**                    |
| SS-4 | `scoredSeries([], { includeSighters: true })`                                        | `[]`                                                                             |
| SS-5 | `scoredShots([sighter(5 shots), normal(5 shots)], { includeSighters: true })`        | all 10 shots, sighter's first (series order, then shot order)                    |
| SS-6 | `scoredShots([sighter, normal])`                                                     | the 5 non-sighter shots — unchanged default                                      |
| SS-7 | `volumeShotCount` called on any of the above                                         | identical in both scopes — it has no scope argument (§2.1)                       |
| SS-8 | `guldserieCount([qualifying sighter, qualifying normal, non-qualifying normal], {})` | `2` — the sighter always counts, in either scope (§2.3)                          |
| SS-9 | `scoredSeries` with `includeSighters: true` returns a **copy**                       | mutating the result does not mutate the caller's array                           |

### Behaviors — `analytics.ts`

Fixture for SS-10..SS-18: one session `s1`, two 5-shot series — `A` a sighter
with every shot 100 tenths (10.0), `B` a scoring series with every shot 90
tenths (9.0). Two of A's shots are flagged `isInnerTen`, none of B's.

| id    | Given                                                                                       | Then                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SS-10 | `analyticsSessionPoints([A,B])` — no scope                                                  | today's point: `scoredSeriesCount 1`, `scoredShotCount 5`, `sessionTotalTenths 450`, `meanShotTenths 90`, `innerTenCount 0`, `tenCount 0`                |
| SS-11 | `analyticsSessionPoints([A,B], { includeSighters: true })`                                  | `scoredSeriesCount 2`, `scoredShotCount 10`, `sessionTotalTenths 950`, `meanSeriesTotalTenths 475`, `meanShotTenths 95`, `innerTenCount 2`, `tenCount 5` |
| SS-12 | `analyticsSessionPoints([A], { includeSighters: true })`                                    | a point with `meanShotTenths 100` — a sighter-only session is no longer omitted from the charts in this scope                                            |
| SS-13 | `analyticsSessionPoints([A])` — no scope                                                    | a point with `scoredSeriesCount 0`, `meanSeriesTotalTenths null`, `meanShotTenths null` (unchanged)                                                      |
| SS-14 | `analyticsTotals([A,B])` — no scope                                                         | today's totals: `scoredSeriesCount 1`, `scoredShotCount 5`, `sumTenths 450`, `meanShotTenths 90`, `meanSeriesTenths 450`, `volumeShotCount 10`           |
| SS-15 | `analyticsTotals([A,B], { includeSighters: true })`                                         | `scoredSeriesCount 2`, `scoredShotCount 10`, `sumTenths 950`, `meanShotTenths 95`, `meanSeriesTenths 475`, `innerTenCount 2`, `tenCount 5`               |
| SS-16 | `analyticsTotals` in **both** scopes                                                        | `volumeShotCount` is `10` either way, and `sessionCount` is `1` either way (§2.1, A-T1/A-T2 unchanged)                                                   |
| SS-17 | an **empty sighter** series (no shots, no override) with `includeSighters: true`            | it does not enter `scoredSeriesCount` — a series carrying no score is excluded in both scopes, exactly as A-P3 says for scoring series                   |
| SS-18 | a WS1 **override** sighter series (stored total, no shot rows) with `includeSighters: true` | it contributes its stored `tenths` to `sumTenths` and its `shotCount` to volume, and nothing to the per-shot figures                                     |
| SS-19 | `analyticsRecords(analyticsSessionPoints([A,B], { includeSighters: true }))`                | `bestSessionTotalTenths.value === 950` and `mostInnerTens.value === 2` — records follow the scope (§2.2)                                                 |
| SS-20 | `analyticsRecords(analyticsSessionPoints([A,B]))`                                           | `bestSessionTotalTenths.value === 450`, `mostInnerTens.value === 0` — unchanged default                                                                  |

### Property (fast-check)

- **SS-P1** For any list of series, `analyticsTotals(list, { includeSighters:
true })` equals `analyticsTotals(list.map(unflagSighter))` with the default
  scope — i.e. "included" is exactly "as if they were never marked sighter".
  This ties the new scope to the old code path instead of to a second
  implementation of the same arithmetic.
- **SS-P2** For any list, the default scope's `scoredShotCount` is ≤ the
  included scope's, and `volumeShotCount` is identical in both.

### Behaviors — `json-log.ts`

| id    | Given                                                                   | Then                                                                                                      |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| SS-21 | `AnalyticsReportJsonFilter` gains a required `includeSighters: boolean` | the exported report echoes which scope produced its numbers — without it the summary is not interpretable |
| SS-22 | `buildAnalyticsReport` with `includeSighters: false`                    | `filter.includeSighters === false` in the output; every other field byte-identical to today               |

`ANALYTICS_REPORT_VERSION` stays **1**: the change is a purely additive field in
the filter echo, and a v1 consumer that ignores unknown keys is unaffected. The
field is required in the TS type (never optional) so no export can be produced
that fails to say which scope it used.

### Invariants that must survive (negative constraints)

| id    | Invariant                                                                                                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-1 | Every existing `stats.test.ts` / `analytics.test.ts` / `json-log.test.ts` assertion passes **unedited** — the default scope is today's behaviour                                                               |
| INV-2 | No in-session figure changes. `use-session-stats.ts`, `totals.ts`, `marke.ts`, `standardmedalj.ts` are not touched                                                                                             |
| INV-3 | No exported signature is narrowed. Every new parameter is optional with a default (`json-log`'s filter field is the one deliberate exception, §SS-21, and its only producer is updated in the same commit)     |
| INV-4 | `volumeShotCount` behaves identically before and after, in both scopes. `guldserieCount` likewise takes no scope — its **one** change (§2.3) is unconditional, so it too is identical in both filter positions |
| INV-5 | `pnpm coverage` stays at 100% statements/branches/functions/lines for `shared/src/scoring/stats.ts` and `analytics.ts`                                                                                         |
| INV-6 | `pnpm mutation` adds no survivor to `stats.ts` / `analytics.ts` / `json-log.ts` beyond the `origin/main` baseline recorded in EVIDENCE                                                                         |
| INV-7 | No new dependency, no schema change, no migration                                                                                                                                                              |
| INV-8 | `decodeAnalyticsFilter` of a filter string written before this change still parses, and defaults `includeSighters` to `true`                                                                                   |

## 4. Defaults

`includeSighters` defaults to **`true`** in `DEFAULT_ANALYTICS_FILTER` — the
decision's "in the global statistics sighters and normal series are the same" is
the rule; excluding them is the user's opt-out. The _engine_ default is the
opposite (`false`), because the engine's other callers are in-session; the two
defaults are not in tension because they answer different questions ("what does
the Statistics tab do" vs "what does an unqualified call mean").

## 5. UI changes (normal-tests scope, listed so the spec is the whole contract)

| id   | Change                                                                                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-1 | `app/src/app/(tabs)/stats.tsx` gains a `FilterCard` titled **Sighters**, holding a two-option `SegmentedControl` (Include / Exclude), `testID="stats-sighters"`. Placed after the session-type card, before Discipline — beside the other "which shots" dimensions.                             |
| UI-2 | `AnalyticsFilterState` gains `includeSighters: boolean`, default `true`; it round-trips through `encodeAnalyticsFilter`/`decodeAnalyticsFilter` like every other field (INV-8).                                                                                                                 |
| UI-3 | `use-stats-data.ts` passes the scope to `analyticsSessionPoints`, `analyticsTotals` and `scoredShots` (the latter drives the SD tile and the shot-distribution chart, which must match the mean above them). `guldserieCount` is **not** passed it — it counts sighters unconditionally (§2.3). |
| UI-4 | `app/src/app/stats/report.tsx` adds one line to the filter-echo card: `Sighters: Included / Excluded`. A report whose numbers depend on a setting must say which setting produced them.                                                                                                         |
| UI-5 | The JSON export's filter echo carries the same flag (SS-21), wired in `use-report-export.ts`.                                                                                                                                                                                                   |

New i18n keys (en: Title Case for the section title and the control's labels,
sentence case for the hint; sv sentence case throughout):

| key                         | en                                                                                   | sv                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `stats.sectionSighters`     | `Sighters`                                                                           | `Provserier`                                                                             |
| `stats.sectionSightersHint` | `Outside a session a sighter is an ordinary series. Shots fired always counts them.` | `Utanför ett pass är en provserie en vanlig serie. Skjutna skott räknar alltid med dem.` |
| `stats.sightersInclude`     | `Include`                                                                            | `Räkna med`                                                                              |
| `stats.sightersExclude`     | `Exclude`                                                                            | `Räkna inte med`                                                                         |

## 6. User manual (ships in this PR, per CLAUDE.md)

A new guide, `docs/manual/guides/statistics.md` + `.sv.md`, added to the mkdocs
nav (`Statistics` → `Statistik`) between _Logging a session_ and _Scoring from a
photo_. It covers what the Statistics tab is (a filter form that generates a
report), what each filter does, and — the point of this PR — **what counts
where**: sighters excluded inside a session, ordinary outside one, the toggle,
and the fact that _Shots fired_ always counts them.

`docs/manual/guides/logging-a-session.md` + `.sv.md` gain one sentence under
_Sighters_ pointing at the new page, so the reader who meets the concept first
in a session learns that the rule changes outside one.

Both docs gates run before pushing: `mkdocs build --strict` and
`node scripts/docs-translation-check.mjs` (neither is in `pnpm check`).

## 7. Gauntlet plan

| layer          | command                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full suite     | `pnpm check` from the worktree root (typecheck ×2, schema gate, i18n gate, licenses gate, lint, format, vitest, jest)                                                                               |
| coverage       | `pnpm coverage`, against the `origin/main` baseline recorded in EVIDENCE (the repo-wide gate is **already red** on main)                                                                            |
| mutation       | `pnpm exec stryker run --mutate 'shared/src/scoring/stats.ts,shared/src/scoring/analytics.ts,shared/src/export/json-log.ts'`, same command run on the `origin/main` baseline first                  |
| property-based | fast-check properties SS-P1 / SS-P2 in `analytics.test.ts`                                                                                                                                          |
| docs gates     | `mkdocs build --strict`, `node scripts/docs-translation-check.mjs`                                                                                                                                  |
| real execution | **skipped.** UI verification is the maintainer's, per the task instruction: no emulator is started and the new filter control has not been seen rendering. Recorded as a skipped layer in EVIDENCE. |

Baseline discipline: `pnpm coverage` and `pnpm mutation` are red on
`origin/main` for files this change does not touch. EVIDENCE records both
baselines verbatim and holds the line at **zero new** uncovered lines and
**zero new** survivors in the three files above; the pre-existing failures are
surfaced, not fixed.
