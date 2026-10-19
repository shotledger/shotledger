# Refuse a refused row's whole family (#856)

**Spec approved by the maintainer, 2026-10-16**, before implementation:
"Approve all", answering "Approve the #856 spec (PR #857) with my recommended
answers to Q1–Q4?" (old-coder, Tier 3: the sync engine's push path).

Follow-up to #697 (PR #813): `sync-payload-validation-spec.md` §10 and Q7.

## 0. In short

Today the server refuses rows one at a time. When one row of a session is
refused, the rest of the session still reaches other devices: orphaned
series and shots when the session row is refused, or a different score when
one shot is refused.

This spec makes a session reach other devices **whole or as it was before the
refusal**, and stops a refused firearm's licenses and other rows from
arriving without it. It takes two parts, because the server alone cannot do
it:

1. **The server, within one push**: when a row is refused, it also refuses
   the rows of the same push that belong with it, using a new reason
   `family_refused`.
2. **The phone, across pushes**: it remembers which rows the server refused
   and **holds back** later changes to their family, keeping them queued but
   unsent, until the refused row is fixed. Account & Sync shows how many
   changes are held.

The phone pushes while you shoot (400 ms after each write), so a session
normally reaches the server over several pushes: the session row first,
then series and shots as you enter them. The server sees only one push at a
time and cannot know what an earlier push refused, so part 2 is the part
that covers the common case. Part 1 covers the first push that contains the
bad row.

## 1. Today (on `main` after #813)

- `/sync/push` validates each live change (`validatePayload`), passes the
  indexes of invalid ones to `applyPush`, which records each as `rejected` /
  `invalid_payload` inside the one-transaction batch, consuming no seq. The
  rest of the push lands (`sync-payload-validation-spec.md` C6).
- The phone's `runPush` reads up to `PUSH_BATCH_MAX` (500) outbox entries in
  `rev` order, pushes them, and **clears every acked entry**, rejected ones
  included (C3). It counts `invalid_payload` acks and Account & Sync shows
  "n change(s) refused by the server and not synced" for the app session.
- A refused row stays on the phone, unsynced, until a local write queues it
  again (the outbox trigger) or a pull replaces it.
- The phone queues a row from SQLite triggers on every write; the sync
  controller pushes 400 ms after the last write.

Two shapes of split family follow:

- **Refused parent**: a session with `name: null` is refused; its series and
  shots, in the same push or later ones, are stored and reach every device
  as orphans.
- **Refused child**: one shot is refused; the session's other shots are
  stored and other devices show a different score from the sender's.

## 2. Design

### 2.1 Families (`shared/src/sync/family.ts`)

A **family** is a root row and the rows that belong to it through
**ownership** foreign keys. Ownership edges (child column → parent table):

| Child table          | Column       | Parent     |
| -------------------- | ------------ | ---------- |
| `series`             | `session_id` | `sessions` |
| `shots`              | `series_id`  | `series`   |
| `falt_stations`      | `session_id` | `sessions` |
| `session_tags`       | `session_id` | `sessions` |
| `licenses`           | `firearm_id` | `firearms` |
| `firearm_groups`     | `firearm_id` | `firearms` |
| `firearm_calibers`   | `firearm_id` | `firearms` |
| `maintenance_events` | `firearm_id` | `firearms` |
| `sight_settings`     | `firearm_id` | `firearms` |

**References**, not ownership: `sessions.firearm_id`, `sessions.ammo_lot_id`,
`session_tags.tag_id`. A refused firearm does not hold back the sessions shot
with it; a refused tag does not hold back the sessions it labels. `ammo_lots`,
`tags` and `settings` have no family.

The map is written out, not inferred (C1). A test reads every foreign key of
every synced Drizzle table (`getTableConfig(table).foreignKeys`) and fails
unless each one is in exactly one of the two lists, so a new foreign key
must be classified before it can ship.

Two kinds of family, by what a split breaks (C2):

- **Session family (whole)**: `sessions` and everything under it. A refused
  member holds back **every** other member: siblings, ancestors and
  descendants. A session's score is computed from all of them.
- **Firearm family (no orphans)**: `firearms` and its rows. A refused
  **firearm** holds back its rows; a refused license, group, caliber,
  maintenance event or sight setting holds back only itself. Each of those
  rows is a fact on its own; the firearm without it is still correct.

**Tombstones are never held or family-refused** (C3). A deletion always
propagates; a deleted row cannot be orphaned or skew a score in a way that
matters, and holding a deletion back would resurrect data on other devices.

### 2.2 Server: family refusal within one push

A pure function, `familyRefusals(changes, invalid) → Set<index>`, in
`shared/src/sync/family.ts` (Apache-2.0, so the Worker may compile it):

- Each live change is a node `(table, rowId)`. Its parent is the node named
  by its ownership column in its payload, whether or not that parent is in
  the push (then it is a bare id node that links its children).
- From each invalid change:
  - **down**: every live change below it, through any chain of nodes in the
    push;
  - **session family, also up and across**: every live change in the same
    connected component (parent links in both directions, bare id nodes
    included).
- The result excludes the invalid changes themselves (they keep
  `invalid_payload`) and tombstones.

The route calls it after the per-change validation and passes `applyPush` a
per-change verdict instead of `invalid: Set<number>`: `valid`,
`invalid_payload`, or `family_refused`. In the batch SQL, `?valid` becomes
`?reason IS NULL`, and the idempotency record stores the reason. A
`family_refused` change consumes no seq, stores nothing, and replays as
`duplicate` with its reason, like `invalid_payload`. A tombstoned row still
reports `tombstoned` (C11 of the #697 spec, unchanged).

The route logs one line per push with family refusals: the count and the
tables, never ids or values.

`REJECTED_FAMILY = 'family_refused'` joins the reasons in `merge.ts`.
`PROTOCOL_VERSION` stays 1 (rule 8); the ack shape is unchanged.

**What the server cannot see** (C4): rows linked only through a row that is
not in the push and not named by an id in it. For example, two shots in
different series of a session, pushed without their series: one refused
leaves the other stored. The phone's hold (§2.3) covers every later push;
this gap is only within the push that first carries the bad row.

### 2.3 Phone: hold a refused row's family across pushes

> **Superseded by Revision 3 (§11, not approved).** Kept as the approved
> text until the maintainer approves §11.

New local state (a Drizzle migration on the phone, `app/src/db/migrations/`;
local tables, not synced):

- `sync_refused (table_name, row_id)`, primary key both. A row whose latest
  pushed version the server refused as `invalid_payload`.
- `sync_outbox.held INTEGER NOT NULL DEFAULT 0`. A held entry stays queued
  but `readOutbox` skips it.

`runPush` changes (`shared/src/sync-client/engine.ts`, ports in `ports.ts`):

1. **Before reading the outbox**, release: any `sync_refused` row that is
   queued again in the outbox (a local write since the refusal) leaves
   `sync_refused`; if any row left, every held entry is un-held, to be
   judged again in step 2.
2. **For each entry read**, before building its change: if it is live and
   its family is blocked, mark it held and do not send it. Blocked means:
   - session family: any `sync_refused` row has the same root session
     (`familyRoot` walks `shots → series → sessions` in the local DB);
   - firearm family: its firearm is in `sync_refused`.
3. **On an `invalid_payload` ack**: clear the entry (as today), add the row
   to `sync_refused`, count it (as today).
4. **On a `family_refused` ack**: do not clear it. Set it held and reset its
   `client_change_id` to null, so it is sent as a new change once released
   (the server keeps the old id's refusal for idempotency). Rev-matched, as
   clearing is: a write that landed mid-push already reset the id.
5. A held entry is excluded from `readOutbox`, so it never spins the
   iteration cap (the reason #697's C3 cleared rejected entries).

A local edit of a held row updates its entry through the trigger (`rev`,
`client_change_id = NULL`) and leaves `held` as it is: still held. A new row
in a blocked family (a new shot in a refused session) gets an unheld entry
and is held at step 2.

**Pulls**: when a pulled change is applied to a row in `sync_refused`, the
row leaves `sync_refused` (another device's version replaced it, and it is
valid, since the server stored it), and held entries are released for step 2.

**The refused row is fixed by**: an edit of it, its deletion, or a pull
replacing it. Each re-queues or replaces it, which releases its family; the
family then pushes on the next cycle, with the fixed row.

### 2.4 What the user sees

> **Superseded by Revision 3 (§11, not approved).** Kept as the approved
> text until the maintainer approves §11.

- Account & Sync keeps "n change(s) refused by the server and not synced"
  (app-session count, unchanged).
- New line while any entry is held: "n change(s) waiting on a refused change"
  (en) / "n ändring(ar) väntar på en nekad ändring" (sv), counted from
  `sync_outbox.held`, so it survives an app restart (C5).
- The manual (`docs/manual/guides/backup-and-restore{,.sv}.md`, which explains the refused
  count) says what the new line means and that editing the refused entry
  sends the rest.
- The web is unchanged: `direct-push.ts` already reports any rejection as
  `partlyRejected` with its reason, and every web save says a rejected save
  did not land. A web save pushes a whole session in one push, so part 1
  covers it. A test pins that `family_refused` arrives there.

### 2.5 Out of scope

- Foreign-key checking in general (#697 C14, Q4): orphans the phone already
  creates (a parent tombstoned in between, a child pushed before its parent)
  are unchanged. This spec adds no refusal for a missing parent.
- Rows of a family already stored before the refusal stay stored; other
  devices show the family as it was before the bad row (C6).
- Retroactive holding on the server (a `sync_held` table that keeps
  family rows server-side until the blocker is fixed): rejected as C4's
  alternative.

## 3. Key choices

- **C1 The ownership map is an explicit list, checked against the Drizzle
  foreign keys.** Alternative: infer it from the foreign keys. That would
  make `sessions.firearm_id` an ownership edge and hold back every session
  shot with a refused firearm. The test makes the list complete by
  construction.
- **C2 Sessions are held whole; firearms only downward.** A session's score
  depends on all its rows; a firearm's license is a fact of its own.
  Alternative (a): hold firearms whole too. One bad maintenance event would
  then hold back the firearm's license and round-count edits on every
  device until fixed. Alternative (b): only downward everywhere. A refused
  shot would still skew the score on other devices, which is the issue's
  second example.
- **C3 Tombstones are never held.** A deletion that waits behind a refusal
  would leave other devices showing data the user deleted.
- **C4 The server decides within one push; the phone holds across pushes.**
  _Superseded by Revision 3 (§11, not approved), which takes the
  alternative below._
  Alternative: the server keeps refused families (a `sync_blocked` /
  `sync_held` pair of tables, released when the blocker arrives valid,
  with every later push checked against them through `json_extract`
  lookups inside the batch). It would cover the web across saves too, but
  it is a new server state machine in the one-transaction batch, with seq
  allocation for released rows, and the phone would still need to know
  why its rows did not appear. The phone already has the local family
  structure.
- **C5 A held entry stays in the outbox, flagged, rather than moving to a
  separate table.** The trigger already upserts on `(table, row)`, so a
  later edit of a held row updates the same entry, and the existing
  rev-match keeps a mid-push write safe. The count survives a restart for
  free. Alternative: a separate held table, which every trigger write would
  have to check.
- **C6 No rollback of rows already stored.** Rows pushed before the bad row
  are valid and other devices already have them. Holding later changes
  freezes the family at that state, which is consistent (it is what the
  sender had then). Alternative: tombstone them on the server, which
  would delete the user's data on other devices.
- **C7 `family_refused` is its own reason.** The phone must treat it
  differently from `invalid_payload` (hold, not clear), and the user is
  told separately. Alternative: reuse `invalid_payload`, which would clear
  valid rows and lose them to sync until each is edited.

## 4. Scenarios

User `u`. `S` is a valid session payload for `s1`, `R1`, `R2` valid series of
`s1`, `T1`…`T4` valid shots (`T1`, `T2` in `R1`; `T3`, `T4` in `R2`). A `*`
marks an invalid payload (`name: null` for a session, `value: -1` for a shot).

```gherkin
Feature: the server refuses a refused row's family within one push

  Scenario: F1 a refused session refuses its whole push family
    When a push sends S*, R1, T1, T2
    Then S* is rejected "invalid_payload"
     And R1, T1, T2 are rejected "family_refused", with no seq
     And sync_rows holds none of them, and last_seq is unchanged

  Scenario: F2 a refused shot refuses its session's push family
    When a push sends S, R1, R2, T1*, T2, T3
    Then T1* is rejected "invalid_payload"
     And S, R1, R2, T2, T3 are rejected "family_refused"

  Scenario: F3 siblings linked through a bare parent id
    When a push sends T1*, T2 (R1 not in the push)
    Then T2 is rejected "family_refused"

  Scenario: F4 rows the push does not link are not refused (C4)
    When a push sends T1*, T3 (neither R1 nor R2 in the push)
    Then T3 is applied

  Scenario: F5 other families in the same push are untouched
    Given a second session s2 with series and shots, all valid
    When one push sends s1's family with T1* and s2's family
    Then every s2 row is applied

  Scenario: F6 a refused firearm refuses its rows; a refused license does not refuse the firearm
    When a push sends F*, L1 (license of F), G1 (group of F)
    Then L1 and G1 are rejected "family_refused"
    When a push sends F, L1*, G1
    Then F and G1 are applied, L1* is rejected "invalid_payload"

  Scenario: F7 references are not families
    Given a firearm f9 refused "invalid_payload"
    When a push sends a valid session whose firearm_id is f9
    Then the session is applied

  Scenario: F8 tombstones are never family-refused
    When a push sends S*, and a tombstone of T5 (a shot of s1)
    Then the tombstone is applied

  Scenario: F9 a family-refused change replays as a duplicate with its reason
    Given F1 was pushed
    When the same push is sent again with the same clientChangeIds
    Then R1, T1, T2 ack "duplicate", reason "family_refused", no seq

  Scenario: F10 a tombstoned row still reports tombstoned
    Given s1's series R1 is tombstoned on the server
    When a push sends S*, a live R1
    Then R1 is rejected "tombstoned"

  Scenario: F11 the ownership map covers every foreign key
    Then every foreign key of every SYNC_TABLES table is in exactly one of
         the ownership and reference lists, and every listed edge is a
         foreign key

Feature: the phone holds a refused row's family across pushes

  Scenario: H1 rows recorded after a refused session row are held
    Given the session row s1 was pushed alone and refused "invalid_payload"
    When the user then enters R1, T1, T2
    Then no push carries R1, T1 or T2
     And Account & Sync shows "3 changes waiting on a refused change"
     And the server holds no row of s1

  Scenario: H2 fixing the refused row sends the family
    Given H1
    When the user edits s1 so its row is valid
    Then the next cycle pushes s1, R1, T1, T2, all applied
     And no entry is held

  Scenario: H3 rows refused as family are held, not lost
    Given F1's push came from the phone
    Then R1, T1, T2 stay queued and held, with no client change id
    When the user fixes s1
    Then R1, T1, T2 are pushed with new client change ids and applied

  Scenario: H4 a refused shot freezes the session on other devices
    Given s1, R1, T1 are on the server
    And T2 was pushed and refused "invalid_payload"
    When the user enters T3 and renames s1
    Then neither T3 nor s1's rename is pushed while T2 is refused
     And other devices keep s1, R1, T1 as they were

  Scenario: H5 a refused firearm holds its rows; its other changes flow once fixed
    Given firearm f1 was refused
    When the user adds a license to f1
    Then the license is held
    And when the user adds a session shot with f1, the session is pushed

  Scenario: H6 a refused license holds only itself
    Given license l1 of f1 was refused
    When the user edits f1's name and adds a group to f1
    Then both are pushed

  Scenario: H7 deleting the refused row releases the family
    Given H1
    When the user deletes the session s1
    Then the deletions are pushed and applied, and nothing is held

  Scenario: H8 a pull that replaces the refused row releases the family
    Given T2 is refused
    When a pull applies another device's valid T2
    Then T2 leaves the refused set and the held rows are pushed next cycle

  Scenario: H9 held entries never stall the outbox
    Given 600 held entries and 10 unheld ones
    When a cycle runs
    Then the 10 are pushed in one iteration and the cycle drains

  Scenario: H10 tombstones are never held
    Given s1 is refused
    When the user deletes T1 (a stored shot of s1)
    Then the deletion is pushed

  Scenario: H11 the held count survives a restart
    Given H1, and the app restarts
    Then Account & Sync still shows "3 changes waiting on a refused change"

  Scenario: H12 the web reports a family refusal as a save that did not land
    When a web save of a new session with an invalid shot is pushed
    Then direct-push reports partlyRejected with reasons invalid_payload
         and family_refused, and the page says the save did not land
```

## 5. Must NOT

- N1 `PROTOCOL_VERSION` stays 1; `PushAck`, request shapes and status codes
  are unchanged; only a new `reason` value appears.
- N2 The pull path is unchanged on the server.
- N3 The atomicity scenarios of `sync-push-atomicity-spec.md` and the
  payload-validation scenarios P1–P12 pass with unchanged assertions.
- N4 A valid change in a family with no refused member behaves exactly as
  today (applied, cleared, counted as pushed).
- N5 No server-side foreign-key check; a child whose parent is absent from
  the server and the push is applied as today.
- N6 No id or value in a log line or ack.
- N7 No new dependency.
- N8 No test assertion weakened.

## 6. Failure model

| Failure                                               | Caught by                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| A valid change refused because of a wrong family link | F4, F5, F7, N4; property: a push with no invalid row is unaffected |
| A family member slips through within a push           | F1–F3, F6; property over generated session trees                   |
| A held row is never released                          | H2, H3, H7, H8; H13 (Revision 2 item 7)                            |
| A held entry spins the push loop                      | H9                                                                 |
| A held edit overwrites another device's later change  | H14, H15 (Revision 2 item 8); H17 (Revision 2 item 10)             |
| A held edit is dropped for an older pulled change     | H16, its control (Revision 2 item 9)                               |
| A held row is lost (cleared without being sent)       | H3; engine tests on rev-matched hold; H16 (Revision 2 item 9)      |
| A new foreign key ships unclassified                  | F11                                                                |
| Seq consumed or half-write on a family refusal        | F1 `last_seq`; atomicity suite unchanged                           |
| Old reasons change meaning                            | N3; F10                                                            |

## 7. Gauntlet

| Layer                    | How                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root gates               | `pnpm check` (100% coverage on gauntlet modules: `family.ts` joins `stryker.config.json`'s `mutate`)                                             |
| Backend suite            | F1–F11 in `backend/test/sync-family-refusal.spec.ts`; H1–H10 end to end in `sync-client.spec.ts`                                                 |
| Mutation                 | `pnpm mutation` over `family.ts` and the engine; `scripts/manual-mutation-sync-push.mjs` gains the reason mutants                                |
| Property-based           | fast-check over random session/firearm trees and random invalid sets: the refused set is exactly the expected family, never another family's row |
| Real execution           | the real engine against the real Worker (`sync-client.spec.ts`)                                                                                  |
| Suite health             | backend and root suites with `--sequence.shuffle`                                                                                                |
| Independent verification | a separate verifier pass on the final state (Tier 3)                                                                                             |

## 8. Setup plan

- **Branch:** `feature/856-sync-family-refusal`, from `main` once #813 is
  merged. Conventional Commits, `git commit -s`, explicit paths only.
- **Files:**
  - `shared/src/sync/family.ts` (+ test, property test), `merge.ts`
    (`REJECTED_FAMILY`), `stryker.config.json`
  - `backend/src/routes/sync.ts`, `backend/src/db/queries.ts`,
    `backend/test/sync-family-refusal.spec.ts`, `sync-client.spec.ts`,
    `scripts/manual-mutation-sync-push.mjs`
  - `shared/src/sync-client/engine.ts`, `ports.ts`, `status.ts` (+ tests)
  - `shared/src/sync/schema.ts` (`sync_outbox.held`, `sync_refused`), a new
    migration in `app/src/db/migrations/`, `app/src/db/queries/sync-store.ts`
  - `app/src/app/account.tsx`, `app/src/i18n/{en,sv}.json`
  - `docs/manual/` (en + sv), `docs/specs/sync-family-refusal-evidence.md`,
    `docs/implementation-plan.md`
- **New dependencies:** none.

## 9. Risks

- **The local family walk is wrong for a row whose parent is missing
  locally** (an orphan the phone already holds): `familyRoot` returns the
  topmost row it can reach, so the orphan forms its own family. Covered by
  a unit test; harmless.
- **A refusal that no edit can fix** (a writer bug the user cannot reach in
  the UI) now holds the family until an app update fixes the writer and
  the user edits the row. Today the same refusal loses one row; with this
  change it keeps a session off other devices. The held count makes it
  visible. See Q3.
- **Held rows on a phone that is wiped or replaced** are lost to sync, as
  any unsynced change is today.

## 10. Questions for the maintainer

- **Q1** Approve the design: the server refuses within one push, and the
  phone holds back the rest of the family across pushes (C4)?
- **Q2** Sessions whole, firearms only downward (C2)? Recommended.
- **Q3** A refused row that the user cannot fix from the UI holds its
  session back until an app update. Accept, with the held count as the
  signal? Recommended; the conformance tests from #697 are what keep such
  rows from being written.
- **Q4** Show the held count on Account & Sync as a second line (§2.4)?
  Recommended.

## 11. Revision 3: the server remembers refused families (NOT approved)

**Status: not approved.** Written 2026-10-19 after verifier round 4 failed at
`12a2cc6`, on the maintainer's decision "Server remembers: the server keeps a
list of refused families. It refuses later rows of a family until the bad
row arrives fixed, so a lost response or a re-edit can't split it. The
phone-side hold is mostly removed." No code follows it until it is approved.

### 11.1 Why

All four verifier rounds failed in the same place: the phone kept hold state
the server could not see, so every gap between the two split a family or
lost an edit.

- **Round 1 (B1):** a held deletion stayed held.
- **Round 2:**
  - B-1: a hold with nothing left to release it.
  - B-2: a held edit overwrote another device's later one.
- **Round 3:**
  - B-1: this device's own pull echo dropped its held edit.
  - B-2: a failed push left still-blocked entries unheld.
- **Round 4:**
  - B-1: re-queuing a still-invalid row released its family (X9, X10).
  - B-2: a lost response or a crash in the ack loop split a family (X1,
    X1b, X8).
  - D-1: the clock rule was false in the first cycle of a hold (X7).

Two facts decide the design:

- **Only the server sees every push of every device.** So only the server
  can tell whether the bad row has arrived fixed.
- **The server orders writes by arrival** (`merge.ts`, R3: the push that
  reached the server last wins; no timestamp is compared). A change the
  server refused, and the phone sends again later, arrives late. Only the
  server can remember when it _first_ arrived and order it by that. Items 8
  and 9 tried to do this on the phone, with the pull and with clocks, and
  rounds 3 and 4 broke both.

### 11.2 What Revision 3 supersedes, and what stands

**Superseded:**

- **§2.3 (the phone holds a refused row's family across pushes), all of it.**
  That means `sync_refused`, `sync_outbox.held`, steps 1–5, the pull
  release, and "the refused row is fixed by".
- **§2.4 in part.** The held line stays, but it now counts what the server
  refused (§11.6).
- **C4** (the server decides within one push only).
- **C5** (a held entry stays in the outbox, flagged). The flag now caches a
  server verdict; it decides nothing.
- **N1 and N2 in part.** The protocol gains two fields and one reason, at
  `PROTOCOL_VERSION` 1 (§11.7).
- **Revision 2 items 7, 8, 9 and 10, entirely.** There is no phone-side
  hold left to release (7, 10), and no phone-side ordering rule (8, 9).
  Their code goes:
  - `releaseUnblocked`;
  - `readBlocked` / `isBlocked`;
  - `readHeld`;
  - `replacesHeldEdit`;
  - the held-drop in `runPull`.
- **Revision 2 item 6, entirely.** With no `held` flag, the triggers have
  nothing to clear on a soft delete. A tombstone is never refused, by the
  server (C3, §11.5), so a deletion always goes out.
- **The manual's held-change paragraph.** Its clock sentence goes, which
  fixes round 4's D-1.

**Stands as approved:**

- **§2.1:** families, the ownership and reference edges, C1, C2.
- **C3:** tombstones are never refused.
- **C6:** no rollback of rows already stored.
- **C7:** `family_refused` is its own reason.
- **§2.2:** the within-push family walk, extended in §11.4.
- **§2.5:** out of scope.
- **F1–F8, F10 and F11**, with F4 narrowed in §11.10.
- **H12** (the web): its page half is #863.
- **N3–N8.**
- **Revision 2 items 1–5.**

### 11.3 The server's tables (D1, `backend/`, ELv2)

These are the server's own tables. They are created by `SYNC_MIGRATIONS`
and its `backend/migrations/0000_sync_init.sql` mirror, edited in place (rule
8: the backend has never been deployed; `test/migrations-drift.spec.ts`
keeps the two copies equal). The Drizzle mirror is in
`backend/src/db/schema.ts`.

- **`sync_refusals`**, one row per refused row:
  - primary key `(user_id, table_name, row_id)`;
  - `reason` (`invalid_payload` | `family_refused`);
  - `parent_table`, `parent_row_id`, nullable: the ownership parent named
    by the refused change's payload, or null when it names none or cannot
    be read;
  - `refused_at`, the server's clock, for diagnostics only.

  An `invalid_payload` row is a **bad row**: it blocks its family. A
  `family_refused` row blocks nothing. It is remembered only for its
  parent link, so the family stays connected while the row itself is not
  stored. That is round 4's X8 shape: a new series and its shot, neither
  stored.

  The family root is computed when a push is judged, not stored, because a
  link can arrive after the refusal. For example, T1 refused before the
  server knew that its series R1 belongs to S1.

- **`sync_sequence.state_rev`**, a new column: `INTEGER NOT NULL DEFAULT
0`, bumped by every push batch that commits. It is two things:
  - the user's **arrival clock**: every change in one push arrives at that
    push's `state_rev`;
  - the **snapshot version** for §11.8.
- **`sync_rows.arrival_rev`**, a new column, `INTEGER NOT NULL`: when the
  stored version first arrived (§11.5). It equals the push's `state_rev`
  for a change applied on arrival, and the change's first arrival for a
  change that was refused first.
- **`sync_idempotency.arrival_rev`**, a new column, nullable: set on a
  `family_refused` record, to the push's `state_rev` the first time that
  `client_change_id` was refused.

### 11.4 When a family is blocked

A push is judged as a whole, from one snapshot (§11.8). The snapshot
includes:

- the user's `sync_refusals`;
- the stored rows that the walk below needs;
- `state_rev`.

**Parent links.** A live change's parent is found in this order:

1. its own payload's ownership column, when the change is in this push;
2. else its `sync_refusals` row's parent link;
3. else its stored row's payload in `sync_rows`.

The **root** is the topmost row the walk reaches. That can be a bare id
the server has never seen (§9's orphan rule). The walk is at most two steps
(shot, series, session).

**Bad rows.** The bad set is:

- the bad rows in `sync_refusals`, minus any of them this push carries as a
  valid live change or as a tombstone;
- plus the changes this push refuses as `invalid_payload`;
- minus the **inert** ones (below).

**Blocked.** A live change is refused `family_refused` when either:

- **session family:** a bad row of a session-family table has the same root;
- **firearm family:** its own firearm, or itself if it is a firearm row, is
  a bad `firearms` row.

So a bad license still blocks only itself, as C2 says. This covers every
later push and every device of the user (§11.9). It also covers rows whose
parents are absent from the push: the root comes from the stored rows and
the refusal links.

**Inert bad rows.** A bad row is inert when:

- it is tombstoned on the server; or
- its root is tombstoned on the server; or
- this push tombstones it or its root.

An inert bad row blocks nothing, and the batch deletes its `sync_refusals`
row. The user deleted what the refusal was about, so its family goes out
as it did before #856: under a deleted session, the server stores the rows
without a foreign-key check (N5). Round 2's H13 and round 3's V-D come out
the same way.

**In this push.** §2.2's walk stays. `familyRefusals` gains the stored and
remembered links, and the remembered bad rows as extra roots. So F1–F3 and
F6 hold within a push, and C4's within-push gap closes wherever the server
knows the link.

### 11.5 When a family is released, and how a late change is ordered

**Release.** The family is released when no bad row of its root is left.
A bad row's `sync_refusals` row is deleted, in the batch that does it,
when:

- it arrives as a **valid live change** and is applied, from any device or
  the web; or
- it arrives as a **tombstone** (C3: never refused); or
- it becomes **inert** (§11.4).

A **re-sent, still-invalid** bad row is refused `invalid_payload` again and
stays bad. A re-queue alone releases nothing, which fixes round 4's B-1
(X9, X10).

A **pull** releases nothing on the server; the server is the only judge.
On the phone, a pull is one of the retry signals (§11.6).

**A `family_refused` change is not final.** Today its idempotency record
makes a replay ack `duplicate` with the old verdict. Under Revision 3, a
replay of a `family_refused` `client_change_id` is judged again:

- still blocked: `family_refused` again, with the same `arrival_rev`;
- released: decided as below.

Only `applied`, `invalid_payload`, `tombstoned` and `superseded` are final.
This supersedes F9 (§11.10). It is what makes a lost response harmless
(X8): the second push decides afresh.

**Ordering a late change.** A change refused `family_refused` and applied
later carries its **first arrival**: the `arrival_rev` of its idempotency
record. Every other change arrives at its push's `state_rev`. A live change
whose row is stored:

- is applied when the stored `arrival_rev` is at most the change's
  arrival, and stores that arrival;
- is otherwise refused **`superseded`** (a new reason, final): a write that
  reached the server later already won.

This is R3, last arrival wins, with a refused change counted from when it
first arrived. It is the ordering items 8 and 9 tried to reach on the
phone.

- A normal change arrives after everything stored, so R3 is unchanged for
  normal traffic.
- R2 is unchanged: a live edit over a tombstone is `tombstoned`, whatever
  its arrival.
- The applied change still takes a new `seq`, so every device's pull
  cursor sees it.

**Precedence.** A live change is judged in this order:

1. `tombstoned` (R2, C11, F10);
2. `invalid_payload` (#697's validator, unchanged);
3. `family_refused`;
4. `superseded`;
5. `applied`.

An invalid change over a tombstoned row is reported `tombstoned`, as now,
and is **not** a bad row. Its row is deleted, so it blocks nothing.

### 11.6 The phone

**Kept:**

- **`sync_outbox.refused_arrival INTEGER`**, null when not refused. It
  replaces `held`. A `family_refused` ack sets it to the ack's `arrival`;
  the write is rev-matched, as clearing is.
- **The outbox trigger** sets it back to null with `client_change_id` on
  every write of the row. A new local version is a new change, with a new
  arrival.
- **The entry is never cleared on `family_refused`.** It stays queued with
  its `client_change_id`, which is no longer reset, so a replay finds its
  first arrival (§11.5).

**Removed:**

- `sync_refused`;
- `held`;
- every family walk on the phone;
- item 6's trigger clause;
- items 7–10's engine code.

`shared/src/sync/family.ts` stays; the server uses it.

**Retry.** A refused entry (`refused_arrival` set) is skipped by
`readOutbox` except in a retry pass. Each entry is sent at most once per
pass; within a cycle the read walks forward by `rev`, so a refused entry
cannot spin the iteration cap (H9). A cycle makes one retry pass when any
of these holds:

- its pull returned at least one change;
- its push had an `applied` ack;
- it is the first cycle since the app started.

A family is released only by a write the server applies: the fix, a
deletion, or a deletion of the root. Each of those reaches this phone either
as an `applied` ack (its own write) or as a pulled change (another device's
write or the web's). So the retry signal cannot miss a release, and it
needs no timer or clock (the `shared/` rule).

The cost is one resend of the refused entries per signal. While the user
scores a blocked session, only the new entries go out: the server refuses
them, nothing is applied, so nothing signals.

**Shadowing.** A pulled change for a row with a queued entry:

| The queued entry is… | The pulled change is…                                          | Result                                                                                               |
| -------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| not refused          | anything                                                       | shadowed, as today. The entry goes out this cycle, arrives last, and wins                            |
| refused              | a tombstone                                                    | applied, and the entry dropped (rev-matched, before the apply). R2 would reject the edit             |
| refused              | live, its `arrival` greater than the entry's `refused_arrival` | applied, and the entry dropped. It reached the server after the refused change first did, so it wins |
| refused              | live, its `arrival` not greater                                | shadowed. The refused change first arrived later and will win when released                          |

The pull carries each row's `arrival_rev` as `arrival` (§11.7). So the phone
applies the server's own order and no clock: there is no `updatedAt`
comparison.

- **This device's own echo** (ECHO, H16) is older than its own refused edit,
  so it is shadowed.
- **Another device's later edit** (round 2's A-name/B-name, X7) has a
  greater arrival. It wins.

A `superseded` ack clears the entry. The winning version reaches the phone
by pull: it was never shadowed by this entry, because the table above
shadows only what the entry beats.

**What the user sees (§2.4, revised):**

- "n change(s) waiting on a refused change" counts outbox entries with
  `refused_arrival` set. The server's acks set it, and it survives a restart
  (C5's reason).
- "n change(s) waiting to upload" counts only the entries not refused, so a
  waiting change is no longer counted on both lines (round 4's N-2).
- The refused line, the app-session `invalid_payload` count, is unchanged.

The manual's held paragraph says:

- the server holds the family back until the refused change arrives fixed,
  or until it or its session is deleted, from any device;
- changes to that session from other devices wait too;
- when two devices change the same entry, the change that reached the
  server last wins, and a waiting change counts from when it first reached
  the server.

### 11.7 Protocol

Changed in place, at `PROTOCOL_VERSION` 1 (rule 8):

- `ChangeRow.arrival`: the row's `arrival_rev`.
- `PushAck.arrival`: on a `family_refused` ack.
- `superseded`: a new rejection reason.

This supersedes N1's "only a new `reason` value appears", and N2's
"the pull path is unchanged on the server". N6 stands: `arrival` is a
counter, not an id or a value.

The web's `direct-push.ts` reports `superseded` and `family_refused` as
`partlyRejected`. The page's message is #863.

### 11.8 Idempotency and atomicity

- **One batch.** Recording and deleting `sync_refusals` rows, the
  idempotency records (with `arrival_rev`), the applies with their `seq` and
  `arrival_rev`, and the `state_rev` bump all go into the push's one D1
  batch, one transaction. A refusal is never recorded without the push's
  other outcomes, or the reverse.
- **Snapshot check (optimistic).** The route judges the push from a
  snapshot, so another device's push can commit between the read and the
  batch. Every statement in the batch therefore carries the guard
  "`state_rev` still equals the snapshot's", and the batch's last statement
  bumps `state_rev` under the same guard. A batch whose guard fails writes
  nothing.
  - The route sees that the bump did not happen, then reads and judges
    again, at most 3 times.
  - After that it answers 503, and the phone backs off as for any failed
    push.
  - Two devices pushing into one family at once are therefore judged one
    after the other, each against the other's committed state (CONC).
- **Lost response** (X8): the batch committed and the phone got nothing.
  The phone sends the same ids again. Results that are final replay as
  `duplicate` with their reason. `family_refused` is judged again
  (§11.5). The family therefore lands whole, or stays refused whole.
- **A crash in the phone's ack loop** (X1, X1b): the phone's only state is
  the `refused_arrival` cache and the outbox entry. A crash leaves an entry
  queued, refused or not, and it is sent again; the server decides again.
  Nothing on the phone can release or split a family.

### 11.9 Roots across devices

Families are per user. Another device's rows in a blocked family are refused
`family_refused` too, and wait on that device, counted on its held line,
until the bad row arrives fixed or the family is deleted.

The bad row may exist only on the device that wrote it, and that device may
be gone. The other device can still release the family in one of two ways:

- **delete the session.** A tombstone of the root makes the bad row inert;
- **edit the bad row,** if the server stores an older version of it, which
  syncs a valid version.

Q2 asks whether a block should also lift by itself.

### 11.10 Scenarios

**Stand as written in §4:** F1, F2, F3, F5, F6, F7, F8, F10, F11, H4, H5,
H6, H12.

**Revised:**

- **F4.** A row whose parent is in neither the push, `sync_rows` nor
  `sync_refusals` is not linked. It is its own family, by the §9 rule.
- **F9.** A replayed `family_refused` change is judged again (below).
- **H1–H3, H7–H11 and H13–H17** are restated below, with the server as the
  judge.

```gherkin
Feature: The server remembers refused families (Revision 3)

  # Every cycle: pull, then push. "A" and "B" are two devices of one user.
  # S1 owns series R1 and R2; R1 owns shots T1, T2; R2 owns T3.

  Scenario: F9' a replayed family_refused change is judged again
    Given R1 was refused family_refused with T2 invalid
    And T2 has since arrived valid
    When R1's client_change_id is pushed again
    Then R1 is applied, not acked duplicate

  Scenario: H1' rows after a refused session are refused by the server
    Given S1 was refused invalid_payload
    When A pushes R1, T1 and T2 in a later push
    Then all three are acked family_refused with one arrival
    And A shows "3 change(s) waiting on a refused change"
    And B pulls nothing of S1's family

  Scenario: H2' fixing the refused row sends the family in the same cycle
    Given H1'
    When A edits S1 to a valid name
    Then S1 is applied, the applied ack starts a retry pass,
         R1, T1 and T2 are applied in the same cycle,
         and B receives all four

  Scenario: H3' family_refused entries are never lost
    Given R1 is refused family_refused
    Then its outbox entry stays queued with its client_change_id
    And it is sent again in the next retry pass

  Scenario: H7' deleting the refused row releases the family
    Given H1'
    When A deletes S1
    Then the tombstone of S1 is applied (C3)
    And S1's refusal is deleted
    And the retry pass applies R1, T1 and T2 under the deleted session (N5)

  Scenario: H8' another device's valid version of the refused row releases it
    Given T2 is refused, and B holds an older stored T2
    When B edits T2 validly and syncs
    Then T2's refusal is deleted
    And A's next pull returns B's T2, which starts A's retry pass
    And A's waiting rows of S1 are applied

  Scenario: H9' refused entries never stall the outbox
    Given 600 entries with refused_arrival set and 10 tags queued
    When a cycle runs with no retry signal
    Then the 10 tags are pushed in one push and the cycle drains

  Scenario: H10' tombstones are never refused
    Given S1 is a bad row
    When A deletes T1
    Then the tombstone is applied

  Scenario: H11' the waiting count survives a restart
    Given H1', and the app restarts
    Then Account & Sync shows "3 change(s) waiting on a refused change"
    And the first cycle makes a retry pass

  Scenario: H13' a bad row acked tombstoned blocks nothing (round 2, V-D)
    Given B deleted S1 and synced
    When A, not yet synced, pushes S1 with name null, plus R1 and T1
    Then S1 is acked tombstoned and is not recorded as a bad row
    And R1 and T1 are applied in that push

  Scenario: V1 deleting a waiting row sends the deletion (round 1)
    Given S1 is a bad row and T1's edit is waiting family_refused
    When A soft-deletes T1
    Then the trigger clears refused_arrival
    And the tombstone is pushed and applied, and B deletes T1

  Scenario: ECHO this device's own older push does not replace its waiting edit (round 3, H16)
    Given S1, R1 and T1 are on A and B
    And A pushes S1 "A1" and an invalid T2 of R1
    And during that push the user renames S1 to "A2"
    Then "A1" is applied and T2 is a bad row
    And A's next push sends "A2", which is refused family_refused with arrival F
    When A pulls its own "A1", whose arrival is less than F
    Then the pull is shadowed and A keeps "A2"
    And when T2 is fixed, "A2" is applied and both devices show "A2"

  Scenario: RELEASEFAIL a failed push changes nothing (round 3, H17)
    Given T2 is a bad row and A's rename of S1 is waiting family_refused
    When pushes fail with batches of 2 and of 1
    Then the server's refusals are unchanged
    And A's entry is still queued, with or without refused_arrival
    When B renames S1 and syncs
    Then B's rename is refused family_refused too (§11.9)
    And once T2 is fixed, both renames are applied in first-arrival order,
        and both devices show B's

  Scenario: AB another device's later edit of a waiting row wins (round 2, H14)
    Given T2 of S1 is a bad row from A
    And A's rename of S1 to "A-name" is waiting with arrival F1
    And B renames S1 to "B-name", which is refused with arrival F2 > F1
    When A fixes T2
    Then "A-name" is applied with arrival F1 in A's cycle
    And B's retry pass applies "B-name" with arrival F2
    And both devices show "B-name"

  Scenario: VC another device's deletion of a waiting row arrives at once (round 2, H15)
    Given T2 of S1 is a bad row and A's rename of S1 is waiting
    When B deletes S1 and R1 and syncs
    Then A's pull applies both tombstones and drops A's waiting entry
    And S1's bad row is inert and its refusal is deleted

  Scenario: X1 a crash after the invalid ack leaves nothing half-done (round 4)
    Given A pushes S1 with name null, and the server records it as a bad row
    When the phone throws while handling the ack
    Then the next cycle sends S1 again
    And it replays duplicate invalid_payload
    And A's later R1 and T1 are refused family_refused by the server

  Scenario: X1b a crash before the family_refused ack is handled (round 4)
    Given the server refused R1 family_refused
    And the phone threw before recording refused_arrival
    When T2 is fixed
    Then R1's replay is judged again and applied with T2 in the same push or retry pass
    And B never has T2 without R1

  Scenario: X5 a waiting row deleted locally keeps its deletion (round 4)
    Given R1 waits family_refused and A deletes R1 at 10:00
    And B edits R1 at 11:00
    Then A's tombstone of R1 is applied (C3)
    And B's later live edit is acked tombstoned (R2)
    And the deletion stands on both devices

  Scenario: X7 offline edit, then another device's later edit (round 4)
    Given T2 is a bad row
    And A, offline, renames S1 to "A-name"
    And B renames S1 to "B-name", which is refused with arrival F2
    When A comes online
    Then A's pull has nothing of S1 to shadow
    And A's rename is refused with arrival F3 > F2
    And once T2 is fixed, "A-name" wins on both devices
    # The change that first reached the server last wins.
    # No clock is involved, so the manual's wording holds in every cycle.

  Scenario: X8 a lost push response cannot split a family (round 4)
    Given A pushes R1 (new) and T1 (invalid)
    And the server records T1 as bad and refuses R1 family_refused
    And the response is lost
    When the user fixes T1 and A pushes R1 (same id) and T1 (new id)
    Then T1 is applied, and R1's replay is judged again and applied
    And B pulls R1 and T1 together

  Scenario: X9 a still-invalid re-queue keeps the family blocked (round 4)
    Given T2 of R1 is a bad row
    And A adds T3 of R2
    When the user edits T2 again and it stays invalid
    Then T2 is refused invalid_payload and stays bad
    And T3 is refused family_refused: its root S1 comes from the stored R2
    And B has neither

  Scenario: X10 a batch boundary cannot split a family (round 4)
    Given S1 is a bad row, and R1 and T1 are waiting
    And a write re-queues S1, still invalid
    When pushes run with a batch of 2
    Then R1 and T1 are refused family_refused
    And S1 is refused invalid_payload
    And B has none of them

  Scenario: L1 a fix written mid-push goes out in the same cycle (round 1 O2, round 3 L-1)
    Given A pushes S1 with name null and tag G1
    And the user fixes S1 during the push
    Then the fix is applied in the next iteration
    And its applied ack starts a retry pass in the same cycle

  Scenario: CONC two devices push into one family at once
    Given A's push makes T2 a bad row
    And B's push carries T3 of S1, and both are judged from the same snapshot
    When A's batch commits first
    Then B's batch writes nothing, because its snapshot guard fails
    And B's push is judged again and T3 is refused family_refused

  Scenario: ROOT a session deleted on another device releases its family
    Given T2 of S1 is a bad row and T3 waits on A
    When B deletes S1 and syncs
    Then the bad row is inert and its refusal is deleted
    And A's retry pass applies T3
```

### 11.11 Failure model (Revision 3)

| Failure                                                         | Caught by                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A family member slips through within a push                     | F1–F3, F6; the property test over generated trees                              |
| A family splits in a later push after a re-queue of the bad row | X9, X10                                                                        |
| A lost response or a replay splits a family                     | X8, F9'                                                                        |
| A crash on the phone splits a family                            | X1, X1b, RELEASEFAIL                                                           |
| Two devices' concurrent pushes split a family                   | CONC                                                                           |
| A family is never released                                      | H2', H7', H8', H13', ROOT, VC; the retry-signal completeness argument in §11.6 |
| A waiting edit overwrites a later edit from another device      | AB, X7                                                                         |
| This device's own echo replaces its waiting edit                | ECHO                                                                           |
| A deletion is held back or lost                                 | H10', V1, X5, VC                                                               |
| Refused entries spin or stall the push                          | H9'                                                                            |
| A seq is consumed, or a half-write happens, on a refusal        | F1 `last_seq`; the atomicity suite; one batch (§11.8)                          |
| A new foreign key ships unclassified                            | F11                                                                            |
| Old reasons change meaning                                      | N3; F10; §11.5's precedence                                                    |

### 11.12 Existing data

Pre-1.0 (rule 8), with no compatibility path:

- **The server's D1 tables** change in `0000_sync_init` in place. A local
  `wrangler dev` database is recreated.
- **The phone's baseline** changes in place:
  - `sync_refused` goes;
  - `held` becomes `refused_arrival`;
  - item 6's trigger clause goes;
  - the journal `when` is bumped.

  The old install is cleared (`pm clear`), as for every baseline edit so
  far.

### 11.13 Questions for the maintainer (Revision 3)

- **Q1 Approve Revision 3** as written: the server remembers, the phone
  retries, and a late change keeps its first arrival (`superseded`)?
  **Recommended: yes.**
- **Q2 Should a block lift by itself after some time** (for a bad row on a
  device that is gone)? **Recommended: no.** Deleting the session, or
  editing a stored bad row from another device, already releases it, and an
  automatic lift would split the family the design exists to keep whole.
- **Q3 Drop Revision 2 item 6** (the soft-delete clause in 28 triggers),
  which has nothing left to do? **Recommended: yes.**
- **Q4 Change the protocol in place** at version 1 (`arrival` on pulled rows
  and on `family_refused` acks, reason `superseded`)? **Recommended: yes**
  (rule 8).

## Revisions

- **Revision 1 (2026-10-14).** First draft, before implementation.
- **Approved (2026-10-16).** Q1–Q4 answered as recommended.
- **Revision 3 (2026-10-19), not approved.** The server remembers refused
  families; see §11. It supersedes §2.3, §2.4, C4, parts of item 6 and items
  7–10 of Revision 2 once approved.
- **Revision 2 (2026-10-16), during implementation.** Items 1–5 approved by
  the maintainer, 2026-10-16: "Approve, file issue", answering "Approve the
  implementation corrections (Revision 2) to the #856 spec?"; item 4's web
  message is tracked in #863. Items 7 and 8 approved by the maintainer,
  2026-10-16: "Fix, check again", answering "Fix the two new #856 sync bugs
  as proposed, then run a third independent check?" (that answer also
  approves a third verification round). Items 9 and 10 approved by the
  maintainer, 2026-10-19: "Approve, check again", answering "Approve the
  timestamp rule for held edits in #856, then run a fourth independent
  check?" (that answer also approves a fourth round). Item 6 is not yet
  approved:
  each item below is a place where the approved text was wrong or silent,
  and is stated here so it shows in the diff rather than drifting.
  1. **N3 and P8 conflict.** N3 says the payload-validation scenarios pass
     with unchanged assertions, but P8's test pushes a valid session `s1`
     with an invalid series of `s1`, which is F2's shape: under §2.2 the
     session is now `family_refused` and not stored. P8's assertion is
     updated to the §2.2 outcome (both rows rejected, nothing stored) in its
     own commit, so it can be reverted alone if the maintainer prefers
     another resolution (for example a series of another session, which
     would keep P8 about payload validation alone). Every other P scenario
     and every atomicity scenario passes unchanged.
  2. **The invalid shot in §4.** `value: -1` is not refused: the payload
     schema checks NOT NULL and type, not range. The tests use
     `value_tenths: null`.
  3. **"A new migration".** The repo keeps exactly one baseline,
     regenerated in place (hard rule 8; `migrations.test.ts` fails on a
     second migration). The change is a baseline edit: `sync_outbox.held`,
     the `sync_refused` table, the snapshot, the hash line and a new
     journal `when`, so a backup from the old baseline is refused rather
     than restored without the new table.
  4. **H12's page half.** §2.4 says every web save tells the user a
     rejected save did not land. The entry page does not: on a
     `partlyRejected` outcome it shows "Saved" unless a firearm row was
     rejected (`web/src/entry/save.ts`, `entry.tsx` `statusText`). The web
     is unchanged, as §2.4 says; H12 pins only that `pushChanges` reports
     `partlyRejected` with both reasons. Whether the entry page should say
     otherwise is left to the maintainer.
  5. **Silent, decided by the existing pattern:** sign-out
     (`resetSyncState`) and a backup's bookkeeping reset
     (`resetSyncBookkeeping`) also empty `sync_refused`, as they empty the
     outbox; `SyncCycleResult` gains `held` (entries held this cycle) next
     to `invalid`, and a `family_refused` ack is counted there rather than
     as `rejected`; F11 lives in the backend suite as §7 says, and the
     edge lists are also pinned by value in `family.test.ts`.
  6. **§2.3 vs C3 conflict: a deletion of a held row releases it (C3 wins);
     pending the maintainer's answer.** §2.3 says a local edit of a held row
     leaves `held` as it is, and `readOutbox` skips held entries, so a held
     row that is then soft-deleted never reached step 2's tombstone guard:
     the deletion stayed held (verifier round 1, finding B1). The outbox
     triggers now set `held = 0` when the written row is a tombstone, and
     keep it otherwise, so the deletion goes out on the next push. In its
     own commit, so it can be reverted if the maintainer rules for §2.3.
  7. **A held entry nothing blocks is released (verifier round 2, B-1);
     pending the maintainer.** §2.3 releases held entries only when a
     refused row leaves `sync_refused`. A `family_refused` ack whose
     blocker never entered it stays held forever: the invalid row of the
     push was acked `tombstoned` (C11 precedence: another device deleted
     the session), so step 3 never ran for it. The same happens when a
     pulled tombstone deletes the session of a refused row, which can then
     no longer be reached to fix. Now step 1 releases every held entry each
     push, after dropping re-queued refused rows, and step 2 judges each
     again against the refused set as it is; a pull only drops refused rows
     and no longer releases. A refused row whose root session is deleted
     locally blocks nothing. Its family's live rows go out as they did
     before this change; the server stores them under the deleted session
     (N5). In its own commit, so it can be reverted.

     ```gherkin
     Scenario: H13 a held row whose blocker was acked tombstoned is released
       Given A and B share s1, and B deletes s1 and syncs
       And A, not synced, writes s1 with name null and adds R1 and T1
       When A syncs
       Then s1 is acked tombstoned and tombstoned on A, R1 and T1 are held,
            and nothing is refused
       And the next cycle pushes R1 and T1, and nothing is held

     Scenario: H13 a refused row whose session another device deleted
               holds nothing
       Given T1 of s1 is refused and T2 of s1 is held
       When A pulls B's deletion of s1
       Then T2 is pushed in the same cycle, and nothing is held
     ```

  8. **A held entry does not shadow a pull (verifier round 2, B-2); the
     resolution is pending the maintainer.** Shadowing (`shadow.ts`, the
     sync-app spec §5a) drops a pulled change for a row with a queued
     edit, on the promise that the edit is pushed later in the same cycle
     and wins by arriving last. A held edit is not pushed, and the cursor
     moves past the pulled change, so once the hold is released the older
     held edit overwrites the other device's later one everywhere (A
     renames s1 at T1, held; B renames it at T2; both devices end with A's
     name, where without the refusal both end with B's). Another device's
     deletion is delayed the same way. Approved text says nothing about it.
     The resolution: a pulled change for a row whose entry is held at pull
     time is applied, and the held entry is dropped (rev-matched, before
     the apply), the outcome the held edit would have had if it had been
     sent on time and lost to the later write. An unheld queued edit still
     shadows, the refused row itself has no entry (it was cleared) unless
     it is queued again, unheld, and a pulled tombstone of a session
     releases its family through item 7. New port:
     `LocalStore.readHeld()`. One case comes out differently from "sent on
     time": a change that reached the server between this device's last
     pull and the push that first held the edit, which that push would
     have beaten; it now wins. In its own commit, so it can be reverted.

     ```gherkin
     Scenario: H14 another device's later edit of a held row wins
       Given T2 of s1 is refused on A, and A's rename of s1 to "A-name" is held
       And B then renames s1 to "B-name" and syncs
       When A syncs
       Then A applies "B-name", nothing is shadowed, and nothing is held
       And when A fixes T2, only T2 is pushed, and both devices show "B-name"

     Scenario: H15 another device's deletion of a held row arrives at once
       Given H14's first line
       And B deletes s1 and R1 and syncs
       When A syncs
       Then s1 and R1 are deleted on A, and nothing is held or queued
     ```

  9. **A held edit is not dropped for an older pulled change (verifier
     round 3, B-1); pending the maintainer.** A pull returns this device's
     own pushes too. When A1 of s1 lands in a push and the user's next edit
     A2 is held in the same cycle, the next pull carries A1 back, and item 8
     dropped A2 for it: A2 was lost on every device, and the held line went
     to 0. Item 8 does not tell an older version from a newer one. The
     server cannot help: it orders writes by arrival (`merge.ts`, R3) and
     compares no timestamps, and a held edit has not arrived. So the phone
     decides, with the clock the rows carry (`replacesHeldEdit` in
     `shadow.ts`): a pulled tombstone always replaces the held edit, as R2
     (tombstone wins) would reject it once sent; a pulled live change
     replaces it only when its `updatedAt` is strictly later than the local
     row's, the held edit's own. An equal or older change, or a time that
     does not parse, is shadowed as an unheld edit's would be: it is not
     applied, and the cursor moves past it, as for any shadowed change; the
     held edit is sent once released and wins by arriving last. With no
     local row, the held entry is dropped. This differs from the server's
     rule where two devices' clocks disagree: a later write from a device
     whose clock is behind loses to the held edit. In its own commit, so it
     can be reverted.

     ```gherkin
     Scenario: H16 this device's own older push does not drop its held edit
       Given s1, R1 and T1 are on A and B
       And A writes s1 "A1" and a shot T2 of R1 that is invalid
       When A pushes [s1, T2], and the user renames s1 to "A2" during it
       Then s1 "A1" is applied, T2 is refused, and "A2" is held
       And the next cycle pulls A's own "A1", shadows it, and keeps "A2" held
       And when A fixes T2, s1 "A2" and T2 are pushed, and both devices
           show "A2"

     Scenario: H16 control
       Given the same steps with a valid T2
       Then both devices show "A2"
     ```

  10. **Step 1 releases only what nothing blocks (verifier round 3, B-2);
      pending the maintainer.** Item 7's step 1 released every held entry
      and relied on step 2 to hold each again when `readOutbox` returned
      it. A push that failed before step 2 had read every released entry
      (more than one batch queued ahead of it) left those entries unheld,
      so the next pull's shadowing kept them, item 8's failure again. Now
      step 1 judges each held entry where it lies (`readHeld`, the local
      row, the refused set as it is) and releases, in one call, only the
      entries nothing blocks, and those whose row is gone or deleted; a
      still-blocked entry is never released. A failure at any point leaves
      every still-blocked entry held, and repeating the step is harmless.
      `LocalStore.releaseHeld` takes the entries to release, by row, so an
      edit since the read does not keep a free entry held. The cycle's
      `held` count still counts every entry held at the end of judging. In
      its own commit, so it can be reverted.

      ```gherkin
      Scenario: H17 a held edit stays held through failed pushes
        Given T2 of s1 is refused on A, then A writes tag G0 and renames s1
              to "A-name"
        When a cycle with a batch of 2 holds s1 and G0's push fails
        And a cycle with a batch of 1 sends G0 first and its push fails
        Then s1 is still held
        And when B renames s1 to "B-name" and A syncs, A shows "B-name",
            and once T2 is fixed both devices show "B-name"
      ```
