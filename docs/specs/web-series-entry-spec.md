# Web series entry and the web write client — executable specification

> Old-coder SPEC for layer 2 of #301 (web write paths). Evidence report, once
> written: `docs/specs/web-series-entry-evidence.md`. Decision record: ADR 0019
> (web writes by pushing rows through `/sync/push`; accepted, merged with
> layer 1 in #647).
>
> **Approval status: the maintainer approved first-hand on 2026-10-08:**
> C1–C3 and C7–C9 as written; C4 and C5 as deferrals, with follow-up issues
> #688 (fält entry), #689 (rounds-only and final series), #690 (tags on a new
> web session), #691 (photo upload from the web) and #692 (edit and delete a
> session on the web); **C6 changed** (prefill from the synced profile, see
> C6 and R26); R1–R25 approved, **R15 changed** to `Europe/Stockholm`.
>
> On the points raised after the rework (2026-10-08): R26 and R27 approved;
> the klass kept on an ISSF competition stays as the phone does it; ranking
> by the year the form opened in, as the phone does, is accepted.

- **Tier: 3.** It writes to the account's server rows through the sync
  protocol. A wrong payload does not fail on the web: it fails on every phone
  that pulls it. A `null` in a `NOT NULL` column makes the phone's apply
  transaction roll back on every later cycle, so that phone's sync wedges until
  the row is fixed on the server.
- **Scope:** `shared/src/scoring/series-text.ts` (new),
  `shared/src/sync-client/{rows,session-entry,direct-push,account-settings}.ts`
  (new), `shared/src/disciplines/` (helpers moved out of the phone's
  new-session screen, unchanged in behaviour; R3, R26), `web/src/` (an Enter
  Series page, the push call in `api.ts`, `firearm_groups` in `WEB_TABLES`),
  app tests that apply web-built rows to the phone's real schema, one backend
  round-trip spec, `docs/manual/` EN + SV, `app/src/i18n/{en,sv}.json`
  (`web.entry.*`).
- **Not in scope:** writing `session_tags` or `settings`, and reading
  `session_tags` (tags on a new web session are #690). The web reads the
  synced profile from `settings` to prefill the form (C6, as changed by the
  maintainer); it never writes a settings row (N6).

## 1. Settled inputs (maintainer, 2026-10-06; not re-asked)

1. The web app writes by pushing changed rows through the existing
   `/sync/push`, online only. No browser database, no outbox, the same per-row
   last-write-wins as a second phone (ADR 0019).
2. This layer must not depend on layer 1: only tables already in
   `SYNC_TABLE_NAMES`. (Layer 1, #647, has since merged; the maintainer's C6
   change of 2026-10-08 makes this layer read its `settings` rows.)
3. Keyboard entry: type `10 9 X 10 9`, Tab to the next series.

## 2. Key choices (for approval)

These are what the maintainer is asked to approve. Each is my recommendation.

**C1. The firearm's round counter moves with web-entered shots.** On the phone,
saving shots moves `firearms.round_count` and `rounds_since_maintenance` by the
session's volume, sighters included (`withSessionVolumeDelta`,
`sessionVolume`). A web session that did not would leave the counter behind,
and the web would be doing less than the phone does for the same act. So when a
firearm is chosen and the entry has N > 0 shots, the push also carries that
firearm's row with both counters plus N. To keep the overwrite window small,
the web pulls `firearms` again immediately before it builds the push. A phone
that edited the same firearm offline can still overwrite the web's increment,
or the web the phone's. That is the same race two phones already have
(ADR 0019's consequences).
_Alternative:_ leave the counter alone and say so in the manual. I do not
recommend it: it makes the round counter drift silently.

**C2. One user action is one push request, and retry resends the same
request.** A whole entry (session, series, shots, firearm) is one `/sync/push`,
which the Worker applies as a single D1 transaction (`applyPush`). So it lands
completely or not at all. When the response is lost (network error, 5xx), the
web cannot know which happened. It keeps the built request in memory and offers
**Retry**, which resends the identical request with the same `clientChangeId`s
and row ids. The server's idempotency table makes that safe: a request that had
landed answers `duplicate` and creates nothing twice. Nothing retries on its
own, and nothing is kept after the tab closes (no outbox, settled input 1).
Editing the form after a failure discards the held request, so the next Save
builds a fresh one.

**C3. Keyboard syntax.** Shots are separated by whitespace (space or several,
but not Tab, which moves to the next field). Case-insensitive.

- Integer mode: `0`–`10`, and `X` for the centrumtia (worth 10, inner ten). A
  plain `10` is an ordinary ten (Amendment A2).
- Decimal mode: `<ring>.<tenth>` with ring `0`–`10` and one tenth digit, for
  example `10.4` and `9.8`; `X.<tenth>` is a centrumtia with that tenth
  (`X.6` = 10.6, inner ten). A comma works as the decimal mark (`10,4`).
- Each token is translated into the phone keypad's own key presses and run
  through `pressKey` (`shared/src/scoring/entry.ts`), so the web accepts and
  stores exactly what the keypad does. No scoring value is restated.
- Anything else is refused, naming the token and its position. A comma in
  integer mode is refused with "separate shots with spaces".

**C4. What the web can create in this layer.** A session of kind `series` in
a **ring** discipline, with ordinary and sighter series. Not offered: fält
(`hits` scoring — its results are stations, not shots), rounds-only sessions,
final series, photos, tags. The form asks for the fields the phone's
new-session form asks for (§3.1).

**C5. Edit and delete are deferred to a later layer (#692).** The web now has
a read-only Sessions page (list and detail), so a session can be found there;
the deferral is about scope. Editing or deleting rewrites rows a phone may
have changed since the web pulled them, which needs its own design for that
race; this layer only ever writes new rows (and the firearm's counter, C1).
Before Save, the whole entry is freely editable. After Save, the session is
edited or deleted on the phone, as today.

**C6. Where the profile-dependent defaults come from (changed by the
maintainer, 2026-10-08).** The phone prefills the shooter class and ranks
ISSF events and klasser from the shooter profile (birth year, skill class,
women's classes), filters disciplines to the enabled regulations, and can
switch the vapengrupp and klass pickers off (Optional Fields). The profile
syncs since layer 1, so the web prefills from the account's synced profile
exactly as the phone does from its local one: it preselects the klass
(`defaultShooterClass`), lists the klasser with the shooter's own first
(`shooterClassesInOrder`) and ranks and preselects the ISSF event
(`eventsUnder`, `preferredEventId`), all judged in the year the form opened.
These are the phone's own functions, moved to `shared/` (R26). The profile is
read by `readAccountSettings`: an unset or unrecognised value reads as unset
(the phone's fallbacks), and an unset profile gives the earlier behaviour —
no klass preselected, every list in its own order. The enabled regulations
and the Optional Fields switches stay device-local and never sync, so the web
still offers every regulation and always asks vapengrupp and klass for a
competition (both may be left empty, as on the phone).

**C7. Dependency: `uuidv7` in `web/package.json`.** New rows need UUIDv7 ids
(implementation plan §2 lists the `uuidv7` package). The app already depends on
`uuidv7@1.2.1` and it is in the lockfile, so this adds the same pinned version
to one more workspace package; no new package enters the tree. The shared
builders take `newId` as a parameter (like the sync engine's `deps.newId`), so
`shared/` stays zod-only. `clientChangeId` uses the browser's
`crypto.randomUUID()`, which the protocol accepts (`z.uuid()`).
_Alternative:_ a hand-written UUIDv7 in `web/`. I do not recommend it: it forks
the library the app uses.

**C8. Two phone helpers move to `shared/`.** `defaultProgramFor` and
`derivedWeaponGroup` (now private to `app/src/app/session/new.tsx`) move into
`shared/src/disciplines/` as pure functions. `derivedWeaponGroup` now takes the
firearm's group rows instead of reading the database. The phone imports them;
its behaviour does not change. That way the web cannot drift from the phone
on which program a competition preselects or which vapengrupp training takes
from the gun.

**C9. Date and time.** The phone stamps `started_at` with "now". The web is for
entering past sessions, so it asks for a date and a time, both defaulting to
now, in the browser's time zone. `started_at` is stored as UTC ISO, as on the
phone.

## 3. Design

### 3.1 The form (`web/src/entry/`)

A new **Enter Series** page in the shell's menu (`#entry`), after Statistics.

- **Session fields, in the phone's order:** type (training / competition),
  regulation, discipline (ring disciplines only), program (free format or a
  program for the discipline, preselected as on the phone), date + time,
  name (defaults to `defaultSessionName`), location (free text, suggestions
  from `rankRecentLocations` over the pulled sessions). Competition only:
  level, championship, competition name, vapengrupp, klass, ISSF event. Then
  firearm, ammo lot, decimal scoring (only when `decimalAllowed`), series
  length (free format only).
- **Series rows:** one text field per series, labelled with its position, its
  live total and its inner-ten count. A fixed-format program lays out its
  skeleton (`buildProgramSkeleton`), sighters included. In free format, each
  row has a Sighter checkbox, available only while no other row is one (the
  phone's one-sighter-per-section rule). **Enter** in the last row adds a row,
  as does **Add Series**. Tab and Shift+Tab move between rows (natural DOM
  order).
- **Save** (also Ctrl/Cmd+Enter) builds and pushes. The page shows
  _Saving…_, then _Saved_ and clears the form, or the error with the form
  intact. While offline (`navigator.onLine` false, tracked by `online` and
  `offline` events), Save is disabled and the page says why.

### 3.2 Rows (`shared/src/sync-client/rows.ts`, pure)

`newSessionRow`, `newSeriesRow` and `newShotRow` return the **complete**
snake_case payload with every column of the app's table and the app's own
defaults (`createSession`, `addSeries`, `addShot`):
`kind: 'series'`, `series_entry_mode: 'ask'`, `is_total_override: 0`,
`is_inner_ten_decimal: 0`, every `external_*`, `photo_*`, `ten_count`,
`extra_rounds` and similar column `null`, `created_at = updated_at = now`,
`deleted_at: null`. `withRoundsAdded(pulledFirearm, n, now)` spreads the pulled
payload (so it keeps a column this build does not know) and sets both counters
plus `n` and `updated_at`.

### 3.3 Entry → changes (`shared/src/sync-client/session-entry.ts`, pure)

`buildSessionEntry(draft, context, deps)` → `{ ok: true, changes }` or
`{ ok: false, errors }`. `deps = { newId, newChangeId, now }`.
`context` = the pulled firearms and firearm groups. Rules:

- Scoring mode = `scoringModeFor(discipline, program, decimalChosen)`.
  Series length = `program.shotsPerSeries ?? chosen ?? discipline default`
  (the order of the app's `resolveSeriesLength`, which stays in `app/`).
  `series_length` is stored only in free format,
  `decimal_scoring` only where the toggle is shown — both as on the phone.
- Competition-only fields are `null` (`is_championship: 0`) on training.
  Training's vapengrupp comes from the firearm (`derivedWeaponGroup`), else
  the one chosen.
- Free format: blank non-sighter rows are dropped and positions stay 1..n
  without gaps. A blank sighter row is kept, as the phone keeps it. Fixed
  format: every skeleton entry becomes a series, even blank, as the phone
  pre-creates them. Rows past the skeleton are ordinary series.
- Shot positions 1..k within each series, in typed order.
- Changes come out in `APPLY_ORDER` (firearms, sessions, series, shots).
  Every change has a fresh `clientChangeId`, `deletedAt: null`,
  `updatedAt = now` and `rowId = payload.id`, and parses with
  `ClientChangeSchema`.

### 3.4 Push (`shared/src/sync-client/direct-push.ts`)

`pushChanges(transport, protocolVersion, changes)` → one of:

- `{ kind: 'saved' }`: one ack per sent change, each `applied` or
  `duplicate`;
- `{ kind: 'partlyRejected', rejected: [{ tableName, rowId, reason }] }`;
- `{ kind: 'failed', error }`, where `error` is a `SyncErrorKey` from
  `classifySyncError`: 401/403 `unauthenticated`, 409 `versionUnsupported`,
  413 `payloadTooLarge`, 5xx, 408, 429 and fetch rejections `network`,
  anything else `unknown`.

An ack set that does not match the sent `clientChangeId`s one to one is
`failed: unknown`. It is never read as saved.

### 3.5 What the page says, and keeps

| Outcome                  | Message (i18n `web.entry.*`)                                                        | Form                    |
| ------------------------ | ----------------------------------------------------------------------------------- | ----------------------- |
| saved                    | Saved; the logbook refreshes from the server                                        | cleared                 |
| saved, refresh failed    | Saved; reload to see it                                                             | cleared                 |
| partlyRejected (firearm) | Saved, but the firearm was deleted on another device, so its counter did not move   | cleared                 |
| network                  | Could not reach the server: **Retry**                                               | kept, request held (C2) |
| unauthenticated          | Signed out: sign in again here (inline form), then **Retry**                        | kept, request held      |
| versionUnsupported       | This page is out of date. Copy your series, then reload                             | kept                    |
| payloadTooLarge, unknown | Could not save                                                                      | kept                    |
| offline (before Save)    | You are offline. Saving needs a connection                                          | kept; Save disabled     |
| validation error         | Per field or row: unparsable token, too many shots, a second sighter, text too long | kept; nothing sent      |

After `saved` and `partlyRejected`, the web pulls the account again from
cursor 0 (`loadAccount`), so every page shows server truth.

## 4. Scenarios

Every scenario maps 1:1 to a named test (name = id + title).

```gherkin
Feature: series text (shared/src/scoring/series-text.test.ts)
  Scenario: T1 integer series
    When "10 9 X 10 9" is parsed in integer mode
    Then shots are [100,-],[90,-],[100,inner],[100,-],[90,-]
  Scenario: T2 whitespace and case
    Then "  10   9\tx " parses to [100,-],[90,-],[100,inner] and "" to []
  Scenario: T3 integer refusals
    Then each of "11", "-1", "9.5", "X10", "a", "10,9", "010" is refused,
         naming the token and its 1-based position
  Scenario: T4 decimal series
    When "10.4 9,8 X.6 0.0" is parsed in decimal mode
    Then shots are [104,-],[98,-],[106,inner],[0,-]
  Scenario: T5 decimal refusals
    Then each of "10", "X", "10.10", "11.0", "9.", ".5", "X10.4" is refused
  Scenario: T6 property: format then parse is the identity
    For any valid shot list in either mode (fast-check),
    parse(format(shots)) = shots
  Scenario: T7 property: parse agrees with the keypad
    For any token list, parse succeeds iff feeding the tokens' keys through
    pressKey commits exactly one shot per token, and the shots are equal

Feature: rows (shared/src/sync-client/rows.test.ts)
  Scenario: R1 a session row carries every column with the app's defaults
  Scenario: R2 a series row carries every column with the app's defaults
  Scenario: R3 a shot row: is_inner_ten_decimal 0; value outside 0..109 throws RangeError
  Scenario: R4 withRoundsAdded adds n to both counters, sets updated_at, keeps unknown keys
  Scenario: R5 withRoundsAdded with n = 0 returns null (no firearm row pushed)

Feature: rows on the phone's schema (app/src/db/queries/web-rows.test.ts, vitest + better-sqlite3)
  Scenario: A1 column parity
    Then the keys of each builder's payload equal the column names of
         sessions, series and shots in app/src/db/schema.ts
  Scenario: A2 a web-built entry applies on the phone
    Given a firearm with round_count 100 in the phone's database
    When a 2-series, 10-shot entry built by buildSessionEntry is applied with applyChangesSync
    Then getSession, listSeriesForSession and listShotsForSeries return it,
         the session total equals the typed total,
         and the firearm's round_count is 110
  Scenario: A3 nothing applied is re-queued (the outbox stays empty after apply)

Feature: entry → changes (shared/src/sync-client/session-entry.test.ts)
  Scenario: E1 free-format training: 1 session, 2 series, 10 shots, in APPLY_ORDER
  Scenario: E2 blank free-format rows are dropped and positions stay contiguous; a blank sighter is kept
  Scenario: E3 a fixed-format program creates every skeleton series with its sighter flags, blank ones included
  Scenario: E4 rows past the skeleton become ordinary series
  Scenario: E5 a row with more shots than the series length is refused (row, max), nothing built
  Scenario: E6 an unparsable row is refused with its row and token, nothing built
  Scenario: E7 a second sighter row in free format is refused
  Scenario: E8 a hits discipline is refused
  Scenario: E9 scoring mode and series length follow the program, then the choice, then the discipline
  Scenario: E10 training nulls the competition fields and takes the vapengrupp from the gun
  Scenario: E11 a firearm and N shots (sighters included) push the firearm with +N; no firearm or 0 shots push none
  Scenario: E12 a text field over TEXT_LIMITS is refused, naming the field
  Scenario: E13 every change parses with ClientChangeSchema, ids fresh, rowId = payload.id, ≤ PUSH_BATCH_MAX, each payload ≤ MAX_PAYLOAD_BYTES
  Scenario: E14 a firearm that is not among the pulled rows is refused
  Scenario: E15 a startedAt that is not a UTC timestamp in toISOString's shape is refused (R28)
    Then each of "", "garbage", "2026-13-09T08:15:00.000Z", "2026-02-30T08:15:00.000Z",
         "2026-10-09", "2026-10-09T08:15:00Z", "2026-10-09T10:15:00.000+02:00" and
         "+010000-01-01T00:00:00.000Z" is refused with invalidStartedAt, nothing built,
         collected with the other errors
    And "2026-10-09T08:15:00.000Z" is stored as started_at unchanged

Feature: moved helpers (shared/src/disciplines/*.test.ts)
  Scenario: H1 defaultProgramFor: competition preselects the first program, training none
  Scenario: H2 derivedWeaponGroup: one group, else the one default-marked, else null
  Scenario: H4 eventsUnder / preferredEventId: ranked for the shooter under the regelverk
            logged (SvSF adds its national classes), never filtered; none for SPSF; judged
            in the year given
  Scenario: H5 shooterClassesInOrder: every klass of the discipline, the shooter's own first,
            narrowed by the vapengrupp; none for a discipline without klasser
  Scenario: O1 SKILL_CLASSES is 1, 2, 3 (eligibility.test.ts)
  Scenario: O3 PROFILE_SELECTIONS is none, then every registered profile (profile-registry.test.ts)

Feature: the synced profile (shared/src/sync-client/account-settings.test.ts)
  Scenario: P1 each key's JSON text is decoded
  Scenario: P2 absent rows read as unset: null, null, false, null, null
  Scenario: P3 unparsable, wrong-typed and unknown values read as unset
  Scenario: P4 a row whose payload id is not its key is ignored

Feature: push outcome (shared/src/sync-client/direct-push.test.ts)
  Scenario: D1 all applied → saved
  Scenario: D2 duplicate acks → saved
  Scenario: D3 a rejected ack → partlyRejected naming the table and row
  Scenario: D4 401/403, 409, 413, 500, 400 and a rejected fetch map to their error keys
  Scenario: D5 a missing, extra or unknown ack → failed: unknown
  Scenario: D6 the request sent is exactly { protocolVersion, changes } in the given order

Feature: round trip (backend/test/web-write.spec.ts, Workers pool, real D1)
  Scenario: W1 a web entry pushed through the real HTTP transport is pulled by a second device
    Then device B's rows equal the pushed payloads for the session, series, shots and firearm
  Scenario: W2 resending the same request answers duplicate for every change and adds no rows
  Scenario: W3 firearm tombstoned by device B first → its ack is rejected, the rest applied
  Scenario: W4 a revoked session token → unauthenticated, and nothing is stored

Feature: the page model (web/src/entry/*.test.ts, the web package's pure-module style)
  Scenario: U1 offline disables Save and names the reason
  Scenario: U2 a failed save keeps the draft and holds the request; Retry resends the identical request
  Scenario: U3 editing the draft after a failure drops the held request
  Scenario: U4 a save refreshes the logbook and clears the draft; a failed refresh says "reload"
  Scenario: U5 the discipline options exclude hits disciplines
  Scenario: U6 Enter in the last free-format row adds a row; in a fixed-format skeleton it does not

Feature: prefill from the synced profile (web/src/entry/model.test.ts, C6)
  Scenario: F1 a set profile preselects the klass, ranks the klasser and the ISSF events
    Given a shooter born 1964, klass 2, entering the women's classes
    Then the klass is 2, the klasser start 2, Dam2, VetY (2, 1 under vapengrupp A),
         the klass survives a type and a discipline change,
         and ISSF air pistol preselects women:open
    And a shooter born 2010 gets Jun in 2026 and nothing in 2060
  Scenario: F2 an unset profile preselects no klass and keeps every list in its own order
  Scenario: F3 unrecognised synced values prefill nothing, as if unset
```

Browser checks (not automated; screenshots in the session scratchpad, never
in the repo):
type a 6-series precision competition by keyboard only, save, see it in
Statistics; save while offline (DevTools); save after revoking the session
from another tab.

## 5. Must NOT

- **N1** No shooting data in browser storage: no `localStorage`,
  `sessionStorage` or IndexedDB in `web/src/entry/`. A test greps the
  module sources and fails when one appears.
- **N2** No outbox and no automatic retry: a push happens only on Save or
  Retry (U2, D6).
- **N3** No new endpoint, no protocol change, no forked schema: the web sends
  `PushRequestSchema`-valid bodies built from `ClientChangeSchema` (E13, W1).
- **N4** No `NOT NULL` column is ever pushed as `null` (A1, A2).
- **N5** No row other than the new session, its series and shots, and the
  chosen firearm is written (E1, E11).
- **N6** No dependency on `session_tags`, and `settings` is only read: the
  synced profile, through `readAccountSettings` (C6). No settings row is ever
  written (E1, N5).
- **N7** The phone's behaviour does not change: the moved helpers keep their
  tests, and `pnpm check` stays green.

## 6. Setup plan

- **Isolation:** worktree `~/tmp/sl-301-entry`, branch
  `feat/web-series-entry-impl` from `origin/main` (it took over from a stalled
  session's `~/tmp/sl-301-web`, which never pushed). The main checkout is shared with other sessions.
- **Git:** this spec is committed once approved; then one checkpoint commit per
  green layer (series text, rows, entry, push, web page, docs). All are
  DCO-signed Conventional Commits with explicit paths.
- **Gauntlet:** existing. `pnpm coverage` (100% on the `stryker.config.json`
  `mutate` globs, which already cover `shared/src/scoring/*.ts`,
  `shared/src/sync-client/*.ts` and `shared/src/disciplines/*.ts`),
  `pnpm mutation` (Stryker), fast-check (already a dev dependency) for T6/T7,
  the backend Workers pool for W1–W4, and `pnpm check`. No new gauntlet
  files.
- **New dependencies:** `uuidv7@1.2.1` in `web/package.json` only (C7). It is
  already in the lockfile, so the license list does not change. I will
  re-run the generator to confirm.

## 7. Revisions

Appended by the session that took the work over (2026-10-07). None loosens a
constraint; each needs the maintainer's OK, since the approval above was
relayed rather than first-hand.

- **R1 (text only).** "Not in scope", C6, the ADR 0019 pointer, the
  isolation line and the screenshot location are made true for current main:
  layer 1 (#647) has merged and `session_tags` and `settings` sync. As
  first written this layer read neither, ranking events against an empty
  profile; the maintainer's C6 change (R26) has it read the synced profile.
- **R2.** `resolveSeriesLength` lives in `app/`, not `shared/`. The builder
  applies the same order (program, choice, discipline) itself; E9 pins it.
- **R3 (C8 widened).** A third pure helper moves with the two:
  `firstDisciplineFor`, the discipline a regulation lands on, so the web's
  regulation picker cannot drift either. Scenario **H3** added.
- **R4 (E14 widened).** An ammo lot that is not among the pulled rows is
  refused too (`unknownAmmoLot`), as the firearm is: the phone's
  `sessions.ammo_lot_id` is a foreign key, and an id it has never seen fails
  its apply transaction.
- **R5 (D2 refined).** A `duplicate` ack that carries a `reason` replays an
  earlier rejection, so it reads as `partlyRejected`, not `saved`. A Retry
  after a lost response whose firearm row was rejected reports the same thing
  the first answer would have.
- **R6 (E13 made enforceable).** An entry that would need more than
  `PUSH_BATCH_MAX` changes is refused (`tooManyChanges`) rather than split,
  since C2 makes one Save one request.
- **R7 (T7 made precise).** The oracle is written independently of the
  parser: a token is valid iff it is the keypad spelling of one shot (one
  value key; or a value key, `.`/`,`, a digit key), and every accepted token
  equals what `pressKey` commits for those keys.
- **R8.** A program with no `structure` (Precision, Magnumprecision) lays out
  no skeleton, so its rows behave as free format: sighter box, one sighter,
  blank rows dropped. This is what the phone's `addSeries` guard does. Blank
  rows typed past a fixed skeleton are dropped as well.
- **R9.** The draft carries `defaultName`; a blank name falls back to it, as
  the phone's `name.trim() || defaultName` does.
- **R10 (§3.5, signed out).** Before building, Save pulls the firearms (C1).
  If that pull answers 401, nothing was built or sent, so nothing is held; the
  page says to sign in and save again. If the push itself answers 401, the
  request is held and **Retry** is offered, as specified. A failed pull of any
  other kind reports the push error keys, with nothing held. The inline
  sign-in form sits outside the entry form (forms cannot nest).
- **R11 (W4).** "Revoked" is exercised by signing the web token out, which
  revokes that session server side.
- **R12 (A2 harness).** A phone firearm payload carries `is_own` as a
  boolean, which expo-sqlite binds as 1/0 and better-sqlite3 refuses. A2 binds
  it the device's way before applying; the web's own rows carry no booleans.

Added after an independent review of #669 (2026-10-07):

- **R13 (C2 closed a hole).** After a lost response the Save button and
  every submit (Enter in a field, Ctrl/Cmd+Enter) built a new request with
  fresh ids, which could store the session twice and move the firearm counter
  twice. Now, while a request is held, the one action button reads **Retry**
  and every submit resends the held request (`submitRequest`); only an edit
  drops it (U3). The network message names Retry. Scenario **U7** added.
- **R14 (new).** A held request is bound to the user id it was built for.
  Each Save first reads the signed-in user: another user → `accountChanged`,
  the request is dropped and nothing is sent; still signed out, or the server
  unreachable → the request stays held. A fresh Save while signed out builds
  nothing (this replaces how R10 detected it). Scenario **U8** added.
- **R15 (changed by the maintainer, 2026-10-08).** vitest runs in
  `Europe/Stockholm`, the users' zone, with daylight saving, pinned in
  `vitest.config.ts` by #694 (merged), because in UTC — what CI runs — local
  time and UTC agree and a local-time bug passes unseen; this layer's own pin
  is gone.
  `started-at.test.ts` asserts the offset and the conversion for a winter
  date (CET, UTC+1) and a summer one (CEST, UTC+2). The whole suite passes
  under it. (The first draft pinned `America/Sao_Paulo`, UTC−3 with no DST.)
- **R16 (gauntlet widened).** `web/src/entry/*.ts` (the page model and the
  save controller) join the Stryker `mutate` list, and so the 100% coverage
  gate. To make that honest: events are ranked for the current year, as on
  the phone (with an empty profile the year changes nothing), and the first
  ring discipline applies `firstDisciplineFor`'s rule itself over ring
  disciplines only.
- **R17.** A row error names the row as the page labels it (“Sighter” or
  “Series N”), not always “Series N”. The manual no longer says Enter adds a
  row in a fixed format, nor that a session is never saved twice.

Added after the full PR review of #669 (maintainer: fix all findings):

- **R18 (no wedge).** A build that throws (for example `crypto.randomUUID`
  missing on a non-secure origin) ends the save as `failed: unknown` with
  nothing held, since nothing was sent; the page also catches a rejected save.
  Scenario **U10**.
- **R19 (C2 widened).** A 2xx answer whose acks do not match the sent changes
  (D5) now also says `unconfirmed`: the server did process the push, so the
  page holds the request for Retry, with its own message. Scenario **U9**; D5
  asserts the flag.
- **R20.** `currentUser()` throws a `network` error for a 5xx, 408 or 429 from
  get-session instead of reading as signed out; a refused session still reads
  as null. Tested in `shared/src/sync-client/http/current-user.test.ts`. The
  phone's caller catches and behaves as before.
- **R21 (C2 refined).** Enter and Add Series append blank rows, which the
  builder drops, so they keep a held request (`sendsTheSame`). Any other edit
  still drops it (U3). Scenario **U12**.
- **R22 (shared, for every writing page).** The inline sign-in is one shared
  component (`web/src/sign-in-again.tsx`). App compares the user who signed in
  with the one the logbook was loaded for (`web/src/reauth.ts`): the same user
  only clears the page's signed-out notice; anyone else sends App through its
  normal loading path (tables and email fetched again) and remounts every page
  under a new generation, dropping its state. So a Save after signing in as
  another account builds from that account's tables, never the old one's.
  R14's check stays as the second line. `reauth.ts` joins the gates.
- **R23.** The form is disabled while a save is in flight, so what is shown is
  what was sent.
- **R24 (documented, ADR 0019).** The firearm row carries the browser clock in
  `updated_at`. Server order decides the winner, not that timestamp; the cost
  is the overwrite race with a phone between pull and push.
- **R25.** `submitRequest` stays as the seam U7 tests the page's submit wiring
  through. Not done, by choice: reading a non-firearm rejection as a failure
  (only a tombstoned row can be rejected and every other row is new, so it is
  unreachable, and it would say "could not save" over a stored session); and
  capping the chosen series length (the phone accepts the same values).

Added after the maintainer's first-hand review (2026-10-08):

- **R26 (C6 changed).** The web prefills from the synced profile (C6). The
  phone's private `eventsUnder` and `preferredEventId` and its inline klass
  ordering move to `shared/src/disciplines/session-defaults.ts` (the last as
  `shooterClassesInOrder`), taking the year as a parameter; the phone calls
  them with this year, so its behaviour does not change (N7). The reader
  `readAccountSettings` (with `SKILL_CLASSES` and `PROFILE_SELECTIONS`) is the
  read half of the web settings page's module (#672), moved down to
  `shared/src/sync-client/account-settings.ts` so that page reuses it.
  `EntryForm` carries the profile and the year it opened in
  (`eligibilityYear`), so the model stays pure; R16's "current year" is that
  year. As on the phone, the preselected klass is kept when the type or the
  discipline changes. That also means a competition under a discipline with
  no klass picker (ISSF) stores the preselected klass beside its event; the
  phone does the same today, although its form's comment says a session
  carries one or the other. Mirrored; the maintainer ruled to keep it as the
  phone does (2026-10-08).
  Scenarios **H4**, **H5**, **O1**, **O3**, **P1–P4**, **F1–F3** added.
- **R27 (rebase).** Rebased onto main after the read-only Sessions page and
  target photos (#661, #665): the menu reads Sessions, Statistics, Enter
  Series, then Account; `#entry` joins `web/src/shell/route.ts`; a refresh
  after a save carries the photo picks over to the re-pulled tables, which
  would otherwise drop them.

Added after the maintainer graded independent verification round 2
(2026-10-09):

- **R28 (new, the maintainer: add a guard now).** `buildSessionEntry` refuses
  a `startedAt` that is not a UTC timestamp in the exact shape
  `Date.prototype.toISOString()` writes for a four-digit year,
  `YYYY-MM-DDTHH:mm:ss.sssZ` (24 characters, for example
  `2026-10-09T08:15:00.000Z`), checked by round trip:
  `new Date(s).toISOString() === s`. A new `EntryError`
  `{ kind: 'invalidStartedAt' }`, collected like `unknownFirearm`; the page
  shows it as `web.entry.errorDateTime`. Before this only the page kept an
  empty value out (Save disabled, `runSave` returns early), while
  `toDraft` passes `''` for an incomplete date. The web's `startedAtIso` and
  the phone's new-session form both write `new Date().toISOString()`, so both
  pass. Refused, by decision: an offset other than `Z` (the web converts to
  UTC before building; a value with an offset means a caller skipped that,
  and storing it would break the string ordering every `started_at`
  comparison relies on), whole seconds without milliseconds, a date alone,
  an impossible date that `Date` rolls over (`2026-02-30`), and the six-digit
  extended years `toISOString` writes outside 0000–9999 (they sort wrongly as
  strings, and the form's date field cannot produce them). Scenario **E15**.
  The accepted form is the builder's decision under the maintainer's
  instruction; the guard is unverified until verification round 3, which the
  maintainer approved beyond the cap of two.
