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

- Source state: branch `feat/falt-stations`, rebased onto `origin/main` at
  `a56fbb3`; commit under test recorded below.
- Toolchain: recorded below from the final run.
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

Filled from the final fresh run; see below.
