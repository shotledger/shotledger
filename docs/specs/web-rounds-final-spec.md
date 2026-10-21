# Rounds-only sessions and final series on the web — executable specification

> Amended by #727 PR B (`docs/specs/maintenance-counter-727-spec.md`):
> `firearms.rounds_since_maintenance` was dropped. Every move named here now
> moves `round_count` only; rounds since maintenance is derived from the
> maintenance log.

> Old-coder SPEC for #689, a follow-up to the web series entry of #669
> (`docs/specs/web-series-entry-spec.md`, whose C1–C9 and R1–R28 this layer
> inherits unchanged). Evidence report: `docs/specs/web-rounds-final-evidence.md`.
> Decision record: ARCHITECTURE.md § Web app (web writes push whole rows through `/sync/push`).
>
> **Approval status: NOT approved — written and built in one autonomous run;
> the key choices are listed in the PR for the maintainer.**

- **Tier: 3.** It writes synced rows. A wrong payload does not fail on the
  web: it fails on every phone that pulls it, and a wrong counter move is
  replicated to every device.
- **Scope:** `shared/src/sync-client/rounds-entry.ts` (new, pure);
  `shared/src/sync-client/{rows,session-entry}.ts` (optional fields and one
  per-section sighter rule, no behaviour change for what #669 builds);
  `web/src/entry/kinds.ts` and `web/src/entry/kind-fields.tsx` (new); small,
  local edits to `web/src/entry/{model.ts,entry.tsx}`; `web.entry.*` strings;
  one app test on the phone's schema, one backend round-trip spec;
  `docs/manual/` EN + SV.
- **Not in scope:** fält entry (#688), tags (#690), photos (#691), editing a
  saved session (#692), ISSF-style decimal finals (see C3).

## 1. Settled inputs (not re-asked)

1. ARCHITECTURE.md § Web app and #669 C1–C9 as approved: one Save is one push, Retry resends
   the held request, a held request is bound to its account (R13, R14, R22),
   the firearm is pulled afresh just before the build (C1), `startedAt` must
   be in `toISOString`'s shape (R28).
2. The phone is the reference. Every row this layer writes is the row the
   phone writes for the same act (`app/src/app/session/new.tsx` `onCreate`,
   `setSessionExtraRounds`, `addSeries`, the session detail's Start Final).

## 2. What the phone does (read from `app/src/`, 2026-10-10)

**Rounds-only.** The new-session form's **Logging** picker (`kind`:
Scored Series / Rounds Only). A `rounds` session gets `kind: 'rounds'`,
`program_id: null`, `decimal_scoring: 0`, `series_length: null`,
`falt_result_mode: null`, and no series. **Rounds Fired** is trimmed; blank
leaves `extra_rounds` null; a non-negative integer goes through
`setSessionExtraRounds`, which stores it in `extra_rounds` and moves the
firearm's `round_count` and `rounds_since_maintenance` by the change in
`sessionVolume` (`withSessionVolumeDelta`) — here by the rounds fired, so `0`
stores 0 and moves nothing. `Number()` decides what counts as an integer, so
`1e2` stores 100, `0x10` 16, and `+5` and `5.0` store 5; text it cannot read
(`abc`, `2.5`, `-3`) is ignored silently, with `extra_rounds` null. (Before
R4; the phone now uses C4's rule.) The discipline list is
`disciplinesForRegulations` — every discipline, fält included. The other
fields (type, name, location, competition fields, vapengrupp, klass, event,
firearm, ammo lot) are asked and stored as for a series session.

**Final series.** Offered only in a session whose program has
`supportsFinal` and no fixed `structure` (`canStartFinal` in
`use-session-detail.ts`, the Add Series card hidden for a fixed format). In
the shipped data that is one program, **SPSF Precision** (`spsf-precision`,
integer). **Start Final** appears once the session has an ordinary series
with at least one shot and no final yet; after it, Add Series adds final
series (`is_final: 1`), positioned after every existing series. The final has
its own sighter: at most one sighter per section, main and final
(`addSeries`'s `SighterLimitExceededError`). The scoring mode and series
length are the session's. Every final shot counts for volume and the firearm,
as any series does. `sessionResults` splits the total into before final and
final.

## 3. Key choices (for approval)

**C1. A rounds-only session is built by its own pure builder.**
`buildRoundsEntry(draft, context, deps)` in a new
`shared/src/sync-client/rounds-entry.ts` returns the same `EntryResult` as
`buildSessionEntry`: at most two changes, the firearm (when chosen and the
rounds are > 0) and the session. It reuses `buildSessionEntry`'s field rules
(name fallback, competition-only fields, training vapengrupp from the gun,
text limits, unknown firearm or ammo lot, R28) by exporting those helpers
from `session-entry.ts` rather than restating them.
_Alternative:_ a `kind` branch inside `buildSessionEntry`. Not chosen: that
function is being edited by two open PRs (#713, #714), and the rounds path
shares none of its series logic.

**C2. The counter moves by the rounds fired, as `setSessionExtraRounds`
does.** One push carries the session with `extra_rounds = n` and the pulled
firearm with both counters `+ n` (`withRoundsAdded`, #669 C1). `n = 0` stores
`extra_rounds: 0` and pushes no firearm row, as the phone's zero delta moves
nothing.

**C3. A final series is a section of the Enter Series form, offered exactly
where the phone offers it.** When the program supports a final (SPSF
Precision), a **Start Final** button appears once an ordinary row holds a
shot and no final row exists; it appends a final row under a **Final**
heading. Enter in the last final row and Add Series add final rows, as the
phone's Add Series does after Start Final. Final rows are ordinary series rows
with `is_final: 1`, scored in the session's mode with the session's series
length, and their own one sighter. Positions run 1..n over the main rows, then
the final rows. Clearing every final row removes the final (blank rows are
dropped, #669).
_Not done:_ an ISSF-style decimal final. The phone has no such model: no ISSF
program supports a final, and a final is scored in the session's mode. The
issue brief's "decimal scoring" therefore has nothing to mirror; it is a
question for the maintainer (§8), not something this layer invents.

**C4. Rounds Fired is plain digits, on the web and the phone.** Blank stays
"none" (`extra_rounds` null), and a whole number of digits is stored. Anything
else — `-3`, `2.5`, `abc`, `1e2`, `0x10`, `+5`, or a number above
`Number.MAX_SAFE_INTEGER` — is refused (`invalidRounds`) with nothing sent.
One function, `parseRoundsFired`, decides for both; the phone shows the same
error and does not create the session (maintainer, 2026-10-11).
_Alternative:_ mirror the phone and drop the count silently. Not recommended:
on a page whose purpose is to type a record in, losing what was typed without
a word is the worse failure, and what is stored for every accepted value is
the phone's.

**C5. Switching Logging mirrors the phone's `onSelectKind`.** To Rounds Only:
no program, no decimal scoring (`withProgram(null)`), the discipline list
becomes every discipline of the regulation (fält included). Back to Scored
Series: Rounds Fired is cleared; the program stays none, as on the phone. If
the discipline is fält, the form moves to the regulation's first ring
discipline, because fält series are not entered on the web yet (#688).

## 4. Design

### 4.1 Rows (`rows.ts`)

`SessionFields` gains optional `kind` (default `'series'`) and `extraRounds`
(default `null`); `SeriesFields` gains optional `isFinal` (default `false`).
Every payload #669 builds is unchanged.

### 4.2 `buildRoundsEntry` (`rounds-entry.ts`)

`RoundsEntryDraft` is `SessionEntryDraft` without `programId`,
`decimalScoring`, `seriesLength` and `series`, plus `roundsFired: string`.
`parseRoundsFired(text)`: trimmed blank → `null`; `/^\d+$/` and a safe integer
→ that number; else `invalid`. Errors are collected as in `buildSessionEntry`
(`tooLong`, `unknownFirearm`, `unknownAmmoLot`, `invalidStartedAt`, and the new
`invalidRounds`). The session row: `kind: 'rounds'`, `program_id: null`,
`decimal_scoring: 0`, `series_length: null`, `extra_rounds`; the other fields
as `buildSessionEntry` sets them. Any discipline is accepted.

### 4.3 Final rows (`session-entry.ts`)

`SeriesDraft` gains optional `isFinal`. A final row in a session whose program
does not support a final, or in a fixed format, throws `RangeError` (the form
never offers it; R18 reports a throw as `failed: unknown`). The free-format
one-sighter rule counts per section; the `secondSighter` error is unchanged.
The kept series carry `isFinal` into `newSeriesRow`.

### 4.4 The form (`web/src/entry/`)

`EntryForm` gains `kind` and `roundsFired`; `Row` gains optional `isFinal`.
`kinds.ts` holds `withKind`, `disciplineOptions`, `finalOffered`,
`canStartFinal`, `startFinal` and `toRoundsDraft`. In `model.ts`: `addRow`
copies the last row's section, `canMarkSighter` counts per section,
`layoutRows` clears `isFinal` when the program does not offer a final, and
`toDraft` carries `isFinal`. The page shows a **Logging** picker after Type;
under Rounds Only it hides the match format, decimal scoring, series length
and series rows and shows **Rounds Fired**; Save calls `buildRoundsEntry`.

## 5. Scenarios

Every scenario maps 1:1 to a named test (name = id + title).

```gherkin
Feature: rows (shared/src/sync-client/rows.test.ts)
  Scenario: K1 a session row takes kind and extra_rounds; absent, they default to 'series' and null
  Scenario: K2 a series row takes is_final; absent, it is 0

Feature: rounds-only builder (shared/src/sync-client/rounds-entry.test.ts)
  Scenario: RO1 a rounds session: kind 'rounds', no program, decimal 0, series_length null, extra_rounds n, in APPLY_ORDER
    Given a firearm with round_count 100, rounds_since_maintenance 40, and "60"
    Then two changes: the firearm with 160 and 100, then the session with extra_rounds 60
  Scenario: RO2 parseRoundsFired: "" and "  " → null; "0" → 0; " 007 " → 7;
            "-3", "2.5", "abc", "1e2", "0x10", "9007199254740992" → invalid
  Scenario: RO3 blank rounds: extra_rounds null and no firearm row; "0": extra_rounds 0 and no firearm row
  Scenario: RO4 invalid rounds is refused with invalidRounds, nothing built, collected with the other errors
  Scenario: RO5 the shared field rules apply: blank name → defaultName; training nulls the competition fields
            and takes the vapengrupp from the gun; competition keeps them; a text over TEXT_LIMITS is refused
  Scenario: RO6 an unknown firearm or ammo lot and a bad startedAt are refused (R28's cases)
  Scenario: RO7 a fält discipline is accepted (falt_result_mode null)
  Scenario: RO8 every change parses with ClientChangeSchema, rowId = payload.id, ids fresh

Feature: final rows (shared/src/sync-client/session-entry.test.ts)
  Scenario: FS1 SPSF Precision: two main rows then two final rows → positions 1..4, is_final 0,0,1,1,
            and the firearm moves by every shot, final included
  Scenario: FS2 one sighter per section: a main sighter and a final sighter both pass; a second final sighter is refused
  Scenario: FS3 a final row with a program that has no final (free format, Magnumprecision, a fixed format) throws RangeError
  Scenario: FS4 a blank final row is dropped like any blank row; a blank final sighter is kept
  Scenario: FS5 a final with nothing shot is not saved, its blank sighter included
  Scenario: FS6 a final without a scored main series (none left, or only a sighter) is refused

Feature: the form (web/src/entry/kinds.test.ts)
  Scenario: WK1 withKind('rounds') clears program and decimal; back to 'series' clears roundsFired and keeps no program
  Scenario: WK2 disciplineOptions: series → ring disciplines; rounds → every discipline of the regulation, fält included
  Scenario: WK3 back to series from fält moves to the first ring discipline
  Scenario: WK4 finalOffered only for a program with supportsFinal and no structure
  Scenario: WK5 canStartFinal: needs an ordinary main row with a parsed shot and no final row yet
  Scenario: WK6 startFinal appends a final row; addRow and Enter in the last final row add final rows
  Scenario: WK7 canMarkSighter counts per section
  Scenario: WK8 a program change to one without a final turns final rows into ordinary rows
  Scenario: WK9 toRoundsDraft carries the session fields and the rounds text; toDraft carries isFinal
  Scenario: WK10 sendsTheSame: Start Final keeps a held request (a blank row); a kind change drops it

Feature: on the phone's schema (app/src/db/queries/web-rounds-final.test.ts)
  Scenario: AP1 a web rounds session equals the phone's own: createSession + setSessionExtraRounds
            build the same session payload (ids and clock aside), and both firearms end at the same counters
  Scenario: AP2 a web final applies: listSeriesForSession has is_final 1 on the final rows,
            loadSessionDetail's results split before final and final, sessionVolumeRounds counts every shot

Feature: round trip (backend/test/web-rounds-final.spec.ts, Workers pool, real D1)
  Scenario: WR1 a rounds session and its firearm pushed by the web are pulled by a second device unchanged
  Scenario: WR2 a final session pushed by the web is pulled with its is_final rows; resending answers duplicate
```

Browser checks (not automated; screenshots under
`~/tmp/feat-web-rounds-final-689-shots/`, never in the repo or the PR): enter a
rounds-only session with a firearm and see the counter move on the Firearms
data after the refresh; enter a Precision competition with a final and see the
Sessions page show it; refuse `2.5` rounds.

## 6. Must NOT

- **N1** Change any payload #669 builds for a series session without a final
  (the existing session-entry, web-rows and web-write tests stay as they are).
- **N2** Write any row besides the new session, its series and shots, and the
  chosen firearm (RO1, FS1).
- **N3** Push a `NOT NULL` column as null, or a column the phone's schema does
  not have (AP1, AP2, A1 of #669).
- **N4** Offer a final where the phone does not (FS3, WK4), or move a counter
  by anything but the session volume (RO1, RO3, FS1).
- **N5** Keep shooting data in browser storage (#669's N1 test covers
  `web/src/entry/`).
- **N6** Restate a phone rule in `web/`: field rules come from the shared
  builders, the final gate from the program data.

## 7. Failure model

| Failure                           | Effect                                         | Guard                                      |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| bad Rounds Fired text             | nothing sent, the field's error shown          | C4, RO2, RO4                               |
| firearm tombstoned elsewhere      | session saved, counter not moved, said so      | #669 W3, unchanged path                    |
| a phone moved the counter offline | last write wins on the firearm row             | ARCHITECTURE.md § Web app, #669 C1 (as is) |
| lost response                     | request held, Retry resends it                 | #669 C2, R13, unchanged                    |
| a final where none is offered     | build throws → `failed: unknown`, nothing sent | FS3, R18                                   |
| a final with nothing shot         | the final is not saved                         | FS5                                        |
| a final with no main round        | nothing sent, the error shown                  | FS6                                        |

## 8. Questions for the maintainer

1. **Decimal finals.** The phone's only final is SPSF Precision's, integer.
   Should ISSF finals (decimal, 10.9) exist at all? That is a phone change
   first (a program with `supportsFinal`, its rules from the ISSF rule book).
2. ~~**C4.**~~ Answered 2026-10-11: plain digits only, on the phone too (R4).

## 9. Setup plan

- **Isolation:** this Orca worktree, branch `feat/web-rounds-final-689` from
  `origin/main` (1487e954).
- **Git:** the spec first, then checkpoint commits per green layer; DCO-signed
  Conventional Commits, explicit paths.
- **Gauntlet:** existing. The new modules fall under the `stryker.config.json`
  `mutate` globs (`shared/src/sync-client/*.ts`, `web/src/entry/*.ts`), so the
  100% coverage gate of `pnpm check` applies to them; `pnpm mutation` scoped
  to the changed modules; the backend Workers pool; the app's vitest.
- **New dependencies:** none.

## 10. Revisions

Appended during the build; none loosens a constraint.

- **R1 (AP2's oracle).** `loadSessionDetail` reads the app's global database
  client, which the vitest harness does not have. AP2 instead builds the same
  session on a second phone database through `addSeries` and
  `saveSeriesShots`, requires the web's series and shots to equal those, and
  runs `sessionResults` — the function `loadSessionDetail` calls — over them.
- **R2 (FS3 widened).** The final gate reads `supportsFinal` alone, as
  `canStartFinal` does; a test pins that the one program with a final lays
  out no skeleton, so the phone's "not a fixed format" condition is implied.
- **R3 (RO7 widened).** An unknown discipline throws, as `buildSessionEntry`
  does.
- **R4 (maintainer, 2026-10-11, verification F1, F3, F4).** C4 rests on a
  corrected premise: the phone stored `1e2`, `0x10` and `+5` as numbers, not
  dropped them. The ruling is plain digits everywhere, so the phone's new
  session screen now uses `parseRoundsFired` and refuses what the web refuses.
  A final with nothing shot is dropped (FS5), and a final with no scored main
  series is refused, `finalWithoutMain` (FS6).
- **R5 (#688, the web fält entry).** Fält series are now entered on the web as
  stations (`docs/specs/web-falt-entry-spec.md`), so C5's last sentence no
  longer holds: the discipline list is every discipline of the regulation for
  either kind, and back to Scored Series keeps the discipline, fält included.
  WK2 and WK3 are rewritten to that rule; a rounds-only fält session is still
  a rounds session.
