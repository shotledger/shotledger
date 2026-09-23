# Fält stations: persistence and entry — evidence report

Spec: [`falt-stations-spec.md`](falt-stations-spec.md). Issue #315, PR 1 of 2.
Old-coder Tier 3 (a schema change on a synced table, plus `shared/scoring/`).

**Spec approval: obtained.** The maintainer approved the revised spec on
2026-09-22, after rejecting the first draft's six nullable columns on `series`
and directing that a fält station get its own table. Two further instructions
arrived during the work and are recorded as spec revisions, not as drift:
reset the migration history to a single baseline (revision 2), and the
confirmation that the phone is wiped and repopulated from the cleaned ShotLog
export. The correlation-breaking review therefore did happen, before code.

- Source state: branch `feat/falt-stations`, commit `2c190ac`, rebased onto
  `origin/main` at `a56fbb3`. Working tree clean at the time of the run.
- Toolchain: node v24.12.0, vitest (root config), jest 30 (app), Stryker 10.0.0
  per `stryker.config.json`, drizzle-kit 0.31.10, prettier, eslint, mkdocs
  with `--strict`, reqstool client via pipx.
- Every number below is from one fresh run after the last code edit.
- Entry point: `pnpm check`, then the layers quoted per section.

## Behaviors → tests

| Spec          | Test                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1            | `scoringStations (spec S1-S7) > S1: keeps plain stations, in order, as scoring stations`                                                           |
| S2            | `… > S2: drops a scratched station`                                                                                                                |
| S3            | `… > S3: drops a särskjutning station — it decides placement, never the score`                                                                     |
| S4            | `… > S4: drops a station that is both, once`                                                                                                       |
| S5            | `… > S5: an all-scratched round scores zero rather than failing`                                                                                   |
| S6            | `… > S6: the countback sees the surviving stations — a scratched last station is not the last`                                                     |
| S7            | `… > S7: a scratched station may hold numbers no valid station could`                                                                              |
| S8 (property) | `… > S8: order and membership hold for any combination of flags`                                                                                   |
| SCORE_005     | `records a scratched or särskjutning station without ever scoring it` (top-level, `@SVCs SVC_SCORE_005`)                                           |
| P1′           | `the migration chain is the whole schema > is exactly one baseline, never a chain`, plus `creates every column schema.ts declares, on every table` |
| P2            | `addStation / listStationsForSession (spec P2) > P2a…P2d`                                                                                          |
| P3            | `faltSessionResult (spec P3) > P3: counts neither the scratched station nor the särskjutning`                                                      |
| P4            | `creates an outbox capture trigger pair for every synced table` (falt_stations included via SYNCED_TABLES)                                         |
| P5            | `SYNC_TABLES > covers every table the protocol can name`, and the APPLY_ORDER permutation test                                                     |
| P6            | `stations are volume, even when they are not score > P6a, P6b, P6c`                                                                                |
| P7            | `… > P7: deleting a session takes its stations and their rounds with it`                                                                           |
| U1–U6         | Driven on the emulator — see "Real execution"                                                                                                      |

## Invariants

| Spec | How it is held                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1   | No test weakened or skipped. One test **removed** and declared: `N3` applied `0002_firearm_is_own`, a migration the baseline reset deleted, so it had no subject; its invariant is asserted by `N3b` against the schema.                                    |
| N2   | `faltResult`, `poangfaltPoints`, `compareFaltResults`, `byFalt` unchanged — the 21 pre-existing tests in `falt.test.ts` pass untouched.                                                                                                                     |
| N3   | `PROTOCOL_VERSION` is still 1; the payload is `z.unknown()`, so a new table needs no protocol change.                                                                                                                                                       |
| N4   | Statistics read **series** rows (`app/src/db/queries/stats.ts` iterates `seriesRows`). A fält session has none, so it contributes nothing to any statistic — by construction, not by a filter. No statistics, export or PDF file is touched by this branch. |
| N5   | No dependency added; `package.json` files unchanged.                                                                                                                                                                                                        |
| N6   | `shared/src/shotlog/tags.ts` and `dev/shotlog-import.tsx` still call `ringScoringDisciplines()` — ShotLog's own data has no fält.                                                                                                                           |
| N7   | `spsf-falt`'s vapengrupper untouched: A, A optisk, B, C, R.                                                                                                                                                                                                 |
| N8   | `series` has no column added, removed or changed — verifiable as an empty diff on that table in `schema.ts`.                                                                                                                                                |

## Layers

| Layer                           | Command                                                 | Result                                                                                         |
| ------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Full suite (root)               | `pnpm check` → `vitest run`                             | **134 files, 2324 tests, 0 failures**                                                          |
| Full suite (app)                | `pnpm check` → `jest`                                   | **37 suites, 411 tests, 0 failures**                                                           |
| Types                           | `pnpm typecheck`, `pnpm typecheck:app`                  | 0 errors                                                                                       |
| Lint                            | `eslint .`                                              | 0 warnings                                                                                     |
| Format                          | `prettier --check .`                                    | clean                                                                                          |
| i18n                            | `pnpm i18n:check`                                       | en 1075 keys, sv 1075 keys, 0 issues                                                           |
| Licenses                        | `pnpm licenses:check`                                   | 97 packages, invariants hold                                                                   |
| Export schema                   | `pnpm schema:check`                                     | published schemas match                                                                        |
| Mutation                        | `stryker run --mutate 'shared/src/scoring/falt.ts'`     | **123 mutants, 123 killed, 0 survived — 100%**                                                 |
| Mutation (whole gauntlet scope) | `pnpm mutation`                                         | 95.53%, above the 95 break threshold, exit 0                                                   |
| Coverage                        | `pnpm coverage`                                         | `shared/src/scoring/falt.ts` **100% lines/branches/functions**; see the baseline failure below |
| reqstool                        | `pnpm reqstool:tags` + `reqstool:status`                | **12/12 complete, 0 incomplete, PASS** (SCORE_005 included)                                    |
| Docs: build                     | `mkdocs build --strict`                                 | built, 0 warnings                                                                              |
| Docs: anchors                   | `node scripts/docs-anchor-check.mjs`                    | no dangling anchors                                                                            |
| Docs: translation               | `node scripts/docs-translation-check.mjs`               | 19 translated pages current                                                                    |
| Real execution                  | emulator `shotledger3`, x86_64 debug APK, Metro on 8083 | U1–U6, below                                                                                   |

### Baseline failure, pre-existing, not fixed

`pnpm coverage` exits nonzero: `Coverage for branches (99.76%) does not meet
global threshold (100%)`, from `shared/src/timer/pcm.ts` (34/35) and
`shared/src/timer/shot-detector.ts` (155/158). This branch touches no file
under `shared/src/timer/` — `git diff <merge-base>..HEAD -- shared/src/timer/`
is empty — and the misses arrive with #376/#400 on main. CI does not run
`pnpm coverage`, which is how main reached this state unnoticed. Held at zero
NEW failures; fixing it is someone's deliberate decision, not this PR's.

## Real execution — the emulator run

Fresh install on a wiped emulator, because a rewritten history cannot be
migrated across. The first launch over the OLD database failed **loudly** at
the migration gate ("Database migration failed … CREATE TABLE `ammo_lots`"),
which is the wanted behaviour: refuse, do not corrupt. After `pm clear` the
regenerated baseline applied and the app started.

| Spec | Observed                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1   | `Fältskjutning` offered in the Discipline picker; selecting it reveals **Result Mode** (Field / Point field) and hides Match Format. Session created.                                         |
| U2   | Station 1 entered as 5 hits in 3 figures → row reads `5/3`, header reads **5 hits in 3 figures**, Stations 1.                                                                                 |
| U3   | With hits = 5 the Figures Hit picker offers **1–5 only** — 0 is not offered while hits exist, and nothing above hits is. With hits = 4, 1–4.                                                  |
| U4   | Station 2 (4/2) scratched → **Scratched** chip, `4/2` struck through and dimmed, excluded from the total: after adding station 3 (5/3) the header reads **10 hits in 6 figures**, Stations 2. |
| U5   | "Add Station" then Back with nothing entered → still three stations, no orphan row.                                                                                                           |
| U6   | A precision session is unchanged: metric tiles, "Add Series", the entry-choice sheet, the ring keypad — five taps on `10` gives **Series Total: 50** with auto-advance.                       |

### Four defects the run found, all fixed and re-verified

Read the code and none of these appear; drive the app and all four do.

1. **The station list never refreshed on focus.** A station just entered was
   invisible until the app was restarted — `FaltStations` read at render time
   with nothing to re-trigger it. Fixed with `useFocusEffect`, re-verified:
   station 3 appeared immediately.
2. **Home showed a fält session as `0p`.** It has no series, so the points
   total was 0 forever. The row now reads "5 hits in 3 figures".
3. **The empty state read "No Series Yet"** on a session that has no series at
   all. Now station copy, in both languages.
4. **The save button read "Save Series"** on the station screen.

And one documentation error the app corrected: the manual said to pick
**Field Shooting**. The discipline's English name is `Fältskjutning` — hard
rule 9's carve-out keeps a federation's own name for its event — so the
manual was wrong, not the app.

## Honest notes

- **A test was removed**, declared in the spec and repeated here: `N3` applied
  `0002_firearm_is_own`, which the baseline reset deleted. Its invariant lives
  in `N3b`, asserted against the schema.
- **Regenerating the baseline silently dropped the `firearm_calibers`
  triggers**, which lived in the deleted `0003`. The trigger-pair test caught
  it. The carried-by-hand section's comment now says a new synced table must
  add its pair there.
- **A bug in #392 was fixed on the way**: `shared/src/scoring/falt.ts` was
  never exported from the shared barrel, so `SHOTS_PER_STATION` read
  `undefined` outside `shared` and every bound check silently passed. Caught
  by a query test that expected a throw and got none.
- **One RED test was wrong, not the code.** S6's control asserted that two
  rounds tie when scratched stations are counted; the countback walks
  backwards, so they separate on the next-to-last station. The expectation was
  corrected and sharpened into a reversal (dropped → a wins, counted → b wins)
  while the implementation stood.
- **The SCORE_005 test passed on first run.** Proven non-vacuous with a
  throwaway mutant (dropping the `isShootOff` filter made it read 16 hits
  instead of 10), then restored.
- **What this evidence does not cover**: sync round-tripping a station between
  two devices (the schema is registered and the triggers are asserted, but no
  two-device run was made), statistics/export/PDF for hits sessions (PR 2 by
  design), and WebShooter import (#352).
