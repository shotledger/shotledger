# Shoot-off outside the score, ten counts from the shots (#727, PR C) — evidence

Spec: `docs/specs/shoot-off-and-ten-counts-727-spec.md`.

**Spec approval: awaiting the maintainer.** The PR does not merge before it.

## Failure model

What would go wrong, and what catches it:

| Risk                                                                      | Caught by                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A shoot-off still adds to Before Final, Final or Total                    | `totals.test.ts` S1 block and property S1-P; `session-detail-shoot-off.test.tsx` (real DB, screen)      |
| One statistic forgets the new filter (they each filter series themselves) | `shoot-off-scope.test.ts`, one block per module; property S2-P over both scopes                         |
| A SQL loader bypasses the shared filter                                   | `shot-marks.test.ts`, `shots.test.ts`, `webshooter-stats.test.ts` on the in-memory DB                   |
| A shoot-off stops counting as rounds fired                                | `shoot-off-scope.test.ts` S3 (`volumeShotCount`), analytics totals keep `volumeShotCount`               |
| A move or Next Series crosses into the shoot-off section                  | `series-move.test.ts`, `series-entry-model.test.ts`                                                     |
| "Last time" compares against a shoot-off, or a shoot-off shifts ordinals  | `shoot-off-scope.test.ts` last-time block, `series-entry-screen.test.tsx`, web `running-totals.test.ts` |
| Dropping the stored ten counts loses figures                              | T2 tests read the counts from the shots; T3 import test; nothing wrote the columns since #783           |
| The baseline edit ships a stale schema                                    | `migrations.test.ts` (baseline hash); `drizzle-kit generate` reports no changes                         |

## Spec → tests

| Id  | Tests                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `migrations.test.ts`; `shared/src/sync-client/rows.test.ts`; `from-rows.test.ts`; `shotlog.test.ts` (`not.toHaveProperty('tenCount')`)                                                                                                                                                                                                                           |
| T2  | `home-session-row.test.ts`, `session-list-row.test.ts`, `series-entry-model.test.ts` (`liveSessionTotals`), `web/src/sessions/browse.test.ts`                                                                                                                                                                                                                    |
| T3  | `app/src/db/json-export/import.test.ts`: "ignores the tenCount and innerTenCount an older file carries (#727)"                                                                                                                                                                                                                                                   |
| S1  | `totals.test.ts` "shoot-off series (spec S1-S4)"; `session-detail-shoot-off.test.tsx` "S1: sums the shoot-off apart …", the WS1 total-only case                                                                                                                                                                                                                  |
| S2  | `shoot-off-scope.test.ts` (stats, analytics, stages and tie-break, usual form, sighter relation, last time); `session-detail-shoot-off.test.tsx` "S2: …"; `analytics-rows/rows.test.ts`; `webshooter-stats.test.ts`; `shot-marks.test.ts`; `shots.test.ts`; `card-model.test.ts`; `series-entry-screen.test.tsx`; web `browse.test.ts`, `running-totals.test.ts` |
| S3  | `shoot-off-scope.test.ts` "S3: volume still counts its shots"; analytics totals with `volumeShotCount: 10`                                                                                                                                                                                                                                                       |
| S4  | `session-detail-shoot-off.test.tsx` (result part, section headings with and without a final, none without a shoot-off); web `browse.test.ts` `seriesSections`                                                                                                                                                                                                    |
| S5  | `series-move.test.ts` shoot-off section block                                                                                                                                                                                                                                                                                                                    |
| S5a | `series-entry-model.test.ts` (Next Series, "N of M" per section); `series-entry-screen.test.tsx` (no gold hint on an open shoot-off)                                                                                                                                                                                                                             |
| S6  | fält code untouched; existing `scoringStations` tests unchanged                                                                                                                                                                                                                                                                                                  |

Properties (fast-check): S1-P and S2-P in `totals.test.ts` (removing every
shoot-off leaves before-final, final, total, average and inner-ten figures
unchanged; `shootOffTenths` is the sum of the non-sighter shoot-off series);
S2-P in `shoot-off-scope.test.ts` (analytics totals and session points are
unchanged by adding shoot-off series, in both scopes).

The demo data (`seed.ts`) gives the championship session one shoot-off
series after its final, so `/dev` shows the feature; `seed.test.ts` pins it.

## Gauntlet

All from runs after the last code edit.

| Layer          | Command                                                                                                                                                                                       | Result                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite     | `pnpm check`                                                                                                                                                                                  | exit 0; vitest 244 files, 4301 tests; jest 107 suites, 1041 tests                                                                                                             |
| Schema         | `cd app && npx drizzle-kit generate`                                                                                                                                                          | "No schema changes, nothing to migrate"                                                                                                                                       |
| Mutation       | `stryker run --mutate` totals, stats, analytics, stages, usual-form, sighter-relation, `session-entry/last-time`, `json-export/from-rows`, `sync-client/rows`, `web/src/entry/running-totals` | 95.92% before the fixes below (1080 killed, 2 timeout, 46 survived); the 4 survivors on new lines then killed or removed                                                      |
| Backend        | `cd backend && pnpm test -- --testTimeout=60000`                                                                                                                                              | 28 files, 231 tests passed                                                                                                                                                    |
| Docs           | `mkdocs build --strict`, `docs-translation-check`, `docs-anchor-check`                                                                                                                        | pass                                                                                                                                                                          |
| Real execution | web preview (`expo start --web` behind `coi-proxy.mjs`), `/dev` → Load Demo Data, KM Precision C                                                                                              | Total 415 = Before Final 290 + Final 125; Shoot-off 39 shown apart; Avg/Series 41.5 over the 10 scored series; X 3 (no shoot-off X); sections Qualification, Final, Shoot-off |
| Dependencies   | none added or removed                                                                                                                                                                         | n/a                                                                                                                                                                           |

### Mutation survivors

On lines this change wrote, the first run left four survivors; none remain:

- `web/src/entry/running-totals.ts` `seriesOf`: three mutants of
  `isShootOff: row.is_shoot_off === 1` survived because that map is only
  looked up by position; the ordinal comes from the `all` list. The field was
  dead, so it is removed. The flag on `all` (which the ordinal reads) is
  killed.
- `shared/src/scoring/stats.ts` `goldSeriesCount`: `isShootOff === true` →
  `=== false` survived a symmetric fixture. The test now counts a shoot-off
  alone (0) and one beside unflagged and `false` series (2); the targeted
  re-run kills it (4/4).

The other 42 survivors sit on lines this change did not alter: date filters
in `analytics.ts`, the tie-break comparator in `stages.ts`, a sign boundary in
`sighter-relation.ts`, `previousSessionOf` and the `position <` comparison in
`session-entry/last-time.ts` (a module outside the `mutate` list), and the
web last-time helper's `isFinal` and position offsets. They are pre-existing
gaps, left for a separate change.

## Notes from the run

- The web preview's SQLite worker gives up after a fixed number of
  `Atomics.pause` spins; on this cloud VM a slow OPFS write tripped it
  ("Sync operation timeout", or a failed migration surfacing as "Failed to
  run the query 'ROLLBACK'"). The same build passed on one load and failed
  on the next, so it is the environment, not the baseline. The run used a browser init script that hides `Atomics.pause` so
  expo-sqlite falls back to its longer busy loop; no app code changed.
