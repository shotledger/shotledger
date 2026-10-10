# Web session edit and delete — executable specification

> Old-coder SPEC for #692: edit and delete a session on the web. It builds on
> the web write client of #669 (`docs/specs/web-series-entry-spec.md`, not
> merged when this was written) and reads the bulk edit spec of #674
> (`docs/specs/web-bulk-edit-spec.md` on `feat/web-bulk-edit`) for its counter
> and refusal rulings. Evidence report, once written:
> `docs/specs/web-session-edit-evidence.md`. Decision record: ADR 0019 (web
> writes push whole rows through `/sync/push`).
>
> **Approval status: not approved.** Every key choice below (E1–E12) is a
> recommendation awaiting the maintainer's first-hand approval. No code is
> written until then.

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

buildSessionDelete(sessionId, fresh, deps) →
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

- (none yet)
