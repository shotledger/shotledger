# Web bulk edit — executable specification

> Old-coder SPEC for the "bulk editing" item of #301 (web write paths), on top
> of the web write client of #669 (`docs/specs/web-series-entry-spec.md`).
> Evidence report: `docs/specs/web-bulk-edit-evidence.md`. Decision record:
> ADR 0019 (web writes push whole rows through `/sync/push`).
>
> **Approval status: not yet approved by the maintainer.** Written and built
> in one autonomous run; the key choices below are listed in the PR for
> approval.

- **Tier: 3.** It rewrites synced rows of many sessions in one request. A
  wrong payload does not fail on the web: it fails, or silently corrupts, on
  every phone that pulls it. A dropped column, a link to a tag the phone does
  not have, or a counter moved the wrong way is replicated to every device.
- **Scope:** `shared/src/sync-client/bulk-edit.ts` (new, pure),
  `web/src/bulk/` (new: a Bulk Edit page, its pure list model and its
  apply state), one line each in `web/src/shell/shell.tsx`,
  `web/src/shell/icons.tsx` and `web/src/app.tsx`, `web.bulk.*` strings in
  `app/src/i18n/{en,sv}.json`, one phone-schema test
  (`app/src/db/queries/web-bulk.test.ts`), one backend round-trip spec
  (`backend/test/web-bulk.spec.ts`), `docs/manual/` EN + SV.
- **Delivered of the four bulk edits:** (1) retag — add or remove a tag
  across a selection; (2) change the firearm on many sessions; (3) move
  sessions to another location. **Not in this layer:** (4) merge duplicate
  ammo lots (§6).

## 1. Settled inputs (not re-asked)

1. ADR 0019: the web pushes whole rows through `/sync/push`, online only; no
   browser database, no outbox; the same per-row last-write-wins as a second
   phone. Its table "How a web edit becomes pushed rows" fixes the rows for
   each bulk edit.
2. #669 C2: one user action is one push; Retry resends the identical request
   and the server's idempotency table makes it safe.
3. `session_tags` syncs, unlink is a tombstone, relink is a new row, and tag
   names are not unique on disk (ADR 0019, #647).

## 2. Key choices (for approval)

**B1. A bulk edit does what the phone's single-session edit does, once per
selected session.** Each action mirrors one phone function, so the result on
every device equals what the phone would have written editing the sessions
one by one:

| Bulk action     | Phone function per session                         |
| --------------- | -------------------------------------------------- |
| Add Tag         | `getOrCreateTag` + `addSessionTag`                 |
| Remove Tag      | `removeSessionTag`                                 |
| Change Firearm  | `updateSession(…, { firearmId })` (moves counters) |
| Change Location | `updateSession(…, { location: trimmed or null })`  |

The app test (P1–P4) proves it by running the phone's own function on a twin
database and comparing.

**B2. The round counters move with the sessions (as the phone does since
#564).** Changing a session's firearm moves that session's rounds
(`sessionVolume`: every live series, sighters included, extra rounds, six per
fält station) off the old firearm's `round_count` and
`rounds_since_maintenance` and onto the new one's, each floored at 0. One
push carries every affected firearm once, with the summed delta. In one
action a firearm is either the target or a source, never both, so the summed
delta floored once equals the phone's per-session floors. An old firearm that
is no longer live is not touched (the phone's `applyRoundCountDelta` finds no
row). "None" takes the rounds off and gives them to nobody.
_Alternative:_ leave the counters and say so. Not recommended: the phone
moves them, and the web would make them drift.

**B3. One action is one push; more than 500 changes is refused, not split.**
A bulk edit is one `/sync/push` (one D1 transaction), so it lands completely
or not at all, and Retry (C2 of #669) resends the identical request. An edit
that needs more than `PUSH_BATCH_MAX` (500) changes is refused before
anything is sent, naming the number needed; the user narrows the selection.
Splitting would make one action several transactions, and a failure between
them would leave half a bulk edit with no single request to retry.

**B4. Rows are rebuilt from a fresh pull.** Apply first pulls `sessions`,
`tags`, `session_tags` and `firearms` again (and `series`, `shots` and
`falt_stations` for a firearm change), then builds the edit from those rows.
A session edit spreads the pulled payload and changes one column plus
`updated_at`, so a column this build does not know survives. _(Reworded in
R10.)_ The pull narrows the window, it does not close it: another device's
edit to the same row between that pull and the push is overwritten, and a
**Retry** resends the request built at the first Apply, so after a Retry the
window runs from that first pull to the Retry, however long the user took.
The firearm rows are absolute counters, so this matters most for them: a
phone that adds rounds to a firearm (saving a series) between the web's pull
and its push loses those rounds when the web's firearm row lands, and the
web loses its move when the phone's row lands later. Same per-row
last-write-wins as two phones (ADR 0019, consequences); no layer here
prevents it.

**B5. A session deleted elsewhere drops out.** A selected session that is no
longer live after the fresh pull is left out and counted as "no longer in
your logbook". A session deleted between that pull and the push is refused by
the server (`tombstoned`); the rest lands and the page says how many changes
were refused.

**B6. Already as asked is not a change.** A session that already carries the
tag, already has the firearm or already is at the location writes no row and
is counted as unchanged. An action that changes nothing sends nothing.

**B7. Tags by name.** Add Tag takes a typed name (trimmed, at most 120
characters) and links the name's canonical tag (the live tag with that name
and the smallest id, `canonicalTags`); when no live tag has the name, the
push creates one (`tags` row, UUIDv7), ahead of the links. A session counts as
already tagged when it has a live link to a live tag of that name — what
every reader shows. Remove Tag offers the names on the selected sessions and
tombstones every live link of a selected session to any tag of that name,
live or deleted, as `removeSessionTag` does.
_Deviation noted:_ the phone's `addSessionTag` also counts a link to a
_deleted_ tag of the same name as "already tagged", so on the phone re-adding
a deleted-then-recreated name is a silent no-op that shows nothing. The web
follows what the reader shows instead. P1 pins the cases where both agree.

**B8. Location: trimmed, blank clears.** As the phone's session edit: the
typed text is trimmed, a blank one stores `null`, at most 200 characters.
Suggestions come from the locations already in the logbook.

**B9. The action applies to the selected sessions that the filter shows.**
The page lists every live session, newest first, with From/To dates and a
search (name, location, tag). Ticking a filter does not silently carry
hidden sessions into an edit: the button names the count it will change, and
it is the selected sessions currently shown.

**B10. No new dependency.** The page uses `uuidv7` (already a web
dependency since #669) and `crypto.randomUUID()`.

## 3. Design

### 3.1 Builder (`shared/src/sync-client/bulk-edit.ts`, pure)

```ts
type BulkAction =
  | { kind: 'addTag'; name: string }
  | { kind: 'removeTag'; name: string }
  | { kind: 'setFirearm'; firearmId: string | null }
  | { kind: 'setLocation'; location: string };

buildBulkEdit(action, sessionIds, context, deps) →
  { ok: true; changes; summary: { changed; unchanged; missing } }
  | { ok: false; errors: BulkError[] }
```

`context` holds the freshly pulled tables (`sessions`, `tags`,
`session_tags`, `firearms`, `series`, `shots`, `falt_stations`), payloads as
the wire carries them. A row is live when it is present (the pull drops
server tombstones) and its payload's `deleted_at` is null or absent.
`deps = { newId, newChangeId, now }` as #669's `EntryDeps`.

- Duplicate ids in `sessionIds` count once.
- Errors: `noSessions` (empty selection), `blankTag`, `tooLong` (`tag` 120,
  `location` 200), `unknownFirearm` (target not live), `nothingToChange`,
  `tooManyChanges` (`max`, `needed`).
- Changes: an edited session is `{ ...pulled, <column>: value, updated_at:
now }`; a new link is the full `session_tags` row (`id`, `created_at`,
  `updated_at`, `deleted_at: null`, `session_id`, `tag_id`); a new tag is the
  full `tags` row; an unlink is a tombstone (`payload: null`,
  `deletedAt = updatedAt = now`); a firearm is `{ ...pulled, round_count,
rounds_since_maintenance, updated_at: now }`. Every change has a fresh
  `clientChangeId` and `rowId = id`, and the list is in `APPLY_ORDER`
  (firearms, tags, sessions, session_tags).

### 3.2 Page (`web/src/bulk/`)

A **Bulk Edit** page in the menu (`#bulk`), after Enter Series.

- **Filter:** From, To (local dates, inclusive), Search.
- **List:** a table of the shown sessions — Date, Name, Discipline,
  Location, Firearm, Tags — with a checkbox per row and one in the header
  that selects or clears every shown row.
- **Action:** a picker (Add Tag, Remove Tag, Change Firearm, Change
  Location) and its value: a tag name with suggestions; a tag from the
  selection; a firearm or None; a location with suggestions. **Apply to N
  Sessions** builds and pushes.
- **Outcome** (`web.bulk.*`), following #669 §3.5:

| Outcome                     | Message                                               | Kept                    |
| --------------------------- | ----------------------------------------------------- | ----------------------- |
| applied                     | Changed N sessions (M already were, K no longer here) | selection cleared       |
| applied, some refused       | … and R changes were refused (deleted elsewhere)      | selection cleared       |
| applied, refresh failed     | … Reload the page to see it                           | selection cleared       |
| network                     | Could not reach the server: **Retry**                 | selection, request held |
| unauthenticated             | Signed out: sign in again (inline), then **Retry**    | selection, request held |
| versionUnsupported, unknown | This page is out of date / Could not save             | selection               |
| offline                     | You are offline. Saving needs a connection            | Apply disabled          |
| builder error               | per error (blank tag, too long, too many, …)          | selection; nothing sent |

After a push that answered (applied or partly refused), the account is
pulled again (`refresh`), so every page shows server truth. Changing the
action, its value or the selection drops a held request, as editing the
entry form does.

## 4. Scenarios

Every scenario maps 1:1 to a named test (name = id + title).

```gherkin
Feature: bulk builder (shared/src/sync-client/bulk-edit.test.ts)
  Scenario: K1 add an existing tag: one session_tags row per untagged session, on the canonical tag id
  Scenario: K2 add a new tag name: one tags row first, then the links to it
  Scenario: K3 a session with a live link to a live tag of that name is unchanged; a link to a deleted tag does not count
  Scenario: K4 the tag name is trimmed; blank → blankTag; over 120 → tooLong(tag)
  Scenario: K5 remove a tag: a tombstone per live link to any tag of that name (live or deleted), none for other sessions
  Scenario: K6 remove a tag no selected session has → nothingToChange
  Scenario: K7 change firearm: each moved session is its pulled payload with firearm_id changed and updated_at now; unknown keys survive
  Scenario: K8 change firearm moves the counters: source −volume, target +volume, summed per firearm, floored at 0, both counters
  Scenario: K9 volume counts live series (sighters), total-only series, extra rounds and fält stations; deleted rows do not count
  Scenario: K10 a source firearm that is not live is not pushed; None moves rounds off and onto nothing; zero volume pushes no firearm
  Scenario: K11 an unknown or deleted target firearm → unknownFirearm
  Scenario: K12 change location: trimmed, blank → null, over 200 → tooLong(location), same location unchanged
  Scenario: K13 selected sessions not live (absent, or deleted_at in the payload) are counted missing and not written
  Scenario: K14 empty selection → noSessions; duplicates count once; nothing changing → nothingToChange
  Scenario: K15 over PUSH_BATCH_MAX changes → tooManyChanges(max, needed), exactly 500 is allowed
  Scenario: K16 every change parses with ClientChangeSchema, ids fresh, rowId = id, updatedAt = now, in APPLY_ORDER
  Scenario: K17 property: for any selection over a random logbook, the built edit applied to that logbook yields every selected live session in the asked state and touches no other session

Feature: on the phone's schema (app/src/db/queries/web-bulk.test.ts, vitest + better-sqlite3)
  Scenario: P1 add tag: web changes applied with applyChangesSync give the same listTagsForSession as getOrCreateTag + addSessionTag on a twin
  Scenario: P2 remove tag: same as removeSessionTag on a twin
  Scenario: P3 change firearm: same sessions and same firearm counters as updateSession on a twin
  Scenario: P4 change location: same as updateSession on a twin
  Scenario: P5 nothing applied is re-queued (the outbox stays empty after apply)

Feature: round trip (backend/test/web-bulk.spec.ts, Workers pool, real D1)
  Scenario: W1 a bulk retag with a new tag, pushed through the real HTTP transport, is pulled by a second device
  Scenario: W2 a bulk firearm change: device B pulls the sessions and both firearms' counters
  Scenario: W3 resending the same request answers duplicate for every change and moves nothing twice
  Scenario: W4 a session tombstoned by device B first: its change is rejected, the rest applied

Feature: page model (web/src/bulk/*.test.ts)
  Scenario: U1 the list: live sessions only, newest first, with firearm label and tag names
  Scenario: U2 the filter: From/To by local day, inclusive; Search matches name, location or a tag, case-insensitively
  Scenario: U3 the target is the selected sessions that are shown
  Scenario: U4 Remove Tag offers the tag names on the target sessions only
  Scenario: U5 offline blocks Apply and names the reason
  Scenario: U6 a network or sign-out failure holds the request; Retry resends it identically; a builder error sends nothing
  Scenario: U7 an answered push refreshes; a failed refresh says reload
  Scenario: U8 an edit drops the held request
```

Browser checks (not automated; screenshots in the session scratchpad, never
in the repo): filter a season, select all shown, add a new tag; remove it
again; change the firearm on several sessions and read both counters back;
move sessions to another location; a Retry after a dropped response changes
nothing twice; the Swedish UI.

## 5. Must NOT

- **N1** No shooting data in browser storage: no `localStorage`,
  `sessionStorage` or IndexedDB in `web/src/bulk/` (grep gate, like #669's).
- **N2** No outbox and no automatic retry: a push happens only on Apply or
  Retry (U6).
- **N3** No new endpoint, no protocol change, no schema change (K16, W1).
- **N4** No column dropped from a rewritten row, no `NOT NULL` column as
  `null` (K7, P1–P4).
- **N5** No row outside the action is written: only the selected sessions,
  their links, the one new tag and the affected firearms (K1–K13, K17).
- **N6** No `settings` read or written; no ammo-lot row written.
- **N7** The phone's behaviour does not change: no `app/src` source edit;
  `pnpm check` stays green.

## 6. Not in this layer: merging duplicate ammo lots

ADR 0019 sketches it as "repoint every session, then tombstone the
duplicate". It is left for its own layer because it is the one bulk edit that
deletes a row other devices reference, and that needs decisions this layer
does not: what happens to a session on a phone that has not pulled the
repoint when the tombstone arrives (the FK still holds, since tombstones are
soft, but the session then names a deleted lot); whether the kept lot's
counts or notes absorb the duplicate's; and how a phone that edits the
duplicate offline after the merge is resolved (its edit is rejected as
`tombstoned`, and the phone's shadow then hides its local change).

## 7. Setup plan

- **Isolation:** worktree `~/tmp/sl-301-bulk`, branch `feat/web-bulk-edit`
  on top of `feat/web-series-entry-impl` (#669). The main checkout is shared
  with other sessions.
- **Git:** spec committed first, then one checkpoint commit per green layer
  (builder, phone test, backend test, page, docs, evidence). DCO-signed
  Conventional Commits, explicit paths.
- **Gauntlet:** existing. `pnpm check` (100% coverage on the
  `stryker.config.json` globs, which already include
  `shared/src/sync-client/*.ts`), Stryker on the new module, fast-check (K17),
  the backend Workers pool (W1–W4), the docs gates.
- **New dependencies:** none.

## 8. Revisions

Added during implementation; none loosens a scenario or a Must NOT.

- **R1 (scope).** `web/src/entry/entry.tsx` exports three helpers it already
  had (`SignInAgain`, `useOnline`, `locationUsage`) so the Bulk Edit page
  reuses them instead of copying them; their behaviour is unchanged.
- **R2 (scope).** `web/src/styles.css`: at phone width the menu now wraps,
  because a fourth menu item pushed the page wider than the screen.
- **R3 (gauntlet).** `scripts/manual-mutation-web-bulk.mjs` (new) runs hand
  mutants against the K17 property alone, the phone twin test and the page
  modules, which are outside Stryker's list.
- **R4.** The firearm rows are written in the order the sessions first touch
  them, not sorted by id; the change list is in `APPLY_ORDER` by
  construction, so the builder no longer sorts it (K16 pins the order).

Added after an independent verifier failed the first version (2026-10-07).
**Each needs the maintainer's OK; R5 changes B3's "one Apply is one push".**

- **R5 (counter correction; fixes a confirmed bug).** The firearm rows carry
  absolute counters summed over every moved session. When the server refused
  one of those sessions (`tombstoned`), the firearm rows still landed, so the
  counters moved for a session that never moved (verifier's case: 3 + 2
  rounds onto a firearm at 10, the 2-round session refused → 15, should be
  13). Now the builder also returns its **counter plan** (each move and each
  firearm's pulled counters). After a push whose acks refuse a moved session,
  Apply pulls the firearms afresh and pushes a **correction**: each touched
  firearm, rebuilt from its fresh row, moved by _(counters without the
  refused sessions) − (counters the push wrote)_, both floored as the phone
  floors (`buildCounterCorrection`). A change another device made to that
  firearm in between survives; a firearm whose own row was refused, or that
  is gone, is left alone.
  - **Idempotent under Retry:** the correction is built once and held; a
    lost answer is retried by resending the identical correction (the
    server answers `duplicate`), never by building it again. It is built
    only after the edit's acks arrived, so a Retry of a lost edit (which
    replays the refusals as `duplicate` with their reason) builds it the
    first time, not a second time.
  - A held correction cannot be dropped by editing the form; Apply stays off
    until Retry has sent it. Closing the tab first leaves the counters
    counting the refused sessions; the page says so while it waits.
  - **Trade-off:** the edit and its correction are two transactions. Between
    them the counters are briefly wrong. The alternative (pushing the
    sessions first and the firearms only after their acks) makes every
    firearm change two requests and the counters lag on every one; this way
    only a refusal costs a second request.
  - Scenarios **K18** (the plan), **K19/K20** (the correction), **K21**
    (property: edit with random refusals, then correction = the phone's walk
    over the sessions that landed), **W5** (the verifier's case on the real
    Worker, including a resent correction), **R5** cases in
    `web/src/bulk/apply.test.ts`, and the page message (`messages.test.ts`).
- **R6 (tag deleted meanwhile).** Add Tag returns the tag it links. After an
  answered push, Apply pulls `tags` and, when that tag is no longer live,
  the page says the tag was deleted on another device and so does not show.
  An unanswered check says nothing. (Refusing up front is not possible: the
  links are separate rows and land regardless.)
- **R7 (no hang).** A builder that throws (for example a negative stored
  shot count) ends in "Could not save", not in a page stuck on "Saving…".
- **R8 (page wiring tested).** The form → action, the re-pulled table list
  and the targets moved out of the component into `web/src/bulk/request.ts`,
  and the outcome → message mapping into `messages.ts`, both with tests, so
  dropping `shots` or `falt_stations` from the re-pull, or sending every
  selected session instead of the shown ones, fails a test.
- **R9 (test gap).** K9 adds an air-pistol total-only series with no stored
  count (10 rounds), so a builder that used Precision's 5 for every
  discipline fails.
- **R10 (B4 reworded, wording only).** B4 said the overwrite window was "the
  seconds between that pull and the push"; with Retry it runs from the first
  pull to the Retry, and the firearm counters are the rows it matters most
  for. B4 and the manual now say so.
- **R11 (found by the browser check of R5).** "Changed N sessions" counted a
  refused session as changed. The count now leaves out every session row the
  server refused.
- Also: the volume count indexes shots, series and stations once per Apply
  (it re-filtered the whole shots table per series: about 4 s for 300
  sessions and 36 000 shots; now about 10 ms).
