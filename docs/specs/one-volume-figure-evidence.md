# One volume figure — evidence (Tier 2)

- Spec: `docs/specs/one-volume-figure-spec.md`.
- Spec approval: **not obtained (autonomous run)** — confidence downgraded;
  the spec is the artifact to review after the fact.
- Source state: `8cf618f` (implementation) plus this branch's docs commit; no
  source file changed after the runs below.
- Toolchain: `pnpm-lock.yaml` (vitest 5.0.3, Stryker per lockfile).
- Isolation: worktree `~/tmp/wt-512` on `fix/one-volume-figure`, stacked on
  `fix/restore-double-counts-rounds` (#543); `pnpm i` rebuilt dependencies.
- Entry point: `pnpm check && pnpm coverage && node scripts/mutate-volume.mjs`
  plus the scoped Stryker run below.
- Independent verification: not performed (Tier 2).

## Spec → test mapping

| Scenario                                                    | Test                                                                                                           | Status |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| U1 shots, sighters, total-only, extras, stations = 44       | `shared/src/scoring/volume.test.ts` › U1 (SVC_SCORE_010)                                                       | pass   |
| U2 total-only by stored count; unknown count = 0            | `volume.test.ts` › seriesVolume (U2), 3 tests                                                                  | pass   |
| U3 null extras = 0; empty session 0; stations alone         | `volume.test.ts` › sessionVolume (U3), 3 tests                                                                 | pass   |
| U4 RangeError on negative / fractional / NaN / ∞            | `volume.test.ts` › rejects impossible counts (U4), 17 tests                                                    | pass   |
| U5 sum of parts; additive (property)                        | `volume.test.ts` › sessionVolume properties (U5), 2 fast-check properties, 100 runs each                       | pass   |
| U6 `shotVolume`, `volumeShotCount`, length filter delegate  | existing `totals.test.ts`, `stats.test.ts`, `analytics.test.ts`, unchanged                                     | pass   |
| U7 report volume = Σ `sessionVolume`                        | `analytics-sessions.test.ts` › U7 ×2; existing V3 / RT tests (rename only)                                     | pass   |
| U8 import preview includes extra rounds (5 + 12 → 17)       | `shared/src/json-export/plan.test.ts` › U8                                                                     | pass   |
| A1 DB volume per session, deletions ignored                 | `app/src/db/queries/volume.test.ts` › A1 (SVC_SCORE_010), sessionVolumes (A1) ×3                               | pass   |
| A2 Home Shots Logged counts total-only series               | `volume.test.ts` › A2                                                                                          | pass   |
| A3 ammo lot usage counts total-only series                  | `volume.test.ts` › A3                                                                                          | pass   |
| A4 shooting log total over the printed sessions             | `volume.test.ts` › A4 + "sums only the sessions asked for"                                                     | pass   |
| A5 counter moves by the volume delta on every mutation      | existing `round-count.test.ts`, `extra-rounds.test.ts`, `falt.test.ts` unchanged; `volume.test.ts` › A5 ×2     | pass   |
| A6 deleting a total-only series backs its count out         | `volume.test.ts` › A6                                                                                          | pass   |
| A7 WebShooter re-import moves the counter by the difference | `webshooter.test.ts` › A7 ×2                                                                                   | pass   |
| A8 assigning a firearm credits the imported volume          | `webshooter.test.ts` › "assigns the chosen firearm…" (40), A8 fält (29)                                        | pass   |
| A9 JSON import's before figure includes total-only series   | `import-round-counters.test.ts` › A9; RC-1…RC-8 and #543's tests unchanged                                     | pass   |
| N1 no stored counter rewritten                              | no migration in the diff (`git diff 2e82428 --stat -- app/src/db/migrations` is empty)                         | pass   |
| N2 no scored result changes                                 | full suite: every score test unchanged and green                                                               | pass   |
| N3 demo figures unchanged except the shooting log           | real execution below                                                                                           | pass   |
| N4 no other assertion edited                                | spec Revisions lists every edited assertion; `git diff 2e82428 -- '*.test.ts'` shows only those plus new tests | pass   |

## Gauntlet (final run)

| Layer              | Command                                                                                                       | Result                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests, types, lint | `pnpm check`                                                                                                  | exit 0; vitest 2487 passed, jest 52 suites passed; tsc (both projects), eslint, prettier, i18n, schema, licenses clean                         |
| Traceability       | `pnpm reqstool:tags && pnpm reqstool:status`                                                                  | exit 0; SCORE_010 has 3 implementations, 2 passing tests; 0 SVCs missing tests                                                                 |
| Coverage           | `pnpm coverage`                                                                                               | exit 0; 100% statements 2845/2845, branches 1761/1761, functions 659/659, lines 2445/2445 over the gated shared modules (`volume.ts` included) |
| Mutation (shared)  | `npx stryker run --mutate` volume, totals, stats, analytics, falt-analytics, json-export/plan                 | 98.17% (632/644). `volume.ts` 30/30, `totals.ts`, `stats.ts` 100%. All 12 survivors are on unchanged lines (see below)                         |
| Mutation (app)     | `node scripts/mutate-volume.mjs`                                                                              | 15/15 killed. Negative control: a comment-only mutant was reported SURVIVED and the runner exited 1                                            |
| Property-based     | U5 in `volume.test.ts`                                                                                        | 2 properties × 100 runs (fast-check default)                                                                                                   |
| Suite health       | `vitest run --sequence.shuffle --sequence.seed=512` on `shared/src/scoring shared/src/json-export app/src/db` | 809 passed                                                                                                                                     |
| Docs               | `mkdocs build --strict`, `node scripts/docs-anchor-check.mjs`                                                 | exit 0; no dangling anchors. Translation check: EN and SV of every page changed in one commit                                                  |
| Supply chain       | —                                                                                                             | N-A: no dependency added or removed                                                                                                            |

### Stryker survivors (all on lines this change did not touch)

- `json-export/plan.ts:74, 78, 80, 101 (×2), 105` — firearm, license, ammo and
  tag name de-duplication in the dry-run plan.
- `analytics.ts:95, 96, 145, 146` — `filter.fromIso !== null && …` → `true && …`:
  equivalent, since a string compared with `null` is false either way.
- `analytics.ts:285` — the default `tieBreak` of `analyticsRecords`.
- `falt-analytics.ts:59` — `scoresHits: true` → `false` in the object passed to
  `filterAnalyticsSessions`, which never reads it: equivalent.

## Real execution — demo data (`seedDemoData`)

Measured in a throwaway vitest file against the same seeded database before
and after the change (not committed: it only prints).

| Figure                      | Before                     | After     |
| --------------------------- | -------------------------- | --------- |
| Home Shots Logged           | 1508                       | 1508      |
| Statistics report, all time | 1508                       | 1508      |
| Ammo lots (5)               | 260 / 138 / 176 / 133 / 97 | unchanged |
| Firearm counters (4)        | 524 / 390 / 334 / 260      | unchanged |
| Shooting log, all sessions  | **1235**                   | **1508**  |

The 273 the log gains are the demo's sighter series and extra rounds. The demo
has no total-only series, so nothing else moves, and its four counters sum to
1508 — no drift.

The same database plus one WebShooter-style session (six total-only series of
five, on the first firearm and lot, written the way the importer writes them):

| Figure            | Before | After                                                               |
| ----------------- | ------ | ------------------------------------------------------------------- |
| Home Shots Logged | 1508   | 1538                                                                |
| Report            | 1538   | 1538                                                                |
| That ammo lot     | 260    | 290                                                                 |
| Shooting log      | 1235   | 1538                                                                |
| That firearm      | 524    | 524 — the 30 rounds are the drift the spec's open question is about |

## Layers not run as specified

- N-A: supply chain (no dependency change).
- SUBSTITUTED: mutation of `app/src` — Stryker's scope is `shared/` and
  `backend/`; 15 hand-chosen on-disk mutants ran instead. They cannot find a
  bug no mutant imitates.

## Structural blind spot

- The PDF builder (`use-pdf-export.ts`) and Home's hook import the device DB
  client and are not unit-tested; the test covers `totalVolumeRoundsFor` /
  `countVolumeRounds`, which they now call with no arithmetic of their own. The
  running app was not driven for this change: no screen layout or string
  changed, only the numbers the existing labels print.

## Honest notes

- U6/U7/A1/A4 tests passed on first run because the shared rule and the DB
  helpers were written first. U7's new case was proven against a throwaway
  mutant (the old "series total + extras + stations" formula) and failed as
  expected; A1/A4 are covered by the app mutants above. A2, A3, A5, A6 and U8
  were observed RED before their consumers switched over.
- The counters already stored are short by the drift the spec describes; this
  change does not rewrite them (N1). The maintainer chooses among the spec's
  three options.
