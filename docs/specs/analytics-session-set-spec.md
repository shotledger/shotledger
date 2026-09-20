# Spec: the report's session set

Issue #349, item 1. Supersedes nothing; extends `analytics-report-spec.md`,
whose model of "the report is built from series" is exactly what this changes.

Tier 2 (normal). Not Tier 3: no money, auth, concurrency or data loss is
involved, and nothing here writes to the database.

**Revised 2026-09-20 on the maintainer's instruction: the charts are out of
scope.** The first draft covered #349's chart item as well, on the grounds that
it shares this root cause. It does, but it is not being built here.
`AnalyticsSessionPoint` is therefore left exactly as it is — no `disciplineId`
field — and `time-series-chart.tsx` and `report.tsx` are not touched at all.
The chart item stays open on #349 and gets its own spec if and when it is
wanted.

## Why

From the 267-session real-data pass: **a session with zero series is invisible
to the report.** Everything the report knows comes from
`listAllAnalyticsSeries`, so a session with no series rows contributes nothing —
it is not counted, and its `extra_rounds` are not in Shots Fired. Home counts
sessions from the `sessions` table, so the two disagree, 266 against 267, with
nothing on screen to explain it.

This is not an edge case the schema tolerates by accident: a `kind: 'rounds'`
session is _defined_ as one that logs a fixed number of fired shots in
`extra_rounds` and never gets series. The same cause is behind a tag filter
reporting 36 where the tag is on 37.

## Maintainer ruling folded in (2026-09-20)

Zero-series sessions: **count them**. A session matching the session-level
filter joins the report even with no series, and its extra rounds count towards
volume. Explicitly chosen over the variant that excludes them when the
Shots-per-series filter is set.

## What changes

### `shared/src/scoring/analytics.ts`

New: a session as the report sees it, independent of whether it has series.

```ts
export interface AnalyticsSession {
  id: string;
  startedAt: string;
  sessionType: AnalyticsSessionType;
  disciplineId: string;
  tagIds: readonly string[];
  /** Unscored extra rounds on the session (spec A1 §A1.3); 0 when unset. */
  extraRounds: number;
}
```

New functions:

- `filterAnalyticsSessions(list, filter)` — the session-level half of the
  filter: `fromIso`, `toIso`, `sessionType`, `disciplineId`, `tagIds`.
  `shotsPerSeries` is a question about series and is deliberately not applied.
- `analyticsReportSessions(sessions, allSeries, matchedSeries, filter)` — the
  sessions the report covers, sorted by `startedAt` then `id`.
- `analyticsReportTotals(matchedSeries, reportSessions, scope)` — delegates to
  the existing `analyticsTotals` and replaces two fields from the session set.
- `analyticsReportSet(allSeries, allSessions, filter, scope)` — the three above
  composed, so the app has no wiring of its own. Added during implementation;
  see the revision note.

Unchanged, deliberately: `filterAnalyticsSeries`, `analyticsTotals`,
`analyticsRecords` and `analyticsSessionPoints` keep their present signatures
and meanings. `analyticsTotals` still means "aggregate over exactly these
series"; the report-level view is the new function's job, so no existing
function gains an optional argument that quietly changes what it means.

### `app/src/db/queries/stats.ts`

New `listAnalyticsSessions(db)`, one scan of `sessions` plus the already-loaded
`session_tags`, mapping to `AnalyticsSession`.

### `app/src/features/stats/use-stats-data.ts`

`loadReport` composes the two halves and stops using `sumExtraRounds` for the
report — extra rounds now ride on `AnalyticsSession`, so the report has one
source of truth for its session set. `sumExtraRounds` itself stays for its
other callers.

No screen changes: the report already prints `totals.sessionCount` and
`volumeShotCount`, and both simply become right.

## Acceptance criteria

Ids are the test names.

### Session-level filtering — `filterAnalyticsSessions`

- **FS-1** an unset filter (`ANY_ANALYTICS_FILTER`) keeps every session.
- **FS-2** `fromIso` drops a session that started strictly before it; `toIso`
  drops one that started strictly after. Both bounds are inclusive.
- **FS-3** `sessionType` keeps only sessions of that type.
- **FS-4** `disciplineId` keeps only sessions of that discipline.
- **FS-5** `tagIds` is an OR-match; an empty list is no filter; a tag no session
  carries yields an empty result.
- **FS-6** `shotsPerSeries` is ignored: a filter that sets it and nothing else
  keeps every session.
- **FS-7** predicates compose with AND.

### The report's session set — `analyticsReportSessions`

- **RS-1** a session with at least one matching series is included.
- **RS-2** a session with no series at all, matching the session-level filter,
  is included — this is the 266-vs-267 bug.
- **RS-3** a session with no series at all that fails the session-level filter
  is excluded.
- **RS-4** a session whose only series are excluded by `shotsPerSeries` is
  excluded: it has series, so the series-shaped question applies to it.
- **RS-5** `shotsPerSeries` does not exclude a session that has no series at
  all (the ruling, chosen over the stricter variant).
- **RS-6** a session in `matchedSeries` but absent from `sessions` is dropped
  rather than invented.
- **RS-7** the result is sorted by `startedAt`, ties broken by `id`, and
  contains no duplicates when a session has many matching series.
- **RS-8** an empty session list yields an empty result.

### Report totals — `analyticsReportTotals`

- **RT-1** `sessionCount` equals the number of report sessions, including the
  series-free ones.
- **RT-2** `volumeShotCount` is the series volume plus every report session's
  `extraRounds` — so a rounds-only session's shots are counted.
- **RT-3** every other field is identical to `analyticsTotals` over the same
  series and scope. Asserted field by field against a live call, so a field
  added later cannot silently diverge.
- **RT-4** with no report sessions and no series, the totals are the zero
  totals.
- **RT-5** a session with both series and `extraRounds` counts both, once.

### End to end, against a real database

- **E2E-1** a DB holding one ordinary session and one rounds-only session
  reports `sessionCount` 2, and its volume includes the rounds-only session's
  extra rounds. The regression for the reported symptom, one layer above the
  pure functions.
- **E2E-2** a filter whose only match is a rounds-only session reports
  `hasMatches: true`. See the revision note below.

### The composed set — `analyticsReportSet`

- **SET-1** `matchedSeries` is `filterAnalyticsSeries` over the same input.
- **SET-2** `sessions` and `totals` are the two functions above over the same
  input, and the `scope` reaches the totals.
- **SET-3** `hasMatches` is true when the session set is non-empty and false
  when it is empty — including the case where series matched nothing but a
  series-free session did.

## Revision during implementation (2026-09-20)

Writing the app layer surfaced a gap in the criteria above, recorded here
rather than absorbed silently.

`AnalyticsReportData.hasMatches` was `matched.length > 0` — a question about
series — and `report.tsx` renders the empty state from it. With the session set
fixed but `hasMatches` left alone, a filter whose only match is a rounds-only
session would report `sessionCount: 1` and then tell the user nothing matched:
the same class of contradiction this change exists to remove, moved one field
along.

A second gap came with it. The end-to-end test could only reach the
composition by restating `loadReport`'s four lines, because `use-stats-data.ts`
pulls in `@/db/client` and expo-sqlite does not load under node — so the test
would have asserted against a copy of the wiring rather than the wiring. The
composition therefore moves into `shared` as `analyticsReportSet`, which both
the app and the test call. Criteria **SET-1** to **SET-3** cover it.

`hasMatches` therefore becomes `reportSessions.length > 0`. This is entailed by
the approved ruling — a session that is counted must not be reported as no
match — but it was not written down, so it is added as **E2E-2** rather than
left implicit. `hasAnyData` is unchanged: it asks whether the database holds
any series at all, which is a different question and still the right one for
the "no data yet" state.

### Negative constraints (must NOT change)

- **N-1** `filterAnalyticsSeries`, `analyticsTotals`, `analyticsRecords` and
  `analyticsSessionPoints` keep their signatures and behaviour; their existing
  tests pass untouched.
- **N-2** `AnalyticsSessionPoint` gains no field, and no chart or chart-feeding
  code is edited — the maintainer's instruction, and the reason `report.tsx`
  and `time-series-chart.tsx` appear nowhere above.
- **N-3** `shared/src/scoring` stays at 100% line and branch coverage
  (`pnpm coverage` threshold, exits nonzero when missed).
- **N-4** no new dependency.
- **N-5** no database schema change, no migration, no write path touched.
- **N-6** the sighter scope keeps its present meaning; `sighter-scope.test.ts`
  passes untouched.
- **N-7** no new i18n key (nothing on screen changes), so `pnpm i18n:check`
  stays green without edits.

## Setup plan

- **Isolation**: a branch, `fix/stats-session-count-349`, off current `main`
  (#360 and #361 have landed). Not a worktree: `node_modules` and the Android
  build are gitignored and the gauntlet needs both.
- **New dependencies**: none.
- **Files the gauntlet adds**, by path:
  - `docs/specs/analytics-session-set-spec.md` (this file)
  - `docs/specs/analytics-session-set-evidence.md`
  - `shared/src/scoring/analytics-sessions.test.ts`
  - `app/src/db/json-export/../queries/stats-sessions.test.ts` — exact path
    `app/src/db/queries/stats-sessions.test.ts`
- **Git**: commit this spec on approval; checkpoint commit at each GREEN.
- **Tools**: all already in the repo — `pnpm check`, `pnpm coverage`,
  `pnpm mutation`. Nothing to install.
- **Docs**: `docs/manual/guides/statistics.md` and its `.sv.md` gain a line
  saying which sessions the count covers.

## Gauntlet to be run

| Layer          | Command                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| Full suite     | `pnpm check`                                                                            |
| Types          | `pnpm typecheck` + `pnpm typecheck:app` (inside `check`)                                |
| Lint + format  | `pnpm lint`, `pnpm format` (inside `check`)                                             |
| Coverage       | `pnpm coverage` — 100% threshold on `shared/src/scoring`                                |
| Mutation       | `pnpm mutation` (Stryker)                                                               |
| Docs           | `mkdocs build --strict`, `docs-translation-check`, `docs:anchors`                       |
| Real execution | the emulator: demo data plus a hand-made rounds-only session, count read off the report |

Property-based tests: not planned. These are filters and a set union over small
records; the invariants worth stating (ordering, no duplicates, AND-composition)
are named cases above, and `fast-check` is not in the lockfile — adding it would
be a new dependency this change does not justify.
