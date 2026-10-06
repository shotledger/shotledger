# Web series entry and the web write client — executable specification

> Old-coder SPEC for layer 2 of #301 (web write paths). Evidence report, once
> written: `docs/specs/web-series-entry-evidence.md`. Decision record: ADR 0019
> (web writes by pushing rows through `/sync/push`; written in the parallel
> layer-1 PR).
>
> **Approval status: approval relayed by the orchestrator session on
> 2026-10-06 ("approved your spec as is, C1–C9 unchanged"); not received
> first-hand from the maintainer.**

- **Tier: 3.** It writes to the account's server rows through the sync
  protocol. A wrong payload does not fail on the web: it fails on every phone
  that pulls it. A `null` in a `NOT NULL` column makes the phone's apply
  transaction roll back on every later cycle, so that phone's sync wedges until
  the row is fixed on the server.
- **Scope:** `shared/src/scoring/series-text.ts` (new),
  `shared/src/sync-client/{rows,session-entry,direct-push}.ts` (new),
  `shared/src/disciplines/` (two helpers moved out of the phone's new-session
  screen, unchanged in behaviour), `web/src/` (an Enter Series page, the push
  call in `api.ts`, `firearm_groups` in `WEB_TABLES`), app tests that apply
  web-built rows to the phone's real schema, one backend round-trip spec,
  `docs/manual/` EN + SV, `app/src/i18n/{en,sv}.json` (`web.entry.*`).
- **Not in scope:** anything that needs `session_tags` or `settings` to sync
  (the parallel layer-1 PR). This layer reads and writes only tables that sync
  today.

## 1. Settled inputs (maintainer, 2026-10-06; not re-asked)

1. The web app writes by pushing changed rows through the existing
   `/sync/push`, online only. No browser database, no outbox, the same per-row
   last-write-wins as a second phone (ADR 0019).
2. This layer must not depend on layer 1: only tables already in
   `SYNC_TABLE_NAMES`.
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

**C5. Edit and delete are deferred to a later layer.** The web has no sessions
list or session page yet (the "browse sessions" item on #277), so there is
nowhere to select a session to edit or delete. Building that page is larger
than this layer. Before Save, the whole entry is freely editable. After Save,
the session is edited or deleted on the phone, as today.

**C6. Where the profile-dependent defaults come from.** The phone prefills the
shooter class and ranks ISSF events from the shooter profile (birth year,
skill class, women's classes), filters disciplines to the enabled regulations,
and can switch the vapengrupp and klass pickers off (Optional Fields). All of
that lives in device-local settings, which do not sync in this layer. So the
web offers every regulation, ranks events against an empty profile, preselects
no klass, and always asks vapengrupp and klass for a competition (both may be
left empty, as on the phone). When layer 1's synced settings land, a later
change can prefill from them.

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
  (`resolveSeriesLength`). `series_length` is stored only in free format,
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

Feature: moved helpers (shared/src/disciplines/*.test.ts)
  Scenario: H1 defaultProgramFor: competition preselects the first program, training none
  Scenario: H2 derivedWeaponGroup: one group, else the one default-marked, else null

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
```

Browser checks (not automated; screenshots under `~/tmp/screens-301-web/`):
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
- **N6** No dependency on `session_tags` or `settings`.
- **N7** The phone's behaviour does not change: the moved helpers keep their
  tests, and `pnpm check` stays green.

## 6. Setup plan

- **Isolation:** worktree `~/tmp/sl-301-web`, branch `feat/web-series-entry`
  from `origin/main`. The main checkout is shared with other sessions.
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
