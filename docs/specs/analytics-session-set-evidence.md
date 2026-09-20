# Evidence: the report's session set

Spec: [`analytics-session-set-spec.md`](analytics-session-set-spec.md), approved
by the maintainer on 2026-09-20 before any implementation existed, after one
revision that removed the chart work at their instruction.

Issue #349 item 1. Tier 2. Every number below comes from one final run made
after the last code edit, on branch `fix/stats-session-count-349`.

## Spec approval

**Obtained.** The maintainer was shown the spec in plain language, asked for
changes ("don't touch the charts, just fix the session count"), and approved
the revised version explicitly. Two revisions were then made _during_
implementation and are recorded in the spec's own "Revision during
implementation" section rather than absorbed silently — they are also listed
under **Deviations** below.

## Behaviour → test mapping

Every criterion, and the test that verifies it. `shared/src/scoring/analytics-sessions.test.ts`
unless marked otherwise.

| Criterion                                                | Test                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| FS-1 unset filter keeps every session                    | `FS-1: an unset filter keeps every session`                                    |
| FS-2 date bounds inclusive                               | `FS-2: the date bounds are inclusive`                                          |
| FS-3 sessionType                                         | `FS-3: sessionType keeps only that type`                                       |
| FS-4 disciplineId                                        | `FS-4: disciplineId keeps only that discipline`                                |
| FS-5 tagIds OR-match                                     | `FS-5: tagIds is an OR-match, and an empty list is no filter`                  |
| FS-6 shotsPerSeries ignored                              | `FS-6: shotsPerSeries is ignored — it is a question about series`              |
| FS-7 AND composition                                     | `FS-7: predicates compose with AND`                                            |
| RS-1 session with a matching series                      | `RS-1: …is included`                                                           |
| RS-2 series-free session counted                         | `RS-2: a series-free session matching the filter is included (266 vs 267)`     |
| RS-3 series-free session filtered out                    | `RS-3: …failing the session-level filter is excluded`                          |
| RS-4 all series excluded ⇒ session excluded              | `RS-4: a session whose only series are excluded by shotsPerSeries is excluded` |
| RS-5 shotsPerSeries never excludes a series-free session | `RS-5: …does not exclude a session that has no series at all`                  |
| RS-6 unknown session dropped                             | `RS-6: a matched series whose session is unknown is dropped, not invented`     |
| RS-7 ordering, no duplicates                             | `RS-7: sorted by startedAt then id, with no duplicates`                        |
| RS-8 empty input                                         | `RS-8: an empty session list yields an empty result`                           |
| RT-1 sessionCount                                        | `RT-1: sessionCount is the report session count, series-free ones included`    |
| RT-2 volume includes extraRounds                         | `RT-2: volumeShotCount adds every report session's extra rounds`               |
| RT-3 every other field delegated                         | `RT-3: every other field is identical to analyticsTotals over the same series` |
| RT-4 zero totals                                         | `RT-4: no series and no sessions gives the zero totals`                        |
| RT-5 series + extraRounds, once                          | `RT-5: a session with both series and extraRounds counts both, once`           |
| (extra) sighter scope reaches delegated fields           | `RT-6: the sighter scope still reaches the delegated fields`                   |
| SET-1 matchedSeries                                      | `SET-1: matchedSeries is the filtered series`                                  |
| SET-2 sessions/totals/scope                              | `SET-2: sessions and totals are the same as calling the parts, scope included` |
| SET-3 hasMatches follows the session set                 | `SET-3: hasMatches follows the session set, not the series`                    |
| E2E-1 real DB, count and volume                          | `app/src/db/queries/stats-sessions.test.ts` → `E2E-1`                          |
| E2E-2 rounds-only match reports a match                  | same file → `E2E-2`                                                            |
| (extra) soft-deleted session not counted                 | same file → `E2E-3`                                                            |
| (extra) session-level filter still applies end to end    | same file → `E2E-4`                                                            |

Negative constraints:

| Constraint                                                     | How it is held                                                                                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-1 existing analytics functions unchanged                     | `analytics.test.ts` and `sighter-scope.test.ts` pass untouched — not one line edited in either. `analyticsTotals`, `filterAnalyticsSeries`, `analyticsRecords`, `analyticsSessionPoints` keep their exact signatures |
| N-2 no chart code touched, no field on `AnalyticsSessionPoint` | `git diff --stat` below: `report.tsx` and `time-series-chart.tsx` do not appear, and `AnalyticsSessionPoint` is not in the diff                                                                                      |
| N-3 100% coverage on `shared/src/scoring`                      | `pnpm coverage`, numbers below                                                                                                                                                                                       |
| N-4 no new dependency                                          | no `package.json` or lockfile change in the diff                                                                                                                                                                     |
| N-5 no schema change / no write path                           | no migration, no `schema.ts` change; every function added is read-only                                                                                                                                               |
| N-6 sighter scope unchanged                                    | `sighter-scope.test.ts` passes untouched; RT-6 additionally asserts the scope still reaches the delegated fields                                                                                                     |
| N-7 no new i18n key                                            | `pnpm i18n:check`: 1036 keys both sides, 0 issues                                                                                                                                                                    |

## Gauntlet

Source state: commit `b7e1314` plus the manual and evidence commits that follow
it on `fix/stats-session-count-349`.

| Layer         | Command                                                 | Result                                                                                                                                                                 |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite    | `pnpm check`                                            | **2228 passed**, 0 failed (vitest) + **360 passed**, 34 suites (jest)                                                                                                  |
| Types         | `pnpm typecheck`, `pnpm typecheck:app` (inside `check`) | clean, 0 errors                                                                                                                                                        |
| Lint          | `pnpm lint` (inside `check`)                            | clean, 0 warnings                                                                                                                                                      |
| Format        | `pnpm format` (inside `check`)                          | clean                                                                                                                                                                  |
| Export schema | `pnpm schema:check` (inside `check`)                    | published schemas match                                                                                                                                                |
| i18n          | `pnpm i18n:check` (inside `check`)                      | 1036/1036 keys, 0 issues                                                                                                                                               |
| Licenses      | `pnpm licenses:check` (inside `check`)                  | 97 packages, invariants hold                                                                                                                                           |
| Coverage      | `pnpm coverage`                                         | **100%** statements (2600/2600), branches (1550/1550), functions (603/603), lines (2229/2229). Threshold is 100 and the layer exits nonzero when missed                |
| Mutation      | `pnpm mutation` (Stryker)                               | overall **95.92** ≥ break threshold 95. `shared/src/scoring/analytics.ts`: **98.32**, 234 killed, 0 timeout, **4 survived**, 0 no-coverage — all four classified below |
| Docs          | `mkdocs build --strict`                                 | built clean                                                                                                                                                            |
| Docs          | `node scripts/docs-anchor-check.mjs`                    | no dangling anchors                                                                                                                                                    |
| Docs          | `node scripts/docs-translation-check.mjs`               | 18 translated pages current, 0 stale                                                                                                                                   |

### RED was observed

All 24 shared tests were written against stubs that threw
`Error: not implemented`, and were run and seen to fail on behaviour — not on
import — before any implementation was written. The four database tests were
written after the composition existed; they are not claimed as RED.

### Surviving mutants: all four equivalent

Two survivors are **pre-existing**, in `filterAnalyticsSeries` (lines 93, 94),
untouched by this change. Two are the same mutant class in the new
`filterAnalyticsSessions` (lines 139, 140):

```
-  if (filter.fromIso !== null && session.startedAt < filter.fromIso) return false;
+  if (true && session.startedAt < filter.fromIso) return false;
```

**Equivalent, verified rather than asserted.** When `fromIso` is `null`, the
comparison `'2026-05-01T10:00:00.000Z' < null` is `false` in JavaScript, so the
mutant takes the same branch as the guard for every input:

```
$ node -e "const s='2026-05-01T10:00:00.000Z'; …"
guarded(from)  = false      mutant(from)   = false
guarded(to)    = false      mutant(to)     = false
```

No test was added to "kill" them — that would be gaming the score against a
mutant that cannot change behaviour. They mirror exactly the two long-standing
survivors on the sibling function, which is itself evidence that this is a
known equivalent class in this codebase and not a new hole.

### Real execution

Not run on the emulator for this change, and that is a real gap, stated rather
than papered over: the previous emulator session was shut down, and the change
has **no UI surface of its own** — the report screen already printed
`totals.sessionCount` and `volumeShotCount` and is not edited here, so there is
nothing new to look at. What the emulator would add over E2E-1 to E2E-4 is
confidence that the hook wiring compiles and runs, which `pnpm typecheck:app`
covers statically. The database tests exercise the real migration set, the real
Drizzle queries and the exact `analyticsReportSet` the app calls.

### Suite health

Not separately randomized: the repo has no `pytest-randomly` equivalent wired
up, and adding a test-ordering dependency was outside the approved setup plan.
The suites here construct their own fixtures per test and share no module-level
mutable state except a monotonic `seq` counter used only for unique ids.

## Deviations from the approved spec

Both were surfaced during implementation, written into the spec's own revision
section, and are repeated here so this report stands alone.

1. **`hasMatches` had to move too.** It was `matched.length > 0` — a question
   about series — and `report.tsx` renders the empty state from it. Fixing the
   session set while leaving `hasMatches` alone would have produced a report
   saying `sessionCount: 1` and "nothing matched" at the same time: the same
   contradiction this change exists to remove, moved one field along. Now
   `reportSessions.length > 0`. Criterion **E2E-2** added.
2. **The composition moved into `shared` as `analyticsReportSet`.** The
   end-to-end test could only reach `loadReport`'s wiring by restating it,
   because `use-stats-data.ts` imports `@/db/client` and expo-sqlite does not
   load under node — so the test would have asserted against a copy of the
   wiring instead of the wiring. Putting the four lines in `shared` means the
   app and the test run the same code. Criteria **SET-1** to **SET-3** added.

Neither deviation weakens a constraint; both add ones the spec was missing.

## Known limits

- **A total-override series still counts as "has series".** A Webshooter or
  ShotLog session whose series carry a stored total rather than shot rows is
  unaffected by this change — it has series, so it was always in the report.
  Nothing here changes how its shots are counted.
- **`sumExtraRounds` is no longer used by the report** but remains for its
  other callers; it was not touched.
- **The charts are untouched**, by instruction. The x-axis is still ordinal,
  the labels still carry no year, and "Session Score" still mixes maxima. That
  item stays open on #349.
