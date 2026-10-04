# One volume figure — spec

Status: **not approved** — written in an autonomous run (2026-10-04); the
maintainer reviews it after the fact. Issue #512. Stacks on #543 (#511).

## Why

"Rounds fired" is computed in six places, each with its own rule, and they
disagree:

| Figure                                      | Shot rows | Sighters | Total-only series | Extra rounds | Fält stations |
| ------------------------------------------- | --------- | -------- | ----------------- | ------------ | ------------- |
| Home _Shots Logged_ (`countVolumeRounds`)   | yes       | yes      | **no**            | yes          | 6 each        |
| Ammo lot usage (`getAmmoLotUsage`)          | yes       | yes      | **no**            | yes          | 6 each        |
| Firearm counter (round-count, falt, import) | yes       | yes      | **no**            | yes          | 6 each        |
| Statistics report / JSON report             | yes       | yes      | yes               | yes          | 6 each        |
| Shooting log PDF                            | yes       | **no**   | **no**            | **no**       | 6 each        |
| JSON import preview                         | yes       | yes      | n/a               | **no**       | 6 each        |

A total-only series is a series saved as a total with no shot rows
(`is_total_override = 1`): a WebShooter import stores its shot count in
`total_override_shot_count`; a ShotLog CSV import stores none (NULL).

## The rule (maintainer, 2026-10-04, #512)

1. The shooting log counts every shot fired: scored shots, sighters, extra
   rounds and six per fält station.
2. Total-only series count toward volume everywhere.
3. All of these figures come from **one per-session volume calculation**.

A session's volume is:

```
Σ over its live series: total_override_shot_count if set, else its live shot rows
+ extra_rounds (NULL = 0)
+ 6 × its live fält stations (scratched and särskjutning included)
```

A total-only series with no stored count (ShotLog CSV) contributes **0**: the
app does not know how many shots it was, and guessing five would invent
volume (spec decision, flagged for review below).

## Where it lives

- `shared/src/scoring/volume.ts` — `seriesVolume`, `sessionVolume`: the pure
  rule. Every other volume function delegates to it.
- `app/src/db/queries/volume.ts` — reads the rows and applies the rule:
  `sessionVolumes(db, filter)` (a map, three grouped queries regardless of
  session count), `sessionVolumeRounds(db, id)`, `totalVolumeRounds(db, filter)`,
  and `withSessionVolumeDelta(db, sessionId, mutate)`, which moves the linked
  firearm's counters by the session's volume after the mutation minus before.

## Setup plan

- Tier 2 (bug fix across consumers; the counters are user data but nothing
  is rewritten).
- Isolation: worktree `~/tmp/wt-512`, branch `fix/one-volume-figure`, stacked
  on `fix/restore-double-counts-rounds` (#543). Dependencies rebuilt with
  `pnpm i`.
- Git: commits signed off (`-s`), explicit paths; spec committed first.
- Gauntlet: existing — `pnpm check`, `pnpm coverage` (100% on
  `shared/src/scoring`), `pnpm mutation` (Stryker) scoped to the changed shared
  files, docs gates. No new tool files.
- New dependencies: none.

## Scenarios

### Shared rule (`shared/src/scoring/volume.ts`)

- **U1** `sessionVolume` of a session with a sighter series of 5 shot rows,
  two series of 5, a total-only series stored as 10 shots, 7 extra rounds and
  2 stations is 5 + 10 + 10 + 7 + 12 = **44**.
- **U2** A total-only series with no stored count contributes 0; a total-only
  series with a count contributes the count, not its (zero) shot rows.
- **U3** `extraRounds: null` counts as 0; an empty session is 0.
- **U4** A negative or non-integer shot count, override count, extra-rounds
  value or station count throws `RangeError` (never silently clamped).
- **U5** Property: `sessionVolume` equals the sum of `seriesVolume` over its
  series plus extras plus 6 × stations, and adding a series, an extra round or
  a station raises it by exactly that series' volume / 1 / 6.
- **U6** `shotVolume` (totals.ts), `volumeShotCount` (stats.ts) and the
  report's series-length filter count a series through `seriesVolume`;
  their existing tests pass unchanged.
- **U7** `analyticsReportTotals.volumeShotCount` is Σ `sessionVolume` over the
  report's sessions, each with its matched series, its extra rounds and its
  station count. `AnalyticsSession.stationRounds` becomes `stationCount` (the
  six lives in one place). Existing report tests pass with that rename only.
- **U8** The JSON import preview's per-session `shotCount` is `sessionVolume`
  of the file's session — extra rounds now included (a session of 5 shots and
  12 extra rounds previews as 17, not 5).

### App (`app/src/db`)

- **A1** `sessionVolumes` returns every live session's volume per the rule;
  deleted shots, series, stations and sessions contribute nothing.
- **A2** Home _Shots Logged_ (`countVolumeRounds`) counts a WebShooter-style
  total-only series (6 × 5 shots → +30).
- **A3** Ammo lot usage counts the same series on its lot (+30).
- **A4** The shooting log's total is `totalVolumeRounds` over the printed
  sessions: sighters, extra rounds, total-only series and stations included.
- **A5** Firearm counter moves by the session-volume delta on: saving a
  series' shots, deleting a series, deleting a session, setting extra rounds,
  adding and deleting a station — each existing test unchanged.
- **A6** Deleting a total-only series (count 5) on a firearm-linked session
  backs 5 rounds out of the counter.
- **A7** WebShooter re-import over a firearm-linked session moves the counter
  by the new total-only series' counts minus the old ones.
- **A8** A WebShooter import that assigns a firearm (the §A.7 sighter-rounds
  option) credits that firearm with the session's whole volume — total-only
  series and stations — plus the sighter rounds.
- **A9** JSON import: an existing session's "before" is its `sessionVolume`
  in the database (total-only series included), the file's "after" is
  `sessionVolume` of the file's session. Firearms inserted from the file stay
  skipped (#543).

### Must NOT

- **N1** No stored `round_count` / `rounds_since_maintenance` is rewritten by
  this change — no migration, no recompute on start-up.
- **N2** No scored result changes: a total-only series' count is volume only.
- **N3** On the demo data every figure is unchanged except the shooting log
  (demo data has no total-only series and every session is firearm-linked).
- **N4** No existing test assertion is edited except the ones this spec names
  (U7's rename).

## Open question for the maintainer — counters already stored

Firearm counters are moved incrementally, so the rule applies from the next
save, edit or import on. Total-only series saved before this change were never
added to a counter. Two consequences:

- Existing counters are short by the stored shot count of every live
  total-only series on a firearm-linked session. On the demo data that is
  **0** (no such series). On any database it is:

  ```sql
  SELECT s.firearm_id, SUM(se.total_override_shot_count)
  FROM series se JOIN sessions s ON s.id = se.session_id
  WHERE se.is_total_override = 1 AND se.deleted_at IS NULL
    AND s.deleted_at IS NULL AND s.firearm_id IS NOT NULL
  GROUP BY s.firearm_id;
  ```

  ShotLog CSV imports store no count and contribute 0 here and under the new
  rule. A WebShooter import sets a firearm only through the sighter-rounds
  option, so the drift is bounded by those imports.

- Deleting or re-importing one of those old series now backs out rounds that
  were never added, so the counter drops below its true value (clamped at 0).

Options — the maintainer's call (hard rule 8 permits rewriting rows pre-1.0):

1. **One-time recompute** — a migration that adds each firearm's drift (the
   SQL above) to both counters once. Automatic; keeps manual starting counts
   and maintenance resets. (Recomputing the counter from scratch instead
   would discard both: the app stores neither separately.)
2. **Leave as is** — accept the short counters; deleting or re-importing an
   old series then over-subtracts as described.
3. **A "Recalculate" action** on the firearm screen that does the same as 1,
   user-triggered, and can be rerun after any future drift.

## Known gaps found, outside this change

- The JSON export (`shotledger.sessions`) has no field for a total-only
  series' total or count; such a series exports as an empty series, so a
  round-trip loses WebShooter/ShotLog results. A9 therefore counts no
  total-only series from a file.
- Changing a session's firearm on the edit screen moves no counter.

## Revisions

- **2026-10-04, during implementation.**
  - Setup plan: `scripts/mutate-volume.mjs` added — `app/src` is outside
    Stryker's scope, so the app half of the rule gets on-disk manual mutants
    (same contract as `scripts/mutate-schema.mjs`).
  - A8 widened: assigning the firearm also credits a fält import's stations,
    which were written before the firearm was set and so were never counted.
  - Test edits beyond U7, each a consequence of a scenario above:
    `webshooter.test.ts` "assigns the chosen firearm…" expects 40, not 5 (A8:
    seven total-only series of five plus five sighter rounds);
    `falt.test.ts` V2 asks `sessionVolumeRounds` instead of
    `stationRoundsForSession`, same numbers — that helper and
    `countAllStationRounds` were removed, so six-per-station lives only in
    `sessionVolume`; `analytics-sessions.test.ts` passes `stationCount: 2/3`
    where it passed `stationRounds: 12/18` (U7's rename).
