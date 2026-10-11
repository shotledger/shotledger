# Web fält entry — executable specification

> Old-coder SPEC for #688, a follow-up to the web series entry (#669,
> `docs/specs/web-series-entry-spec.md`, deferral C4) under #301. Evidence
> report, once written: `docs/specs/web-falt-entry-evidence.md`. Decision
> record: ADR 0019 (web writes by pushing rows through `/sync/push`).
>
> **Approval status: NOT approved — written and built in one autonomous run;
> the key choices are listed in the PR for the maintainer.**

- **Tier: 3.** It writes synced rows. A wrong payload fails on every phone
  that pulls it: a `null` in a `NOT NULL` column, or an unknown foreign key,
  rolls the phone's apply transaction back on every later cycle, and an
  impossible station (seven hits, say) makes `faltResult` throw on every
  screen that shows the session.
- **Scope:** `shared/src/scoring/falt-station.ts` (new: the phone's station
  rules, moved), `shared/src/sync-client/falt-entry.ts` (new: rows and the
  builder), four helpers of `session-entry.ts` exported and two `EntryError`
  kinds added, the phone's `db/queries/falt.ts` and station screen importing
  the moved rules, `web/src/entry/falt-model.ts` and `falt-stations.tsx`
  (new), small local edits to `web/src/entry/entry.tsx`, i18n
  (`web.entry.*`), `docs/manual/` EN + SV, an app test and a backend
  round-trip spec.
- **Not in scope:** editing or deleting a fält session (#692), station
  photos, notes on a station, tags (#690), Webshooter imports.

## 1. Settled inputs (not re-asked)

1. Everything #669 settled and the maintainer approved: one Save is one
   `/sync/push` (C2), Retry resends the held request, the held request is
   bound to the account it was built for (R13, R14, R22), firearms are pulled
   again right before the build (C1), the start time is guarded (R28), the
   profile prefills the klass and event (C6).
2. The phone is the reference. A fält session on the phone is created on the
   new-session form (fält is in its discipline picker, with a Result Mode
   picker), then filled one station at a time on the station screen
   (`app/src/app/session/[id]/station/[pos].tsx`, `addStation` in
   `app/src/db/queries/falt.ts`). The web builds the rows those two screens
   write, in one push.

## 2. Key choices (for approval)

**C1. Fält goes in the existing Enter Series page, not a page of its own.**
The phone asks for a fält session on the same form as any other session, so
the web offers fält in the same discipline picker. Choosing it hides the
series rows and shows a station table in their place; every session field
(type, regulation, date, name, location, competition fields, firearm, ammo
lot) is the one form, unchanged. The series length field is hidden, as on the
phone (`showSeriesLength` is rings-only), and the decimal toggle already is
(`decimalAllowed` is false for fält). A **Result Mode** picker (Field / Point
field, default Field) appears for fält, for training and competition alike,
as on the phone (`showFaltResultMode`).
_Alternative:_ an **Enter Fält** page of its own. Not recommended: it repeats
every session field, and the two pages would drift.

**C2. A station row mirrors the phone's station screen, control for control.**
Hits (0–6), Figures Hit, Figures (the figures set out: – or 1–6), Points
`of` Max Points, Scratched (Shoot-off is not a row control: see R5, R6). Figures Hit offers only the values the
phone offers (1..min(hits, figures) when there are hits, else 0), and changing
Hits or Figures clamps it the way the phone does. The rules are the phone's
own, moved into `shared/src/scoring/falt-station.ts` and imported back by the
phone (`stationProblem`, `figuresHitRange`, `clampFiguresHit`,
`stationPoints`, `isBlankStation`), so neither side restates them. The
phone's error messages do not change.
_Alternative:_ a compact typed syntax per station (`5/3 4 12/20`), faster
from the keyboard but a second notation the phone does not have.

**C3. A blank station is not saved, and the stations stay numbered 1..n.**
The phone's station screen creates nothing when Save is pressed on a new
station with no hits, no figure count, no points and neither flag
(`isBlankStation`). The web drops such rows and numbers the rest
contiguously, as #669 drops blank series rows (its E2). The consequence is
the phone's: a station where every shot missed is only kept when its figure
count is recorded (or it is scratched). The page says which rows will not be
saved before Save (the row reads "Not saved: blank").
_Alternative:_ keep every row as typed, so a 0-hit station is 0/0. That would
be the web doing something the phone cannot.

**C4. The firearm counter moves six rounds per saved station.** The phone's
`addStation` moves both firearm counters by the session's volume delta,
six per station, scratched and shoot-off stations included
(`withSessionVolumeDelta`, `sessionVolume`). The web computes the same figure
with `sessionVolume({ stationCount: n, extraRounds: null, series: [] })` and
pushes the pulled firearm with both counters plus that (`withRoundsAdded`,
#669's C1). `extra_rounds` stays null: the phone offers extra rounds only on
a rounds-only session, never on a fält one. No firearm, or no saved station,
pushes no firearm row.

**C5. The session row is #669's, with fält's columns.** `newSessionRow` with
`program_id` null (fält has no program), `decimal_scoring` 0,
`series_length` null, and `falt_result_mode` set to the chosen mode, as the
phone's `onCreate` writes it. The fält builder spreads `newSessionRow` and
sets that one column, so `rows.ts` stays as #669 left it. A fält session gets
no `series` or `shots` rows.

**C6. #669's machinery is reused, not copied.** `save.ts` (held request,
Retry, account binding, refresh) and `pushChanges` are used unchanged. The
session-field rules the series builder applies (blank name falls back to the
default, text limits, the start-time guard, unknown firearm or ammo lot,
training takes the vapengrupp from the gun) are exported from
`session-entry.ts` and called by the fält builder. `EntryError` gains two
kinds, `stationPoints` and `invalidStation`, each with the form row, so the
page's existing error plumbing carries them.

**C7. The menu item and the page keep the title "Enter Series".** A fält
session is entered there too; renaming it is a wording call for the
maintainer (Questions in the PR), and other open PRs edit the same page.

## 3. Design

### 3.1 Station rules (`shared/src/scoring/falt-station.ts`, pure, moved)

- `stationProblem(station)` → `null` or the message the phone's
  `assertEnterable` throws today, for a station that still scores; a
  scratched station is never a problem. Checks, in the phone's order: hits an
  integer 0–6; figures hit 0..hits; hits > 0 needs a figure; figure count
  null or 1–6; figures hit ≤ figure count; points null or a non-negative
  integer; points ≤ max.
- `figuresHitRange(hits, figureCount)` → `{ min, max }`:
  `min = hits > 0 ? 1 : 0`, `max = min(hits, figureCount ?? 6)`.
- `clampFiguresHit(current, hits, figureCount)` → the value the phone's
  screen moves Figures Hit to when Hits or Figures change.
- `stationPoints(pointsText, maxText)` → `{ ok: true, points, pointsMax }`
  or `{ ok: false }`: whole numbers only, blank is null, points > max is
  invalid, and the max is dropped when no points were entered (the phone
  saves `pointsMax: hasPoints ? pointsMax : null`).
- `isBlankStation(station)` → the phone's "nothing entered" test.

### 3.2 Rows and builder (`shared/src/sync-client/falt-entry.ts`, pure)

- `newStationRow(id, now, fields)` → every `falt_stations` column, with the
  values `addStation` writes: `figure_count`, `points`, `points_max` null when
  not given, `is_scratched`/`is_shoot_off` 1 or 0, `photo_uri` and `note`
  null.
- `buildFaltEntry(draft, context, deps)` → `{ ok: true, sessionId, changes }`
  or `{ ok: false, errors }`; the same `EntryContext` and `EntryDeps` as
  `buildSessionEntry`. Throws `RangeError` for a discipline that is not scored
  in hits (a caller bug, like an unknown program in the series builder).
- Per station row (1-based `row` as the form shows it): points that do not
  parse → `stationPoints`; else a blank station is dropped; else a
  `stationProblem` → `invalidStation`. Kept stations get positions 1..k.
- Errors are collected together with the session-field errors; nothing is
  built while any exists.
- Changes in `APPLY_ORDER`: firearm (when one moves), session, stations.
  Every change has a fresh `clientChangeId`, `deletedAt: null`,
  `updatedAt = now`, `rowId = payload.id`. More than `PUSH_BATCH_MAX` →
  `tooManyChanges`.

### 3.3 The page (`web/src/entry/falt-model.ts`, `falt-stations.tsx`)

- `FaltForm = { resultMode, stations: StationRow[] }`, kept beside the
  series form; it starts with one blank station and Field.
- `entryDisciplines(regulationId)` lists every discipline of the regelverk,
  fält included, as the phone's picker does. The landing discipline stays
  `firstRingDiscipline` (precision for SPSF, as on the phone).
- Editing a station goes through `withHits`, `withFigureCount`,
  `withFiguresHit` (the clamp), and the plain setters. `faltSendsTheSame`
  keeps a held request when only blank stations were appended (Add Station),
  as #669's R21; any other edit drops it.
- The station table shows a running result, read with the phone's
  `faltSessionResultOf` and `formatFaltResult` over the stations that will be
  saved, and marks a blank row "Not saved: blank".
- `toFaltDraft(form, falt, defaultName)` takes the session fields exactly as
  `toDraft` does.

## 4. Scenarios

Every scenario maps 1:1 to a named test (name = id + title).

```gherkin
Feature: station rules (shared/src/scoring/falt-station.test.ts)
  Scenario: S1 stationProblem: null for a possible station, the phone's message for each impossible one
    Then {6,3,null,null,null} and {0,0,null,null,null} are fine
    And hits 7, hits 1.5, figuresHit 4 of 3 hits, 2 hits on 0 figures, figureCount 0 and 7,
        3 figures hit of 2, points -1, points 1.5 and 12 points of 10 each give its message,
        naming "station <position>"
    And a scratched station with 9 hits is fine
  Scenario: S2 figuresHitRange: 0..0 without hits, 1..min(hits, figures) with
  Scenario: S3 clampFiguresHit moves Figures Hit as the phone's screen does
    Then (3 → hits 1) = 1, (0 → hits 4) = 1, (5 → figures 2) = 2, (any → hits 0) = 0
  Scenario: S4 stationPoints: blank is null; "12"/"20" parse; "x", "1.5", "-1" and 12 of 10 are invalid;
           a max without points is dropped
  Scenario: S5 isBlankStation: only 0 hits, no figure count, no points and no flag is blank

Feature: fält rows and builder (shared/src/sync-client/falt-entry.test.ts)
  Scenario: FE1 a training fält entry: firearm +18, session, 3 stations, in APPLY_ORDER
    Then the session row has kind series, program_id null, decimal_scoring 0, series_length null,
         falt_result_mode "falt", and the stations positions 1, 2, 3
  Scenario: FE2 the chosen result mode is stored ("poangfalt")
  Scenario: FE3 blank stations are dropped and positions stay contiguous;
           a 0-hit station with a figure count is kept, and so is a blank scratched one
  Scenario: FE4 a station row carries every column with addStation's values
  Scenario: FE5 points that do not parse, or exceed the max, are refused (stationPoints, row); nothing built
  Scenario: FE6 an impossible scoring station is refused (invalidStation, row); a scratched one is kept
  Scenario: FE7 the firearm moves six per saved station, scratched and shoot-off included;
           no firearm or no saved station pushes no firearm row
  Scenario: FE8 competition fields are kept, training nulls them and takes the vapengrupp from the gun
  Scenario: FE9 the session-field errors are the series builder's
           (tooLong, unknownFirearm, unknownAmmoLot, invalidStartedAt), collected with station errors
  Scenario: FE10 a ring discipline throws RangeError
  Scenario: FE11 every change parses with ClientChangeSchema, ids fresh, rowId = payload.id;
           more than PUSH_BATCH_MAX changes is tooManyChanges
  Scenario: FE12 no station at all saves the session alone, as the phone can

Feature: fält rows on the phone's schema (app/src/db/queries/web-falt-rows.test.ts)
  Scenario: AF1 column parity: newStationRow's keys equal falt_stations' columns, the session row's sessions'
  Scenario: AF2 a web-built fält entry applies on the phone
    Given a firearm with round_count 100
    When a 4-station entry (one scratched, one shoot-off) built by buildFaltEntry is applied with applyChangesSync
    Then getSession has falt_result_mode "poangfalt", listStationsForSession returns the four in order,
         faltSessionResult equals the typed result, and the firearm's round_count is 124,
         which equals 100 + sessionVolumeRounds (the phone's own count)
  Scenario: AF3 nothing applied is re-queued (the outbox stays empty)

Feature: round trip (backend/test/web-falt-write.spec.ts, Workers pool, real D1)
  Scenario: WF1 a fält entry pushed through the real HTTP transport is pulled by a second device unchanged
  Scenario: WF2 resending the same request answers duplicate for every change and adds no rows

Feature: the page model (web/src/entry/falt-model.test.ts)
  Scenario: UF1 the discipline picker offers fält beside the ring disciplines; the form still lands on a ring one
  Scenario: UF2 changing Hits or Figures clamps Figures Hit (clampFiguresHit)
  Scenario: UF3 toFaltDraft carries the session fields as toDraft does, with the stations and the mode
  Scenario: UF4 Add Station keeps a held request; any other station or mode edit drops it
  Scenario: UF5 the running result counts only the stations that will be saved
  Scenario: UF6 a fresh fält form: one blank station, Field
  Scenario: UF7 Start Shoot-off: every station after a saved shoot-off is one, as on the phone
  Scenario: UF8 a shoot-off station is saved with its numbers, and dropped when left empty
  Scenario: UF9 only a station that will be saved counts: blank rows are the phone backed out of
```

Browser checks (not automated; screenshots under
`~/tmp/web-falt-entry-shots/`, never in the repo or the PR): enter a
fält competition with four stations (one scratched) against `wrangler dev`,
save, see it on the Sessions page with the right result; check the firearm's
round count moved by 24.

## 5. Must NOT

- **N1** No shooting data in browser storage: #669's grep test scans every
  module in `web/src/entry/`, the new ones included.
- **N2** No new endpoint, no protocol change, no forked schema (FE11, WF1).
- **N3** No `NOT NULL` column pushed as `null` (AF1, AF2).
- **N4** No row other than the new session, its stations and the chosen
  firearm is written; a fält session gets no series or shots (FE1, FE7).
- **N5** No impossible scoring station is ever pushed (FE6, S1).
- **N6** The phone's behaviour does not change: its fält tests
  (`app/src/db/queries/falt.test.ts`) pass unchanged with the moved rules.
- **N7** #669's behaviour does not change: its tests pass unchanged, and the
  ring-series path builds the same changes.

## 6. Failure model

| Way this hurts                                     | Caught by                                        |
| -------------------------------------------------- | ------------------------------------------------ |
| A column missing or null where the phone needs one | AF1, AF2                                         |
| An impossible station crashes the phone's screens  | FE6, AF2 (`faltSessionResult`)                   |
| The firearm counter moves by the wrong amount      | FE7, AF2 (against `sessionVolumeRounds`)         |
| A retry stores the session twice                   | reused `save.ts` (#669 U2, U7), WF2              |
| The web drifts from the phone's station rules      | C2's move: one implementation, S1–S5, N6         |
| A station silently renumbered                      | C3, the "Not saved: blank" mark, UF5             |
| The web's shoot-off state drifts from the phone's  | R5, R6: the last saved station decides; UF7, UF9 |

## 7. Setup plan

- **Isolation:** the existing worktree
  `/home/jimisola/orca/workspaces/shotledger/web-falt-entry`, branch
  `feat/web-falt-entry` from PR #669's head; the PR targets
  `feat/web-series-entry-impl`.
- **Git:** this spec first, then one checkpoint commit per green layer, all
  DCO-signed Conventional Commits with explicit paths.
- **Gauntlet:** existing. The new `.ts` modules fall under the
  `stryker.config.json` `mutate` globs already (`shared/src/scoring/*.ts`,
  `shared/src/sync-client/*.ts`, `web/src/entry/*.ts`), so the 100% coverage
  gate and Stryker take them without a config change. Backend Workers pool
  for WF1–WF2. No new gauntlet files.
- **New dependencies:** none.

## 8. Revisions

Appended during the same autonomous run; none loosens a constraint.

- **R1 (wording).** The blank-row mark reads "Not saved: nothing entered."
  ("Sparas inte: inget ifyllt."), not "Not saved: blank".
- **R2 (found in the browser).** `.series-rows { display: grid }` beat the
  `hidden` attribute, so the series rows stayed visible under the stations;
  `.series-rows[hidden]` now hides them. The station table's points fields
  overflowed their column and now fit it.
- **R3 (Stryker).** Tests added where mutants survived: a max without points
  is not checked (S1), points with a blank max parse (S4), a blank name falls
  back to the default (FE1), an edit to any station but the first and an
  appended row with points text both drop a held request (UF4). Three
  survivors are equivalent; the evidence report argues each.
- **R4 (difference from the phone, by layout).** The phone shows "Points
  can't be more than the max" as soon as the fields disagree; the web shows a
  row's points error after Save, with the other entry errors, as #669 does for
  a series row.
- **R5 (maintainer's ruling on the phone, #715/#717).** The per-station
  Shoot-off checkbox is gone. As on the phone, **Start Shoot-off** (shown once
  there is a station and no shoot-off yet) appends a shoot-off station, every
  station added after it is one too, and a shoot-off row carries a Shoot-off
  badge. A started shoot-off row with nothing else entered is blank (C3) and
  is not saved, as backing out of the phone's station screen saves nothing.
  Scratched stays on every row: unlike the phone, every web row is still
  being edited. UF7 and UF8 cover it; UF4 now checks that a blank started
  shoot-off keeps a held request.
- **R6 (independent verification round 1, F1 and F2).** R5 counted blank rows
  as stations, which the phone never does. Now only a row that will be saved
  counts: Start Shoot-off needs one, as the phone needs a saved station, and
  it is hidden while the last row is a shoot-off. A shoot-off left blank no
  longer makes the next station a shoot-off. Start Shoot-off on a trailing
  blank row turns that row into the shoot-off instead of adding another. UF7
  is narrowed to a saved shoot-off; UF9 covers the blank rows. UF5's title
  drops "in the chosen mode": `faltPreview` takes no mode, and the mode is
  applied only by the page when it formats the result.
- **Open for the maintainer (verification F3).** On the phone, Save on a new
  shoot-off station with nothing entered saves a 0-hit shoot-off (the flag
  comes from the route, so the station is not blank); the web drops such a
  row, as it does a blank ordinary one. Either is defensible; the web has no
  per-row Save to tell "pressed Save" from "backed out".
