# Fält consumers — evidence report

Spec: [`falt-consumers-spec.md`](falt-consumers-spec.md). Issue #315, PR 2,
shipped as two stacked PRs: layer A (exports and volume) on
`jimisola/feat-disciplines-support-f-ltskjutning-hit-miss`, layer B
(statistics and personal bests) on `feat/falt-statistics`. Old-coder Tier 2
for layer A (glue over an existing format), Tier 2+ for layer B (new pure
module in `shared/src/scoring/`, property test included).

**Spec approval: obtained** — maintainer, 2026-10-03: "go on with layer a and
b". Layer B's §B.0 proposals were approved as written, not answered one by
one; §B.1's scenarios were then derived from them before code. Revisions made
during implementation are marked in the spec where they happened: B1/B2
dropped, J9 added, PB5's coverage line split out, the reqstool ids renamed.

- Source state: layer A `7ca3217`, layer B `0575369`, both rebased onto
  `origin/main` at `87d7f1f`. Working tree clean for both runs.
- Toolchain: node v24.12.0, vitest (root config), jest 30 (app), Stryker
  10.0.0 per `stryker.config.json`, mkdocs `--strict`, reqstool via pipx.
- Every number below is from one fresh run per branch after the last code edit.

## Behaviors → tests

| Spec      | Test                                                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| J1        | `falt-round-trip.test.ts > J1: exports every station, in order, with the result mode`                                                                                                                                                      |
| J2        | `… > J2: a ring session exports no stations and no result mode`                                                                                                                                                                            |
| J3        | `J3: imports them back into an emptied database field for field` (top-level, `@SVCs SVC_DATA_001`)                                                                                                                                         |
| J4        | `… > J4: credits the firearm six rounds per station, scratched and särskjutning included`                                                                                                                                                  |
| J5        | `… > J5: re-importing onto itself neither duplicates stations nor moves the counter`                                                                                                                                                       |
| J6        | `import.test.ts > J6: a station no round could have produced rejects its session`, `J6: a scratched station keeps numbers a scoring one could not have`, and `a file whose sessions carry no stations field is refused session by session` |
| J7        | `round-trip.property.test.ts > P21: import(export(x)) deep-equals x` — the arbitrary now generates stations (scoring and scratched) and both result modes                                                                                  |
| J8        | via V3: `shotsFired` is `totals.volumeShotCount`                                                                                                                                                                                           |
| J9        | `plan.test.ts > J9: a fält session’s stations count six rounds each`                                                                                                                                                                       |
| L1        | `session-list-row.test.ts` (jest) `L1: …` ×2, plus real execution below                                                                                                                                                                    |
| V1        | `V1: shots logged counts six rounds per live station, scratched and särskjutning included` (top-level in `falt.test.ts`, `@SVCs SVC_SCORE_006`)                                                                                            |
| V2        | `falt.test.ts > V2: a session’s station rounds, live stations only`                                                                                                                                                                        |
| V3        | `analytics-sessions.test.ts > V3: …` and `stats-sessions.test.ts > V3: …` (real SQLite)                                                                                                                                                    |
| H1, H2    | comment and spec edits; no behaviour                                                                                                                                                                                                       |
| R1–R3     | `falt-analytics.test.ts > R1 ×2, R2, R3 ×2`                                                                                                                                                                                                |
| R4        | `… > R4: the date, type, discipline and tag filter apply as to any session`                                                                                                                                                                |
| R5        | `… > R5: a shots-per-series filter excludes every fält session`, and `analytics-sessions.test.ts > R5: shotsPerSeries excludes a fält session, which has stations rather than series`                                                      |
| R6, R7    | real execution below; loader covered by `stats-sessions.test.ts > loads every live fält session with its stations in order, flags and tags included`                                                                                       |
| PB1       | `falt-analytics.test.ts > PB1 ×4` (mode order, poängfält apart, null mode, ungrouped)                                                                                                                                                      |
| PB2       | `… > PB2: of two rounds SHB cannot separate, the earlier stands` (both input orders)                                                                                                                                                       |
| PB3       | `… > PB3: a session with no scoring station has no group`                                                                                                                                                                                  |
| PB4       | `PB4: a ten-station round with two scratched competes with eight-station rounds` (top-level, `@SVCs SVC_SCORE_007`)                                                                                                                        |
| PB5       | `… > PB5: counts the sessions that reached a group, and the ungrouped among them`, plus real execution                                                                                                                                     |
| PB6       | real execution: the label reads "Fältskjutning · A · 8 stations"                                                                                                                                                                           |
| group key | `round-trips a group…` and a fast-check property over arbitrary groups                                                                                                                                                                     |

Pre-existing behaviour kept as regression armour, each proven by a one-off
mutant that was then restored (`git diff` empty afterwards):

- J5 passed before the change (nothing wrote stations). Mutant: drop the
  station tombstone on re-import → J5 fails.
- J6 was written after the schema. Mutants: refine always true → J6 fails;
  refine always false → J6-scratched and P21 fail.
- PB5's first version passed a `=== null` → `!== null` mutant (Stryker survivor).
  The test was strengthened as its own step (a second grouped session), the
  mutant re-run and killed.
- The new wipe assertion: removing `db.delete(faltStations)` from
  `wipeDemoData` fails both wipe tests.

## Invariants

| Spec | How it is held                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------ |
| N1   | Ring export/import tests unchanged except their fixtures gaining `faltResultMode: null, stations: []`. |
| N2   | `scoringStations` is the only path to a score in every new function; R2, PB3, PB4 exercise it.         |
| N3   | `round-count.ts`, `ammo-usage.ts` untouched; their P6 tests pass unchanged.                            |
| N4   | Layer A adds no fält _result_ to any statistic — only `stationRounds` to volume.                       |
| N5   | No dependency added, no DB schema change, `package.json` files unchanged.                              |
| N6   | Every pre-existing stats, records and PB test passes unchanged.                                        |
| N7   | Real execution: the all-disciplines report's records are the same ring sessions as before.             |

**One fixture change, declared:** `seed.test.ts` pinned the demo data at
exactly 30 sessions; it is now exactly 34 (four fält rounds added for
screenshots). The assertion is still exact, not loosened.

## Layers

| Layer                                                   | Command                                                                                                                                                          | Result                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite, types, lint, format, i18n, schema, licenses | `pnpm check`                                                                                                                                                     | layer A: vitest 2367 passed, jest 515 passed, exit 0. Layer B: vitest 2387 passed (137 files), jest 515 passed, exit 0                       |
| Coverage (100 % gate, fails closed)                     | `pnpm coverage` (layer B)                                                                                                                                        | statements 2818/2818, branches 1713/1713, functions 640/640, lines 2418/2418, exit 0                                                         |
| Mutation                                                | `npx stryker run --mutate "shared/src/json-export/types.ts,shared/src/json-export/plan.ts,shared/src/scoring/analytics.ts,shared/src/scoring/falt-analytics.ts"` | 418 mutants: 406 killed, 12 survived, 0 timeout, 0 no-coverage (97.13 %). Detail below                                                       |
| Property                                                | J7 (P21 with stations), the group-key round trip                                                                                                                 | pass, in `pnpm check`                                                                                                                        |
| reqstool                                                | `pnpm reqstool:tags && pnpm reqstool:status`                                                                                                                     | layer A 14/14 SVCs, layer B 15/15, exit 0                                                                                                    |
| Docs gates                                              | `mkdocs build --strict`, `docs-translation-check`, `docs-anchor-check`                                                                                           | all pass on both branches; 19 translated pages current                                                                                       |
| Real execution                                          | Expo web on Metro, driven headless (see below)                                                                                                                   | pass                                                                                                                                         |
| Supply chain                                            | —                                                                                                                                                                | no dependency change. `playwright-core` was installed in the session scratchpad only, to drive Chrome; it is not in the repo or any lockfile |

### Mutation survivors

- **Equivalent, introduced here (2):**
  - `types.ts:188` `s.points === null || …` → `false || …`: with `points`
    null, `null <= pointsMax` coerces to `0 <= pointsMax`, always true because
    `pointsMax ≥ 0`.
  - `falt-analytics.ts:59` `scoresHits: true` → `false`: the object is handed
    to `filterAnalyticsSessions`, which never reads `scoresHits`; the
    shots-per-series exclusion happens before that call.
- **Pre-existing, on lines this stack does not change (10):** `plan.ts:74, 78,
80, 98 ×2, 102` (firearm/license/ammo/tag naming), `analytics.ts:93, 94,
143, 144` (`fromIso !== null &&` — a string compared with `null` is false
  either way). Surfaced, not fixed: out of scope.

## Real execution

`expo start --web` on this branch, demo data loaded from `/dev`, driven by a
headless Chrome script, at 412×915.

- **Sessions list (L1):** "Fält-KM · 44 hits in 34 figures" — eight counting
  stations, the two scratched ones excluded; "Kretsfält vår · 43 hits in 34
  figures" with its särskjutning station excluded. No `0p`.
- **Stats form (R6):** Fältskjutning is a discipline option.
- **Report, Fältskjutning (R7):** Shots Logged 210 (35 stations × 6,
  scratched and särskjutning included), Sessions 4, Stations 32, Hit Rate 87 %
  (167 / 192), Hits 167, Figures Hit 130, hits-per-station chart drawn; no ring
  card. Each figure checked by hand against the seed.
- **Report, all disciplines:** 34 sessions; ring records unchanged; the same
  Fältskjutning card.
- **Report, Shots per Series = 5 (R5):** 30 sessions, no Fältskjutning card.
- **Records (PB4, PB5, PB6):** "Computed from 4 of your 34 sessions."; "Fältskjutning · A · 8
  stations — Fält-KM — 44 hits in 34 figures" (the ten-station round with two
  scratched, beating the eight-station 43 and 39); "… · 8 stations · Point
  field — Poängfält — 75 points". Tapping a row opens that session.

Console: one React warning about `accessibilityElementsHidden` on a DOM
element, already present on screens this stack does not touch.

**Not driven in the UI:** the JSON export → share sheet → import round trip,
and the PDF log. On web the share sheet and print dialog are the platform's;
the code they call is `buildExportJson`/`applyImport` and
`stationRoundsForSession`, which J3–J5, V2 and V3 exercise against real SQLite.

## Found, not fixed

- **A full restore double-counts firearm rounds — ring sessions too.**
  Importing into an emptied database inserts a file-carried firearm with the
  file's `roundCount`, then adds every session's rounds on top: a firearm at 2
  rounds comes back at 4. Reproduced with a ring session, so it predates fält.
- **The shooting log's "Shots" counts scored ring shots only** — no sighters,
  no extra rounds — while fält now contributes every station's six. SCORE_003
  says a sighter is volume; which number the log should show is a product
  call.
- **Home and the Sessions list print hits/figures for a poängfält round**
  rather than its points, unlike the station list and Records.
