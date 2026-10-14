# Web session edit and delete — executable specification

> Amended by #727 PR B (`docs/specs/maintenance-counter-727-spec.md`):
> `firearms.rounds_since_maintenance` was dropped. Every move named here now
> moves `round_count` only; rounds since maintenance is derived from the
> maintenance log.

> Old-coder SPEC for #692: edit and delete a session on the web. It builds on
> the web write client of #669 (`docs/specs/web-series-entry-spec.md`, not
> merged when this was written) and reads the bulk edit spec of #674
> (`docs/specs/web-bulk-edit-spec.md` on `feat/web-bulk-edit`) for its counter
> and refusal rulings. Evidence report, once written:
> `docs/specs/web-session-edit-evidence.md`. Decision record: ADR 0019 (web
> writes push whole rows through `/sync/push`).
>
> **Approval status: approved.** The maintainer approved key choices E1–E12
> for merge on 2026-10-12 (PR #710), taking the recommended option on each of
> that PR's four questions. Revisions made while implementing are in §9.
>
> **Revision 2 (§10, #769): approved** by the maintainer on 2026-10-13: "do
> as the phone", every §10.8 question answered with the phone's behaviour
> (§10.10). It lifts E11's cuts for fält stations and rounds-only sessions;
> E1–E12 and §9 are unchanged by it.

- **Tier: 3.** It rewrites and tombstones synced rows a phone may have
  changed since the web pulled them, and moves a firearm's absolute round
  counters. A wrong payload does not fail on the web: it fails, or silently
  corrupts, on every phone that pulls it. A shot set rewritten from a stale
  view doubles a series' shots on every device; a tombstone is terminal for
  its id and cannot be undone by any later push.
- **Scope:** `shared/src/sync-client/session-edit.ts` (new, pure: the edit
  and delete builders), `web/src/edit/` (new: the edit form, its pure model
  and its save state, reusing #669's `web/src/entry/save.ts` pattern), an
  Edit and a Delete action on the session detail in `web/src/sessions/`, one
  route (`#sessions/<id>/edit`) in `web/src/shell/route.ts`, `web.edit.*`
  strings in `app/src/i18n/{en,sv}.json`, one phone-schema test
  (`app/src/db/queries/web-edit.test.ts`), one backend round-trip spec
  (`backend/test/web-edit.spec.ts`), `docs/manual/` EN + SV (the
  "use the phone" line in `guides/entering-series-on-the-web.md` and its
  Swedish twin goes).
- **Not in scope:** see E11.

## 1. Settled inputs (not re-asked)

1. ADR 0019: the web pushes whole rows through `/sync/push`, online only; no
   browser database, no outbox; per-row last-write-wins by server order, as a
   second phone. "A `rejected` ack (`tombstoned`) means the row was deleted on
   another device; the web re-pulls rather than retrying."
2. #669 C1: the firearm's round counter moves with web-written shots, by the
   phone's rule (`sessionVolume`, sighters included), both counters,
   floored at 0.
3. #669 C2 and R13/R14/R22: one user action is one push; while a request is
   held after a lost response, the one action button reads **Retry** and
   every submit resends the identical request; a held request is bound to the
   user id it was built for (`accountChanged` otherwise); signing in as
   another account remounts the page.
4. #669 C3 and R28: the series text syntax (`parseSeriesText`,
   `formatSeriesText`) and the start-time guard (`invalidStartedAt`: only a
   `toISOString`-shaped UTC timestamp is stored).
5. #674 B4 and B5: rows are rebuilt from a fresh pull before the push; a
   session no longer live after that pull is not written.
6. #674 R25 (maintainer's ruling, 2026-10-08): **no automatic counter
   correction.** When the server refuses a row whose counter move already
   landed, the web writes nothing more and names the firearm to check with
   Adjust Round Count on the phone.
7. Hard rule 8: no compatibility path; the protocol version does not change.

## 2. Key choices (for approval)

Each is my recommendation; alternatives are named where a real one exists.

**E1. The web edits what the phone's edit screens edit, through the same
functions.** Every web edit maps to one phone function, so the result on every
device equals what the phone would have written, and the app test (P1–P6)
proves it by running that function on a twin database and comparing rows:

| Web edit                          | Phone function                           | Columns / rows written                                               |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| Session fields                    | `updateSession` (edit screen's `onSave`) | the `sessions` row (E2's columns, `updated_at`)                      |
| Change firearm                    | `updateSession(…, { firearmId })`        | as above, plus both firearms' counters (E4)                          |
| Re-enter a series' shots          | `saveSeriesShots` → `replaceSeriesShots` | a tombstone per live shot, new shot rows at 1..k (E3)                |
| Add a series                      | `addSeries` + `saveSeriesShots`          | a new `series` row and its shots                                     |
| Mark / unmark a series as sighter | `setSeriesSighter`                       | the `series` row's `is_sighter`, `updated_at`                        |
| Delete a series                   | `deleteSeriesAndShots`                   | tombstones for the series and its live shots                         |
| Delete the session                | `deleteSessionAndSeries`                 | tombstones for the session, its series, shots and fält stations (E5) |

**E2. Editable session fields are the phone edit screen's, minus what this
layer cuts.** Name (blank falls back to the current name, as
`name.trim() || session.name`), date and time (`started_at`, under #669's R28
guard), location and notes (trimmed, blank → `null`), and for a competition:
competition name, level, championship, vapengrupp, klass, ISSF event. Then
firearm and ammo lot (`unknownFirearm` / `unknownAmmoLot` when not live in the
fresh pull, as #669 E14 and R4). Text lengths are `TEXT_LIMITS.sessions`.
**Not editable, by the phone's own rule:** `type`, `kind`, `discipline_id`
(immutable, `UpdateSessionInput` excludes them), `decimal_scoring` and
`series_length` (fixed at creation). **Not editable in this layer (E11):**
`program_id` (the phone allows it only while nothing is scored,
`changeMatchFormat`), `series_entry_mode` (a phone input preference), the
official standard medal and placement, `extra_rounds`, tags.
Every written session row is the freshly pulled payload spread, with only
the changed columns and `updated_at` replaced, so a column this build does not
know survives (#674 B4).

**E3. Shots are edited a whole series at a time, the phone's way.** The form
shows each live series of the main section as one text field in the session's
scoring mode (`formatSeriesText`; decimal when `decimal_scoring` is 1). A
series whose parsed shots differ from its live shots (value, inner ten or
count) is rewritten as `replaceSeriesShots` does: every live shot of the
series is tombstoned and the new shots are written as new rows (UUIDv7) at
positions 1..k. A series whose text parses to its current shots writes
nothing. More shots than the session's series length, an unparsable token, a
second sighter in a free-format section, or a series past a fixed program's
skeleton marked sighter are refused as in #669 (E5–E7, R8).
_Alternative:_ update shot rows in place by position (`updateShot`). Not
recommended: the phone never edits a shot in place from the keypad, and
mixing the two shapes would make the phone-parity test (P3) compare two
different mechanisms.

**E4. The firearm counters move by the difference, once per firearm.** The
builder computes the session's volume before (`V_before`, from the freshly
pulled rows, by `sessionVolume` as the phone's `sessionVolumes` does: every
live series, sighters included, total-only series by their stored count,
extra rounds, six per live fält station) and after the edit (`V_after`, from
the rows as they will be). Then:

- same firearm `F` before and after: `F` moves by `V_after − V_before`;
- firearm changed from `A` to `B`: `A` moves by `−V_before` and `B` by
  `+V_after`;
- `None` on either side moves nothing on that side; a firearm that is not live
  in the pull is not written (the phone's `applyRoundCountDelta` finds no
  row); a move of 0 writes no firearm row.

Both counters (`round_count`, `rounds_since_maintenance`) move, each floored
at 0, from the pulled firearm payload spread (#669's `withRoundsAdded`
generalized to a signed delta). Why one move per firearm is the phone's
result: on the phone a firearm change and a shot edit are two saves in either
order; for `A` the phone ends at `max(0, max(0, c + V_after − V_before) −
V_after) = max(0, c − V_before)`, and for `B` at
`max(0, max(0, n + V_before) + V_after − V_before) = max(0, n + V_after)` —
the same as one floored move. Property K10 pins that equality. With the same
firearm, several series edited in one Save are one net move; the phone saves
them one by one and floors each, so the two differ only when a floor bites,
i.e. when the counter is already below the rounds being removed (a drifted
counter). Accepted and stated in the manual.

**E5. Delete is the phone's delete: tombstones, counter moved back.** Delete
asks for confirmation (the phone's swipe asks too), then pushes, from a fresh
pull: a tombstone (`payload: null`, `deletedAt = updatedAt = now`) for every
live shot of every live series, every live series, every live fält station,
and the session; and the session's firearm with both counters moved by
`−V_before`, floored at 0, when the firearm is live and `V_before > 0`.
`session_tags` links are left as they are, as `deleteSessionAndSeries` leaves
them (readers list tags per live session, so a link to a deleted one is not
shown).
_Alternative:_ also tombstone the session's tag links. Not recommended: it is
tidier on disk but differs from the phone, and P5's parity test would then
compare two different deletes.
Delete works for every session kind the Sessions page lists — series, rounds
and fält — since it only tombstones and moves the counter; editing is
narrower (E11).

**E6. Conflict with a phone edit: re-pull, refuse a stale form, then last
write wins.** The form is filled from the rows pulled when it opened. Save and
Delete first pull `sessions`, `series`, `shots`, `falt_stations`, `firearms`,
`ammo_lots` and `firearm_groups` again, then compare the rows the action
touches with the ones the form was built from — the session row, and for
every series the form edits or deletes, that series row and its set of live
shot ids:

- unchanged → build from the fresh rows and push;
- changed (another device edited them meanwhile) → refuse with **"This
  session was changed on another device since you opened it"**, nothing sent,
  and offer **Reload** (refill the form from the fresh rows, dropping the
  user's unsaved edits after showing them for copying);
- the session no longer live → "This session was deleted on another device",
  nothing sent.

Delete touches every row of the session (R10): the session row, every live
series (its row and its set of live shot ids, a series added or removed
meanwhile included) and every live fält station. Any of them changed →
refused as stale, nothing sent, and **Reload** re-pulls the page, so the
confirmation is asked again with the fresh rounds.

Rows the action does not touch (a series the user did not change, a series a
phone added meanwhile) do not block the save and are left as they are.
What remains is the same per-row last-write-wins as two phones, over the
window from the fresh pull to the push — and, after a lost response, to the
Retry (#674 R10). In that window a phone that re-enters the same series
leaves both its shots and the web's live, i.e. a doubled series; the same
happens between two phones today. Stated in the manual and the known limits.
_Alternative:_ no stale check, plain last-write-wins from the fresh pull, as
bulk edit (#674 B4). Not recommended here: a single-session form is held open
for minutes while a shooter types, so the window from opening to Save is long,
and without the check a phone's re-entered series would be rewritten from what
the web showed before it, silently.

**E7. One action is one push; over 500 changes is refused, not split.** As
#669 C2 and #674 B3. An edit or delete needing more than `PUSH_BATCH_MAX`
(500) changes is refused before anything is sent (`tooManyChanges`, naming
the number). A session large enough to hit it (500 shots) is deleted or
edited on the phone.

**E8. A refused row: say which counter to check, correct nothing.** The
fresh pull and E6 leave only the seconds between pull and push (or the Retry
window) for a phone to delete something the push touches. When the acks
reject any change (`tombstoned`):

- the edit is reported as **saved in part**; the page refreshes from the
  server;
- when the push moved a firearm's counter and the session row or a series row
  it was moved for was refused, the page names that firearm (and, for a
  firearm change, both) to check with **Adjust Round Count** on the phone,
  as #674 R25 rules;
- nothing is pushed again on its own. Fresh shot rows under a refused
  (deleted) series do land on the server, as live children of a deleted
  parent; every reader hides them (they join live series), as they hide a
  phone's.

**E9. What the page says, and keeps** (`web.edit.*`, following #669 §3.5):

| Outcome                     | Message                                                      | Form                           |
| --------------------------- | ------------------------------------------------------------ | ------------------------------ |
| saved                       | Saved; back to the session detail, refreshed from the server | closed                         |
| deleted                     | Deleted; back to the Sessions list, refreshed                | closed                         |
| saved in part               | … but some changes were refused (deleted on another device)¹ | closed                         |
| stale (E6)                  | Changed on another device since you opened it: **Reload**    | kept; nothing sent             |
| stale delete (E6, R10)      | Changed on another device, nothing deleted: **Reload**       | detail kept; nothing sent      |
| gone (E6)                   | Deleted on another device                                    | closed; nothing sent           |
| nothing changed             | No changes to save                                           | kept; nothing sent             |
| network                     | Could not reach the server: **Retry**                        | kept, request held             |
| unauthenticated             | Signed out: sign in again (inline), then **Retry**           | kept, request held             |
| accountChanged              | Signed in as another account; the change was not sent        | page remounts (#669 R22)       |
| versionUnsupported, unknown | This page is out of date / Could not save                    | kept                           |
| offline                     | You are offline. Saving needs a connection                   | kept; Save and Delete disabled |
| validation error            | per field or series (as #669)                                | kept; nothing sent             |

¹ With the firearm(s) to check with Adjust Round Count (E8), when one moved.

**E10. Photos are never touched.** A series' `photo_uri` and
`photo_geometry` are carried over unchanged in every rewritten series row
(the spread), and Delete leaves them in the tombstoned rows; the web never
calls `DELETE /photos/<id>`, as the phone's delete does not. A re-entered
photo-scored series keeps its photo; its shot marks (`shot_marks`, local to
the phone and never synced) still point at the tombstoned shots and stop
drawing, exactly as when the phone re-enters that series by keypad. Uploading
or removing a photo from the web is #691.

**E11. Scope cuts (each stays editable on the phone).**

- **Fält stations** are not edited on the web (no station entry exists on the
  web, #688). A fält session gets session-field edits and Delete only.
- **Rounds-only sessions** and **extra rounds**: session fields and Delete
  only; `extra_rounds` is not editable (#689 owns rounds-only entry).
- **Final series** (`is_final = 1`) and **total-only series**
  (`is_total_override = 1`, Webshooter imports) are shown read-only; they
  still count in `V_before` and `V_after` (E4). Adding a series adds to the
  main section only.
- **Match format** (`program_id`), **series reorder** and **tags** (bulk
  edit's Add/Remove Tag covers one session; #690 covers a new session's tags).
- **Undo** of a delete: a tombstone is terminal; the confirmation is the only
  guard, as on the phone.

**E12. No new dependency.** `uuidv7` (a web dependency since #669) and
`crypto.randomUUID()`.

## 3. Design

### 3.1 Builders (`shared/src/sync-client/session-edit.ts`, pure)

```ts
interface SessionEditDraft {
  sessionId: string;
  fields: Partial<EditableSessionFields>; // only what the user changed
  series: SeriesEditDraft[]; // { id | null (new), text, isSighter, deleted }
}

buildSessionEdit(draft, opened, fresh, deps) →
  { ok: true; changes; moved: FirearmMove[] }
  | { ok: false; errors: EditError[] }   // includes { kind: 'stale' } and { kind: 'gone' }

buildSessionDelete(opened, fresh, deps) →   // opened since R10
  { ok: true; changes; moved: FirearmMove[] } | { ok: false; errors: EditError[] }
```

`opened` is the snapshot the form was filled from (session row, and per
series its row and live shot ids); `fresh` the re-pulled tables, payloads as
the wire carries them. `deps = { newId, newChangeId, now }` as #669's
`EntryDeps`. Errors: `stale`, `gone`, `nothingToChange`, `invalidStartedAt`,
`tooLong(field)`, `unknownFirearm`, `unknownAmmoLot`, `seriesText(series,
token)`, `tooManyShots(series, max)`, `secondSighter`, `readOnlySeries`,
`tooManyChanges(max, needed)`. Changes come out in `APPLY_ORDER` (firearms,
sessions, series, shots, falt_stations), each with a fresh `clientChangeId`,
`rowId = id`, `updatedAt = now`, and parse with `ClientChangeSchema`.
`moved` lists each firearm whose counter the push moves and which session or
series rows that move depends on, for E8's message.

The volume count reuses `sessionVolume` from `shared/src/scoring/volume.ts`.
If #674 lands first, its per-session volume helper in
`shared/src/sync-client/bulk-edit.ts` is moved to a module both import rather
than copied.

### 3.2 Page (`web/src/edit/`)

The session detail (`#sessions/<id>`) gains **Edit** and **Delete**. Edit
opens `#sessions/<id>/edit`: the session fields (E2) in the Enter Series
page's layout and order, then one text field per series of the main section
(E3) with its live total, a Sighter box (free format only, one per section),
a delete control per series and **Add Series**; final and total-only series
are listed read-only. **Save** (also Ctrl/Cmd+Enter) and **Cancel**. Delete
asks for confirmation naming the session (name and date) and the rounds the
firearm's counter will lose.

The save state is #669's `save.ts` shape: `submitRequest`, the held request
bound to the user id, `afterEdit` dropping the held request on any edit, the
form disabled while a request runs (#669 R23).

## 4. Scenarios

Every scenario maps 1:1 to a named test (name = id + title). Each states how
it would be falsified: the test fails when the stated mutation is made.

```gherkin
Feature: edit builder (shared/src/sync-client/session-edit.test.ts)
  Scenario: K1 a changed field writes the fresh session payload with that column and updated_at changed; unknown keys survive
    Falsified by: building from the opened payload instead of the fresh one; dropping an unknown key
  Scenario: K2 name blank → current name; location and notes trimmed, blank → null; over TEXT_LIMITS → tooLong(field)
  Scenario: K3 started_at under the R28 guard: each of #669 E15's refused values → invalidStartedAt, nothing built
  Scenario: K25 (R11) an edited start before 1900-01-01Z or more than 24 h after now → startedAtOutOfRange, nothing
            built; the bounds themselves pass; a stored out-of-range date the draft does not change is not checked
  Scenario: K4 type, kind, discipline_id, program_id, decimal_scoring, series_length, series_entry_mode, extra_rounds,
            external_*, official_* are never changed, whatever the draft holds
  Scenario: K5 a re-entered series: a tombstone per live shot, new rows at 1..k with fresh ids; an unchanged text writes nothing
    Falsified by: comparing shots by text instead of (value, inner ten, count); reusing a shot id
  Scenario: K6 a new series: one series row (main section, next position) then its shots; a blank new series writes nothing
  Scenario: K7 sighter: set or cleared on the series row; a second sighter in a free-format section → secondSighter;
            a fixed-format skeleton's flags are not offered
  Scenario: K8 a deleted series: tombstones for it and its live shots, none for other series
  Scenario: K9 a final or total-only series in the draft → readOnlySeries, nothing built
  Scenario: K10 property: for random counters c, n ≥ 0 and volumes, one floored move per firearm equals the phone's
            two saves in either order (E4); with the same firearm, the net move equals V_after − V_before floored once
  Scenario: K11 counters: same firearm moves by V_after − V_before; A→B moves −V_before and +V_after; None moves nothing;
            a firearm not live is not written; a zero move writes no firearm; both counters, floored at 0
  Scenario: K12 volume counts live series (sighters), total-only series by their stored count, extra rounds and fält stations
  Scenario: K13 an unknown or deleted firearm or ammo lot → unknownFirearm / unknownAmmoLot
  Scenario: K14 stale: a session row, an edited series row or its live shot ids that differ between opened and fresh → stale,
            nothing built; a series the user did not touch, or one added meanwhile, does not make it stale
    Falsified by: comparing every series instead of the touched ones; comparing only the session row
  Scenario: K15 gone: the session absent from fresh, or deleted_at set → gone
  Scenario: K16 nothing changed → nothingToChange; over PUSH_BATCH_MAX → tooManyChanges(max, needed), exactly 500 allowed
  Scenario: K17 every change parses with ClientChangeSchema, ids fresh, rowId = id, updatedAt = now, in APPLY_ORDER
  Scenario: K18 property: for any draft over a random logbook, the built edit applied to the fresh rows yields the session,
            series and live shots the draft shows, touches no other session, and moves each firearm as K11 says

Feature: delete builder (same file)
  Scenario: K20 delete: tombstones for every live shot, series, fält station and the session; nothing else but the firearm
  Scenario: K21 delete moves the firearm by −V_before floored; no firearm, a firearm not live, or V_before 0 → no firearm row
  Scenario: K22 delete leaves session_tags and every photo column alone
  Scenario: K23 delete of a session not live → gone; over 500 changes → tooManyChanges
  Scenario: K24 (R10) delete stale: the session row, any series row, a series' live shot ids, a series added or
            removed, or a fält station added, removed or changed since the page opened → stale, nothing built;
            gone wins over stale; rows of other sessions and the firearm row do not make it stale
    Falsified by: comparing only the session row; comparing only the series the page opened (a series added
                  meanwhile passes); leaving stations out

Feature: on the phone's schema (app/src/db/queries/web-edit.test.ts, vitest + better-sqlite3)
  Scenario: P1 session fields: web changes applied with applyChangesSync give the same getSession as updateSession on a twin
  Scenario: P2 change firearm: same sessions and same firearm counters as updateSession on a twin
  Scenario: P3 re-enter a series: same live shots, series total and counters as saveSeriesShots on a twin
  Scenario: P4 add, delete and (un)mark a sighter series: same as addSeries + saveSeriesShots, deleteSeriesAndShots,
            setSeriesSighter on a twin
  Scenario: P5 delete: same live rows and counters as deleteSessionAndSeries on a twin, a fält session and a rounds session included
  Scenario: P6 nothing applied is re-queued (the outbox stays empty after apply)
  Scenario: P7 a photo-scored series re-entered on the web: its photo_uri survives; its shot_marks no longer list (as the keypad)

Feature: round trip (backend/test/web-edit.spec.ts, Workers pool, real D1)
  Scenario: W1 an edit with a firearm change and a re-entered series, pushed over HTTP, is pulled by device B as built
  Scenario: W2 a delete, pushed over HTTP: device B pulls the tombstones and the firearm's counters
  Scenario: W3 resending the same request answers duplicate for every change and moves nothing twice
  Scenario: W4 the session tombstoned by device B first: the session change is rejected, the rest applied (E8's input)

Feature: page model (web/src/edit/*.test.ts)
  Scenario: U1 the form opens from the pulled rows: fields, one text per main-section series, final and total-only read-only
  Scenario: U2 offline disables Save and Delete and names the reason
  Scenario: U3 a network or sign-out failure holds the request; Retry resends it identically; an edit drops it
  Scenario: U4 a held request meets another account → accountChanged, nothing sent
  Scenario: U5 stale → the message and Reload; Reload refills from the fresh rows; nothing was sent
  Scenario: U6 saved / deleted refresh and navigate; a failed refresh says reload
  Scenario: U7 saved in part names the firearm(s) to check with Adjust Round Count, only when a moved counter's row was refused
  Scenario: U8 Delete needs the confirmation; Cancel sends nothing
  Scenario: U9 a builder that throws ends in "Could not save", not a page stuck saving (#669 R18)
  Scenario: U10 (R10) Delete stale → its own message and Reload; nothing was sent; Delete builds from the
            snapshot the page showed
```

Browser checks (not automated; screenshots under
`~/tmp/<branch>-shots/`, never in the repo or the PR): edit a competition's
fields and read them back on the phone; re-enter a series and read the
firearm's counter on the phone; change the firearm and read both counters;
delete a session and see it gone and the counter back on the phone; edit on
the phone while the web form is open, then Save on the web (stale); a Retry
after a dropped response changes nothing twice; the Swedish UI.

## 5. Must NOT

- **N1** No shooting data in browser storage: no `localStorage`,
  `sessionStorage` or IndexedDB in `web/src/edit/` (grep gate, as #669's).
- **N2** No outbox and no automatic retry or correction: a push happens only
  on Save, Delete or Retry (U3, E8).
- **N3** No new endpoint, no protocol change, no schema change (K17, W1).
- **N4** No column dropped from a rewritten row; no `NOT NULL` column pushed
  as `null` (K1, P1–P5).
- **N5** No row outside the one session written: only that session, its
  series and shots (and fält stations on delete) and the affected firearms
  (K18, K20).
- **N6** Never written: `session_tags`, `tags`, `settings`, `ammo_lots`,
  `shot_marks`, any photo column's value, and the immutable columns of K4. No
  photo `DELETE` call (K4, K22, E10).
- **N7** No write from a stale form: a touched row that changed since the
  form opened sends nothing (K14).
- **N8** No shot written under a final or total-only series (K9).
- **N9** The phone's behaviour does not change: no `app/src` source edit;
  `pnpm check` stays green.

## 6. Failure model (Tier 3)

| Way it can hurt                                          | Layer that catches it                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Rewrite from a stale view doubles a series' shots        | K14 stale check; W4; known limit for the pull→push window        |
| Counter moved twice by a Retry after a lost response     | idempotent resend (W3, U3)                                       |
| Counter moved the wrong way or by the wrong amount       | K10–K12 properties; P2, P3, P5 against the phone's own functions |
| A dropped or `null` column wedges a phone's apply        | K1, K17; P1–P5 apply on the real schema                          |
| A tombstone for a row outside the session (irreversible) | K18 property; N5                                                 |
| A push split mid-action leaves half an edit              | E7: one push, `tooManyChanges` (K16)                             |
| An edit lands in another account after a sign-in switch  | U4; #669 R14/R22                                                 |
| Refused session row with its counter move applied        | E8 message (U7); W4                                              |
| Photo lost by an edit or delete                          | K22, P7, N6                                                      |
| A page stuck on "Saving…"                                | U9                                                               |

## 7. Gauntlet plan

- `pnpm check` from the root: 100% coverage on `stryker.config.json`'s
  `mutate` list, which already covers `shared/src/sync-client/*.ts`;
  `web/src/edit/*.ts` joins it (as `web/src/entry/` did in #669 R16).
- `pnpm mutation` (Stryker) on the new modules; survivors classified in
  EVIDENCE. Mutants rerun against the K10/K18 properties alone.
- fast-check (already a dev dependency) for K10 and K18.
- The phone twin test (P1–P7) under vitest + better-sqlite3, as #669's A2.
- Backend Workers pool: `cd backend && npx vitest run --testTimeout=60000`
  (W1–W4).
- Docs gates: `mkdocs build --strict`, `node scripts/docs-translation-check.mjs`,
  `node scripts/docs-anchor-check.mjs`.
- Real execution: the browser checks above against a local backend.
- Independent verification: one fresh-context round on the final state, per
  `references/verifier.md`; the maintainer grades the findings.

## 8. Setup plan

- **Isolation:** the coordinator's worktree for this branch; the main
  checkout is shared with other sessions.
- **Branch:** on top of `feat/web-series-entry-impl` (#669), since the
  builders reuse its `rows.ts`, `direct-push.ts`, `series-text.ts` and
  `web/src/entry/save.ts`. Rebased onto main once #669 merges; onto #674's
  branch as well if it merges first (§3.1's shared volume helper).
- **Git:** this spec committed first, then one checkpoint commit per green
  layer (builders, phone test, backend test, page, docs, evidence).
  DCO-signed Conventional Commits, explicit paths.
- **Files the gauntlet adds:** none beyond the tests named in §4; a manual
  mutation script only if Stryker cannot reach a module (as #674 R3).
- **New dependencies:** none.

## 9. Revisions

- **R1 (implementation): `firearm_groups` is not re-pulled.** E6 listed it,
  but the phone's edit screen does not re-derive the vapengrupp when the
  firearm changes, and no other edit reads it, so the builder never needs it.
- **R2 (implementation): the opened snapshot holds the series' live shot
  rows, not only their ids.** Whether the form changed a series is judged
  against what it opened (§3.1's "the snapshot the form was filled from");
  judging it against the fresh shots would make a series the phone re-entered
  meanwhile look edited, and refuse a save K14 says must pass.
- **R3 (implementation): the volume helper moved, as §3.1 anticipated.** #674
  landed first: its per-session volume count is now
  `shared/src/sync-client/volume-rows.ts`, imported by `bulk-edit.ts` and
  `session-edit.ts`, and the floored counter move is `withRoundsMoved` in
  `rows.ts`, used by both.
- **R4 (implementation): competition fields only on a competition.** E2
  lists them "for a competition"; a training session's vapengrupp, klass and
  event are left as they are on the web (the phone keeps offering a stored
  one).
- **R5 (independent verification, round 1): sighters are counted over the
  fresh pull.** K7's one-sighter rule counted the series as the form opened
  them, so a sighter another device set meanwhile on a series the form did not
  touch let a second one through. It now counts the freshly pulled live
  series, the draft overlaid, as the phone's `setSeriesSighter` reads its own
  table. A new row deleted again on the form is skipped before its text is
  read, so its errors do not block the save.
- **R6 (description): E8 names the firearm for any refused row the move was
  made for**, a refused shot tombstone included (a series deleted elsewhere
  refuses its shots first), not only a session or series row.
- **R7 (description): E3's "refused as in #669"** for a sighter mark past a
  fixed skeleton reads "ignored as in #669": the skeleton decides, and a mark
  the form does not offer is not stored.
- **R8 (independent verification, round 2): R5 completed.** The page sends
  every opened series, so the sighter count takes the draft's flag only for a
  series the save writes (touched), and the fresh row's flag for every other.
- **R9 (description, for the maintainer): E6's stale check is Save's.**
  Delete re-pulls and tombstones what is live then (§3.1's
  `buildSessionDelete` takes no opened snapshot), so it has no stale check
  beyond `gone`; the rounds its confirmation names come from the page's last
  pull, while the push moves the counter by the fresh count. Whether Delete
  should also refuse a changed session is the maintainer's call.
  **Decided by the maintainer (2026-10-13): yes, see R10.**
- **R10 (spec change, approved by the maintainer 2026-10-13): Delete gets
  Save's stale check.** If the session row, or any of its series or their live
  shots, changed on another device since the page opened it (Save's notion of
  "changed": the row's columns and values, a series' set of live shot ids),
  or a series was added or removed meanwhile, Delete sends nothing and offers
  Reload, as Save does; "gone" stays as it was. Reason: the confirmation names
  a round count from the page's last pull while the push moves the firearm's
  counter by the fresh count, and a delete would remove series the user never
  saw. `buildSessionDelete` takes the opened snapshot (§3.1), which now also
  holds the session's live fält stations; a station added, removed or changed
  meanwhile is stale too, by the same reason (each station is six rounds of
  the count the confirmation names), an extension of the maintainer's wording
  to the one other child table Delete tombstones. E6, E9 and §4 (K24, U10)
  carry it. Delete's "Reload" re-pulls the account (the page's refresh), since
  the detail page holds no form to refill.
- **R11 (rebase onto main, #747): an edited date is held to the entry's
  range.** Main's entry builders refuse a start before 1900 or more than a
  day ahead (`startedAtError`, `startedAtOutOfRange`). A date the edit
  changes is checked the same way; a stored date the edit does not change is
  not checked, so a session the phone holds with an odd date can still have
  its other fields edited.
- **R12 (rebase onto main, #713, #714, #754): what main added since.**
  - Fält sessions entered on the web (#713) are edited as E11 says for fält:
    session fields and Delete, never stations; E11's reason "no station entry
    exists on the web" is out of date, the cut stands (stations are edited on
    the phone).
  - Photos attached on web entry (#714): a series may now hold a photo and no
    shot. It opens as a blank row; left blank it writes nothing; its photo
    columns carry over as E10 says, and Delete leaves the photo on the server
    as the phone's delete does. The edit form does not attach or remove a
    photo.
  - The delete confirmation's date uses the web's locale binding
    (`web/src/dates.ts`, #754); the app's `formatSessionDate` it used is gone.
- **R13 (#767): a photo badge, display only.** A series row (editable or
  read-only) whose `photo_uri` is set is marked **Photo**, a button that shows
  or hides the photo below the row through the detail page's `Photo`
  (`web/src/sessions/photos.tsx`); one still on the phone shows as not
  uploaded. Nothing Save or Delete builds changes.

## 10. Revision 2 — fält stations and rounds (#769)

> **Approval status: approved** (2026-10-13, §10.10). E1–E12 and §9 stand; this section lifts two of E11's cuts
> (fält stations; rounds-only sessions and extra rounds) and says what
> replaces them. E11's other cuts (final and total-only series, match format,
> series reorder, tags, undo) are unchanged. Evidence for this revision is
> appended to `docs/specs/web-session-edit-evidence.md` once built.

- **Tier: 3**, as the original: it writes, rewrites and tombstones synced
  `falt_stations` rows and moves a firearm's absolute counters. An impossible
  station (seven hits, say) makes `faltResult` throw on every phone screen
  that shows the session; a tombstoned station cannot be brought back.
- **Scope:** `shared/src/sync-client/session-edit.ts` (the draft gains
  stations and Rounds Fired; the builder writes them), `web/src/edit/` (the
  form opens stations and Rounds Fired; save state unchanged), a small
  extension of `web/src/entry/falt-model.ts` and `falt-stations.tsx` so the
  edit page reuses #713's station rows, `web.edit.*` strings in
  `app/src/i18n/{en,sv}.json`, the phone-schema test
  (`app/src/db/queries/web-edit.test.ts`), the backend round trip
  (`backend/test/web-edit.spec.ts`), `docs/manual/` EN + SV
  (`guides/editing-a-session-on-the-web` and its Swedish twin). #768's
  "changed on the phone" hints for stations and Rounds Fired go (the issue's
  last line).
- **Not in scope:** station photos and station notes (the phone's station
  screen does not edit them either), changing a session's result mode,
  discipline or kind (E21), extra rounds on a session that is not rounds-only
  (E17).

### 10.1 Settled inputs (not re-asked)

1. Everything §1 lists, and E1 (the web writes what the phone's own function
   writes), E4 (one floored move per firearm), E6 (re-pull, refuse a stale
   form, then last write wins), E7 (one push, at most 500 changes), E8 (a
   refused row names the firearm, corrects nothing), E9's outcome table and
   R10 (Delete's stale check, stations included).
2. #713 (`web-falt-entry-spec.md`): a station row is the phone's station
   screen, control for control (C2); the station rules are the shared ones in
   `shared/src/scoring/falt-station.ts` (`stationProblem`, `stationPoints`,
   `figuresHitRange`, `clampFiguresHit`, `isUnenteredStation`); a new row
   with nothing entered is not saved, a 0-hit row is (R8); Shoot-off is not a
   row control, **Start Shoot-off** starts one and every later station is one
   (R5–R7); six rounds per station, scratched and shoot-off included (C4).
3. #718 (`web-rounds-final-spec.md`): Rounds Fired is plain digits up to
   `MAX_ROUNDS_FIRED` (10 000), blank is none, anything else is refused
   (`parseRoundsFired`, C4 and R4, the maintainer's ruling 2026-10-11); the
   counter moves by the rounds, as `setSessionExtraRounds` (C2).

### 10.2 What the phone does (read from `app/src/`, 2026-10-13)

| Phone action                                  | Function                                        | What it writes                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Add Station (stations card → station screen)  | `addStation`                                    | a new `falt_stations` row at `last live position + 1`; counters `+6` (`withSessionVolumeDelta`)                                        |
| Edit a station (tap its row → Save)           | `updateStation`                                 | `hits`, `figures_hit`, `figure_count`, `points`, `points_max`, `is_scratched`, `updated_at`; no counter move (station count unchanged) |
| Delete a station (station screen → Delete)    | `softDeleteStation`                             | a tombstone; counters `−6`; the other stations keep their positions (gaps stay)                                                        |
| Start Shoot-off                               | route flag → `addStation({ isShootOff: true })` | as Add Station; every later station is a shoot-off (`nextStationIsShootOff`: the last station decides)                                 |
| Scratched                                     | switch on an **existing** station only          | `is_scratched` via `updateStation`                                                                                                     |
| Rounds Fired / Extra Rounds (detail, on blur) | `setSessionExtraRounds`                         | `extra_rounds`; counters by the difference                                                                                             |
| Result mode, discipline, kind                 | none: set on the new-session form, then fixed   | —                                                                                                                                      |

Where the phone shows what: the stations card when the discipline is scored
in hits (`isFaltSession`), the Extra Rounds field when `kind = 'rounds'`
(`isRoundsSession`), each independent of the other. A rounds-only fält
session therefore shows both. A series session (rings or fält) shows no
extra-rounds field; such a session holds `extra_rounds` only from a
Webshooter import's sighter rounds or older data. An existing station's
shoot-off flag is never changed (`updateStation` is passed it unchanged from
the row). The phone's detail field still reads its text with `Number()`
(non-negative integer, no cap; invalid text silently reverts), unlike its
new-session form, which uses `parseRoundsFired`.

### 10.3 Key choices (for approval)

Each is my recommendation, with the alternative I weighed.

**E13. Stations are edited in place on the edit page, with #713's station
rows.** A fält session's edit page shows, below the session fields, the
session's live stations in stored position order, each as #713's station row
(Hits, Figures Hit, Figures, Points `of` Max Points, Scratched, a Shoot-off
badge), pre-filled from the row, then **Add Station** and, when the phone
would offer it, **Start Shoot-off**. Each existing row has **Remove** (and
**Undo** while unsaved, as a series row has). Save writes, per station, what
the phone's function writes: `addStation` for a new row, `updateStation` for
a changed one, `softDeleteStation` for a removed one; an unchanged row writes
nothing. The live result line (`faltPreview`) reads the rows as they will be.
_Alternative:_ one station at a time on its own sub-page, as the phone's
station screen. Not recommended: the web's entry page already edits all
stations in one table, and a sub-page would need its own save, so one edit
would become several pushes (against E7).

**E14. Positions stay as stored; a new station goes after the last live
one.** An edited row keeps its `position`; a removed one leaves a gap, as on
the phone; a new row takes `max(live position in the fresh pull) + 1`, then
the next, in form order. Rows are labelled by stored position ("Station 4"),
as the phone labels them, so the web and the phone name the same station the
same way. Positions are never rewritten.
_Alternative:_ renumber the kept stations 1..n on every save. Not
recommended: the phone never does it, it would rewrite every station after a
removed one (more rows, more stale surface), and P8–P10 would compare two
different mechanisms.

**E15. A station's rules on edit are the phone's.**

- An existing row offers Hits 0–6 only (no "–": the phone's screen has no
  unset state). Removing a station is the Remove control, never an emptied
  row. A new row follows #713's entry rule: Hits starts "–", a row with
  nothing entered is not saved (R8).
- Figures Hit is clamped as on the phone; points through `stationPoints`;
  a row that `stationProblem` rejects (a scratched one never is) is refused
  with `invalidStation(row)`, bad points with `stationPoints(row)` — #713's
  error kinds and messages.
- **Scratched** is a control on every row, existing and new, as on the web
  entry page (#713 R5).
- **Shoot-off:** an existing station's flag is never changed (badge only).
  A new station is a shoot-off when the station before it in position order,
  among those kept, is one, or when Start Shoot-off created it — the phone's
  `nextStationIsShootOff`, which the builder re-applies over the kept rows.
  Start Shoot-off is offered as `canStartShootOff` reads the kept rows.
- A rewritten station is the freshly pulled payload spread, with only
  `updateStation`'s columns and `updated_at` replaced; `photo_uri`, `note`,
  `is_shoot_off`, `position`, `session_id` and unknown keys survive (as E2's
  rule for the session row).

**E16. The result mode is shown, not edited.** `falt_result_mode` (Field /
Point field) is read-only on the edit page, because the phone fixes it at
creation. The result line uses it.
_Alternative:_ let the web change it. It moves no counter and only changes
how the result reads, so it is low risk, but it is something the phone cannot
do, and the issue asks for parity, not more. A question for the maintainer
(§10.8).

**E17. Rounds Fired is editable on a rounds-only session, and only there.**
On a `kind = 'rounds'` session the edit page shows **Rounds Fired**,
pre-filled from `extra_rounds` (blank for null). A changed value is parsed by
`parseRoundsFired` (plain digits, at most 10 000, blank → null) and refused
with `invalidRounds` otherwise; `0` stores 0. A stored value the edit does
not change is not checked, so a phone-entered count above 10 000 does not
block an edit of the name (R11's rule for dates). On every other session
`extra_rounds` stays in K4's never-written list, whatever the draft holds,
and is not shown (as #768 left it).
_Alternative:_ an Extra Rounds field on every session, as the issue's
"extra rounds" could be read. Not recommended: the phone offers it only on a
rounds-only session, so the web would write a value no phone screen can
correct; a series session's `extra_rounds` comes from a Webshooter import's
sighter rounds and is that import's business. A question for the maintainer
(§10.8).

**E18. A rounds-only fält session gets both.** The page uses the phone's two
independent conditions: stations when the discipline is scored in hits,
Rounds Fired when `kind = 'rounds'`. A rounds-only fält session (the web's
entry creates one with no stations, #718 R5) therefore shows Rounds Fired and
an empty station table with Add Station, as the phone's detail shows both.
_Alternative:_ Rounds Fired only, treating stations on a rounds session as
a phone quirk. Simpler, but less than the phone; a question for the
maintainer (§10.8).

**E19. The counter rule does not change; the volumes now include the
edit's stations and rounds.** E4's `V_before` (fresh rows) and `V_after`
(rows as written) by `sessionVolume`: series, extra rounds and six per live
station. So, for one firearm, the move is
`6 × (stations added − stations removed) + (extra_rounds after − before)`,
plus any series change, as one floored move; editing a station's numbers or
Scratched moves nothing. With a firearm change in the same save, `A` moves
`−V_before` and `B` `+V_after` (E4). The phone moves the counter once per
station and once per Rounds Fired blur and floors each; the one net move
differs only when a floor bites (a drifted counter), as E4 already accepts.

**E20. The stale check covers stations and Rounds Fired.**

- The session row is compared in full on every Save already (K14), and
  `extra_rounds` is a session column, so a Rounds Fired the phone changed
  since the page opened is stale today. This revision pins that with a test
  (K33) rather than adding a check.
- When the draft touches any station (adds, changes or removes one), the
  session's **whole set** of live stations in the fresh pull must equal the
  opened set: same ids, each row with the same columns and values (`sameRows`,
  as Delete's R10 check). Otherwise the save is refused as stale, nothing
  sent, **Reload** offered (E6, E9). A save that touches no station is not
  blocked by a station another device changed.
- Delete is unchanged (R10 already compares the stations).

_Alternative:_ compare only the stations the draft touches, as E6 does for
series. Not recommended for stations: a new station's position and shoot-off
flag are read from the whole sequence, so a station the phone added
meanwhile changes what the web's new row should be, and stations are few, so
the stricter check costs little.

**E21. A fält session's locks stay locked.** `kind`, `discipline_id`,
`falt_result_mode` (E16), `program_id` (null: no fält discipline has a
program, so no match format to change), `decimal_scoring` and
`series_length` are never written. A fält session's series rows, if any
(none is created by either client), are not edited: E3's series section is
for sessions whose discipline is scored in rings, as now. Delete stays E5 +
R10.

**E22. No new dependency, endpoint, protocol or schema change.** As E12 and
N3.

### 10.4 Design

```ts
interface StationEditDraft {
  /** A station the form opened; null for one added on the form. */
  id: string | null;
  /** null only on a new row (Hits not chosen); an opened row always holds 0–6. */
  hits: number | null;
  figuresHit: number;
  figureCount: number | null;
  pointsText: string;
  pointsMaxText: string;
  isScratched: boolean;
  /** Read on a new row only (Start Shoot-off); an opened row keeps its flag. */
  isShootOff: boolean;
  deleted: boolean;
}

interface SessionEditDraft {
  sessionId: string;
  fields: Partial<EditableSessionFields>;
  series: readonly SeriesEditDraft[];
  /** Every opened station plus new ones, as the form holds them; omitted or [] when the page shows none. */
  stations?: readonly StationEditDraft[];
  /** As typed; undefined when unchanged or not a rounds-only session. */
  roundsFired?: string;
}
```

`buildSessionEdit` gains a station plan beside the series plan (keep /
change / remove / new, each with its form row for errors) and a Rounds Fired
column. New `EditError` kinds: `stationPoints(row)`, `invalidStation(row)`,
`invalidRounds`. A draft station id the form did not open throws
(`RangeError`), as a series id does. A new station row is `newStationRow`
from `falt-entry.ts`; a changed one is the fresh payload spread. Changes stay
in `APPLY_ORDER`; `moved` lists the station rows with the rest (E8).

On the page, `openForm` adds `stations` (each opened row as a #713
`StationRow` plus its id) and `roundsFired`; `editsStations` is
`discipline.scoring === 'hits'`, `editsRounds` is `kind === 'rounds'`.
`falt-model.ts`' helpers take rows that carry an optional id and a fixed
shoot-off flag, so the entry page's behaviour is unchanged (its tests stay
green untouched). `faltSendsTheSame` is generalised so an appended blank row
keeps a held request on the edit page too (#669 R21).

### 10.5 Scenarios

Numbering continues §4. Each maps 1:1 to a named test (id + title) and names
the mutation that falsifies it, except U16 (no code) and U17 (the unedited
entry tests), which have no test of their own.

```gherkin
Feature: station edit (shared/src/sync-client/session-edit.test.ts)
  Scenario: K26 a changed station: the fresh payload spread with hits, figures_hit, figure_count, points, points_max,
            is_scratched and updated_at replaced; photo_uri, note, is_shoot_off, position and unknown keys survive;
            an unchanged station writes nothing
    Falsified by: writing is_shoot_off from the draft; writing every opened station (spreading the opened
                  payload is equivalent: E20 refuses the write unless opened and fresh rows are equal)
  Scenario: K27 a new station: newStationRow at max(fresh live position) + 1, then +1 per new row in form order;
            a new row with nothing entered writes nothing; a 0-hit row is saved (R8)
    Falsified by: renumbering 1..n; dropping a 0-hit row (numbering from the opened stations is equivalent,
                  as K26's spread)
  Scenario: K28 a removed station: one tombstone; no other station row is written; positions of the rest unchanged
  Scenario: K29 an opened row with hits null, or one stationProblem rejects → invalidStation(row); bad points →
            stationPoints(row); nothing built; a scratched row with impossible numbers is accepted (as the phone)
  Scenario: K30 shoot-off: an opened station's flag is never changed; a new station after a kept shoot-off is one,
            whatever the draft says; a new row the draft started as a shoot-off is one; a removed last shoot-off does
            not make the next new row one
    Falsified by: reading is_shoot_off from the draft for an opened row; deciding from the opened (not kept) rows
  Scenario: K31 counters: +6 per new kept station, −6 per removed, 0 for a changed or scratched one, netted with the
            series and rounds deltas into one floored move per firearm (E19); A→B in the same save moves
            −V_before / +V_after with V counting stations
  Scenario: K32 stale (stations): when the draft touches any station, a station added, removed or changed (any column)
            in the fresh pull since opening → stale, nothing built; a draft touching no station is not blocked by it
    Falsified by: comparing only touched stations; comparing ids only; checking stations on every save
  Scenario: K33 stale (rounds): the session's extra_rounds changed in the fresh pull → stale, whatever the draft edits
  Scenario: K34 a fält session's kind, discipline_id, falt_result_mode, program_id, decimal_scoring, series_length are
            never written, whatever the draft holds (K4 extended)

Feature: rounds edit (same file)
  Scenario: K35 a rounds-only session: roundsFired "40" over stored 25 → extra_rounds 40, firearm +15; "10" → −15
            floored; "" → null and −25; "0" → 0; equal to the stored value → nothing written
    Falsified by: moving by the new value instead of the difference; storing "" as 0
  Scenario: K36 roundsFired "-3", "2.5", "abc", "1e2", "+5", "10001" → invalidRounds, nothing built; "10000" accepted;
            a stored 12000 the draft does not change does not block a name edit
  Scenario: K37 a session that is not rounds-only: roundsFired in the draft is ignored, extra_rounds never written
    Falsified by: writing extra_rounds for a series session
  Scenario: K38 property: for a random fält or rounds session and a random draft (stations added, changed, removed,
            rounds changed, firearm changed), the built edit applied to the fresh rows yields the stations and
            extra_rounds the draft shows, touches no other session, and moves each firearm by E19's rule

Feature: on the phone's schema (app/src/db/queries/web-edit.test.ts)
  Scenario: P8 add a station (and a shoot-off one): same live stations and counters as addStation on a twin
  Scenario: P9 change a station (numbers, scratched): same rows as updateStation on a twin; counters unmoved
  Scenario: P10 remove a station: same live stations and counters as softDeleteStation on a twin; gap kept
  Scenario: P11 Rounds Fired: same session row and counters as setSessionExtraRounds on a twin, up, down and to blank
  Scenario: P12 one save adding two stations, removing one and changing the firearm: same rows and counters as the
            phone's functions applied one by one on a twin (counters not floored on either side)
  Scenario: P13 faltSessionResult over the web-edited stations equals the twin's (the phone reads them without throwing)

Feature: round trip (backend/test/web-edit.spec.ts)
  Scenario: W5 a station edit (add, change, remove) and a Rounds Fired edit, pushed over HTTP, are pulled by device B
            as built; a resend answers duplicate and moves nothing twice
  Scenario: W6 a station tombstoned by device B first: that change is rejected, the rest applied (E8's input)

Feature: page model (web/src/edit/*.test.ts)
  Scenario: U11 a fält session opens with its live stations by position, labelled by stored position, result mode
                read-only; a rounds-only session opens with Rounds Fired; a rounds-only fält session with both
  Scenario: U12 Remove / Undo on an opened station; Add Station and Start Shoot-off as canStartShootOff says
  Scenario: U13 an appended blank station keeps a held request; any other station or Rounds Fired edit drops it
  Scenario: U14 station and rounds errors land on their row / field; nothing sent
  Scenario: U15 saved in part after a refused station names the firearm (U7 extended)
  Scenario: U16 #768's "changed on the phone" hints for stations and Rounds Fired are gone; final and total-only keep theirs
  Scenario: U17 the entry page's fält behaviour is unchanged (its existing falt-model tests pass unedited)
```

Browser checks (not automated, screenshots local only): edit, add and remove
stations of a fält session and read the stations and the firearm's counter
on the phone; Start Shoot-off on the web; change Rounds Fired up and down and
read the counter; edit a station on the phone while the web page is open,
then Save a station edit on the web (stale) and a name-only edit (saves); the
Swedish UI. Phone read-back needs a device; the PR says what was not run.

### 10.6 Must NOT (added to §5)

- **N10** No station position rewritten; no two live stations of a session
  at one position (K27, K28, K38).
- **N11** No change to an existing station's `is_shoot_off`, `photo_uri` or
  `note`; no station `photo` call (K26, K30).
- **N12** No `extra_rounds` write on a session that is not rounds-only (K37).
- **N13** No station row that `stationProblem` rejects, unless scratched
  (K29, P13).
- **N14** The web entry page's fält behaviour and its tests do not change
  (U17); the phone's behaviour does not change (N9 stands: no `app/src`
  source edit).

### 10.7 Failure model (added to §6)

| Way it can hurt                                                | Layer that catches it                       |
| -------------------------------------------------------------- | ------------------------------------------- |
| An impossible station wedges every phone screen of the session | K29, P13, N13                               |
| Two stations at one position (phone screen finds by position)  | K27, K38, N10                               |
| Station or rounds edited from a stale view                     | K32, K33; the pull→push window as E6 states |
| Counter moved wrongly by stations or rounds                    | K31, K35, K38; P8–P12 against the phone     |
| A shoot-off flag flipped, changing the official result         | K30, N11                                    |
| A station's photo or note lost                                 | K26, N11                                    |
| The entry page broken by the shared station helpers            | U17, N14                                    |

### 10.8 Questions for the maintainer

1. **E16:** result mode read-only on the web (recommended, as the phone), or
   editable?
2. **E17:** Rounds Fired only on a rounds-only session (recommended), or an
   Extra Rounds field on every session?
3. **E18:** a rounds-only fält session shows both Rounds Fired and stations
   (recommended, as the phone), or Rounds Fired only?
4. **E14:** keep stored positions with gaps (recommended), or renumber 1..n?
5. **Phone follow-up (not in this scope):** the phone's detail Rounds Fired
   field still reads `Number()` with no cap, unlike its new-session form.
   Should it adopt `parseRoundsFired`, as the new-session form did (#718
   R4)? A separate issue if yes; N9 keeps this revision off `app/src`.

### 10.9 Setup plan

- **Isolation:** a worktree under `~/tmp` from `origin/main`, branch
  `feat/769-web-edit-parity`; the main checkout is shared.
- **Git:** this revision committed first (this PR), then one checkpoint
  commit per green layer (builder, phone test, backend test, page, docs,
  evidence). DCO-signed Conventional Commits, explicit paths.
- **Files the gauntlet adds:** none beyond the tests named in §10.5;
  `web/src/edit/*.ts`, `web/src/entry/*.ts` (the shared station helpers)
  and `shared/src/sync-client/*.ts` are already in `stryker.config.json`'s
  `mutate` list.
- **Gauntlet:** as §7 — `pnpm check` (100% coverage), `pnpm mutation` on the
  changed modules with survivors classified, fast-check for K38, the phone
  twin test, the Workers pool, the three docs gates, the browser checks, one
  independent verification round on the final state.
- **New dependencies:** none.

### 10.10 Revisions to revision 2

- **Approval (2026-10-13).** The maintainer answered §10.8 with one rule:
  do as the phone, parity as far as possible (now `app/PRODUCT.md`
  principle 5 and root `CLAUDE.md` rule 11). So: Q1 result mode read-only
  (E16); Q2 Rounds Fired on rounds-only sessions only (E17); Q3 a rounds-only
  fält session shows both (E18); Q4 stored positions with gaps kept (E14);
  Q5 the phone's detail Rounds Fired field adopting `parseRoundsFired` is a
  separate phone issue, outside this scope (N9).
- **#727 interaction.** If #727 drops `falt_stations.photo_uri`, K26's spread
  needs no change (a missing key is simply absent). If it derives
  `firearms.rounds_since_maintenance`, E19's counter move follows whichever
  lands first.
- **Made while implementing (2026-10-13).**
  - **Remove is the phone's Delete Station** (`station.delete`), with
    **Undo** on a stored station. A new row's Delete Station drops the row
    from the form at once, so a removed station in the draft is always a
    stored one.
  - **Station errors** carry `row`, the 1-based row of `draft.stations`, as
    #713's do; the page routes them by kind, so they land on the station row,
    never on a series row. `invalidRounds` lands under Rounds Fired.
  - **New rows are labelled** after the highest stored position, one up per
    new row (`stationPositions`), the numbers the builder will give them
    when every new row is entered.
  - **A stored station's shoot-off flag** sets the running flag for the new
    rows after it to its own value (the last kept one decides, as
    `nextStationIsShootOff`); a new row can only turn it on. The entry page
    has no stored rows, so its rule is unchanged (U17: its tests pass
    unedited).
  - **U16 needs no code:** #768 already removed the station-count and rounds
    hints before this revision; this revision adds none.
  - **U13:** the edit page keeps a held request across Add Station (only
    blank rows appended, `faltSendsTheSame`); any other edit drops it, as
    before.
- **After independent verification round 1 (2026-10-13).** Three items were
  put to the maintainer with a recommendation; work went ahead on the
  recommended option under their standing "go with recommended answers",
  and they may still overrule any of them:
  - **E15's shoot-off is order-dependent, as on the phone.** With stored
    stations 1 and 2 (shoot-off), adding a station and then deleting 2 makes
    the new one a shoot-off; deleting first does not. The phone's
    `nextStationIsShootOff` behaves the same in the same order, and the badge
    shows the outcome before saving. E15's "among those kept" therefore reads:
    the last station kept _when the new row was added_ decides.
  - **A stored station the edit did not change is neither checked nor
    written.** A row whose controls still hold exactly the opened values
    (Points and Points Max as the text the page opened them with) skips
    `stationPoints` and `stationProblem`, as unchanged Rounds Fired does
    (trimmed text against the stored number's text), so imported data the
    phone would refuse no longer blocks or rewrites a name-only save. Text
    retyped to the same number (`05` for 5) is an edit: it is checked, and
    written only if a column's value differs. Behavioural fix (`1b2097d`).
  - **Scratched stays on new rows** (E15 as written, matching the entry page),
    although the phone offers it only on an existing station.
