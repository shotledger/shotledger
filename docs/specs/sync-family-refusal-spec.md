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

> **Superseded by Revision 3 (§11, approved 2026-10-20).** Kept as history.

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

> **Superseded by Revision 3 (§11, approved 2026-10-20).** Kept as history.

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
  _Superseded by Revision 3 (§11, approved 2026-10-20), which takes the
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

## 11. Revision 3: the server remembers refused families (approved)

**Status: approved by the maintainer, 2026-10-20**: "Approve all",
answering "Approve the revised #856 design (Revision 3) with the
recommended answers to Q1–Q4?". So:

- Q1: yes;
- Q2: the Discard action is a follow-up issue; the `refusals` list, the
  `blocker` and the counts ship now;
- Q3: item 6 is dropped;
- Q4: the protocol changes in place at version 1.

Written 2026-10-19 after verifier round 4 failed at
`12a2cc6`, on the maintainer's decision "Server remembers: the server keeps a
list of refused families. It refuses later rows of a family until the bad
row arrives fixed, so a lost response or a re-edit can't split it. The
phone-side hold is mostly removed." The same day, a fresh reviewer judged the
first draft (`228185e`) "sound with fixes". The revision (`91d9c4d`) adopted
the reviewer's simplification: **the server keeps the waiting rows' payloads
and applies them itself.** A second fresh review of that revision also came
back "sound with fixes", and this text applies its findings. No code
followed it until it was approved.

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

The first draft of this revision moved the judgment to the server but left
the waiting rows on the phone, to be sent again on a retry signal. The
review found that this still lost or split data:

1. **Sign-out or a backup restore** empties the outbox
   (`resetSyncState`, `resetSyncBookkeeping`), so a waiting row was never
   sent again, and its family arrived without it.
2. **A lost response, then another device's edit,** left two devices
   different for good. The same shape exists on `main` today: a `duplicate`
   ack after a shadowed pull (DUP).
3. **A bad row the phone no longer showed** blocked its family everywhere,
   with nothing pointing at it.
4. **The retry signal was not durable:** a pull moved the cursor, the push
   then failed, and nothing signalled again.
5. **Every echo resent every waiting row,** which made pushes contend.
6. **Links in `sync_refusals` went stale** after a row was applied or moved,
   and were never deleted.
7. **D1 limits** were not checked.
8. **The web never resent** a `family_refused` change (rule 11).
9. **The bad set** subtracted changes that would not be applied.
10. **C4's gap** and the root walk's stop at a tombstoned row were not
    stated.

The second review, of the revised text, found:

1. **A firearm-family release contradicted C2.** A waiting license stayed
   waiting behind another bad license of the same firearm (FIRE).
2. **The guard's failure was not recognised.** An unnamed `CHECK`'s message
   names no table, so a concurrent push answered 500 (CONC).
3. **Account deletion left `sync_refusals` behind**, payloads included
   (ACCT).
4. **Marks could never clear.** A bad row made inert by another device's
   deletion has nothing to pull (STUCK).
5. **Blocks were invisible** after sign-out, a restore or a fresh install
   (FRESH).
6. **A family split when the invalid field was the ownership column** (OWN).
7. **I2 was false as stated** (C6, H4).
8. **Released payloads were not validated again** (REVAL).
9. **Wording:** which rows a release skips, and which links it reads
   (MOVEIN, X8).
10. **Local foreign keys** on the phone were not pinned (§11.6).

It also proposed two simplifications, adopted here:

- the guard is the `state_rev` bump itself;
- the walk is one recursive read.

Two facts decide the design:

- **Only the server sees every push of every device.** So only the server
  can tell when the bad row has arrived fixed, and it can apply the waiting
  rows at that moment, in the same transaction.
- **The server orders writes by arrival** (`merge.ts`, R3: the push that
  reached the server last wins; no timestamp is compared). A waiting row
  keeps the arrival of the push that carried it. When it is applied later, it
  is ordered by that arrival, and the phones compare arrivals, never clocks.

### 11.2 What Revision 3 supersedes, and what stands

**Superseded:**

- **§2.3 (the phone holds a refused row's family across pushes), all of it.**
  That means `sync_refused`, `sync_outbox.held`, steps 1–5, the pull
  release, and "the refused row is fixed by".
- **§2.4 in part.** The two count lines stay, and both now count durable
  marks (§11.6).
- **C4** (the server decides within one push only).
- **C5** (a held entry stays in the outbox, flagged). A refused entry now
  leaves the outbox like any acked entry.
- **N1, N2, N4 and N6 in part** (§11.7).
- **Revision 2 items 7, 8, 9 and 10, entirely.** There is no phone-side
  hold left to release (7, 10), and no phone-side ordering rule (8, 9).
  Their code goes:
  - `releaseUnblocked`;
  - `readBlocked` / `isBlocked`;
  - `readHeld` / `releaseHeld`;
  - `replacesHeldEdit`;
  - the held-drop in `runPull`.
- **Revision 2 item 6, entirely** (see Q3). With no `held` flag, the
  triggers have nothing to clear on a soft delete. The server never refuses
  a tombstone (C3), so a deletion always goes out.
- **The manual's held-change paragraph.** Its clock sentence goes, which
  fixes round 4's D-1.
- **H1–H3 and H7–H17** are restated in §11.10.

**Stands as approved:**

- **§2.1:** families, the ownership and reference edges, C1, C2.
- **C3:** tombstones are never refused.
- **C6:** no rollback of rows already stored.
- **C7:** `family_refused` is its own reason.
- **§2.2:** the within-push family walk, extended in §11.4.
- **§2.5:** out of scope.
- **F1–F11**, with F4 narrowed and F9's ack extended in §11.10. A
  `family_refused` verdict is final again, as F9 says. The first draft's
  "judged again" rule is withdrawn.
- **H4–H6 and H12.** H12 is the web; its page half is #863.
- **N3, N5, N7 and N8.**
- **Revision 2 items 1–5.**

### 11.3 The server's tables (D1, `backend/`, ELv2)

These are the server's own tables. They are created by `SYNC_MIGRATIONS`
and its `backend/migrations/0000_sync_init.sql` mirror, edited in place (rule
8: the backend has never been deployed; `test/migrations-drift.spec.ts`
keeps the two copies equal). The Drizzle mirror is in
`backend/src/db/schema.ts`.

**`sync_refusals`** has one row per refused row; the latest arrival of the
row wins.

| Column                            | Meaning                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`, `table_name`, `row_id` | primary key                                                                                                                       |
| `reason`                          | `CHECK (reason IN ('invalid_payload', 'family_refused'))`                                                                         |
| `parent_table`, `parent_row_id`   | the row's ownership parent: from the refused payload when it names a readable parent (§11.4), else from the stored row, else null |
| `payload`                         | the waiting row's payload, `CHECK (json_valid(payload))`; set exactly when `reason = 'family_refused'` (a table `CHECK`)          |
| `updated_at`                      | the waiting change's `updatedAt`; set exactly when `payload` is                                                                   |
| `arrival`                         | `INTEGER NOT NULL`: the `state_rev` of the push that carried this version                                                         |
| `blocker_table`, `blocker_row_id` | for a waiting row, the bad row that blocks it (§11.4), rewritten by every push; null for a bad row                                |
| `refused_at`                      | the server's clock, for diagnostics only                                                                                          |

- A **bad row** is an `invalid_payload` record. It blocks its family. Its
  payload is never stored: it cannot be applied.
- A **waiting row** is a `family_refused` record. It blocks nothing. It holds
  the version to apply when its family is released, and its parent link keeps
  the family connected while the row is not stored. That is round 4's X8
  shape: a new series and its shot, neither stored.

**New columns:**

- **`sync_sequence.state_rev`**, `INTEGER NOT NULL DEFAULT 0`. The first
  statement of every push batch bumps it (§11.8), even in a push that refuses
  every change. It is two things:
  - the user's **arrival clock**: every change in one push arrives at that
    push's new `state_rev`;
  - the **snapshot version** for §11.8.
- **`sync_rows.arrival_rev`**, `INTEGER NOT NULL`: the arrival of the stored
  version. For a change applied on arrival, it is the push's `state_rev`.
  For a waiting row applied on release, it is the record's `arrival`.
- **`sync_idempotency.arrival_rev`**, `INTEGER NOT NULL`: the push's
  `state_rev`, for every record. A replay acks with it.

**Account deletion** (`backend/src/routes/account.ts`) deletes the user's
`sync_refusals` in the same batch as `sync_rows`, `sync_sequence` and
`sync_idempotency`, since it holds payloads. `computeCascadeCounts`, and so
the dry run, gains `syncRefusals`. No app or web screen shows these counts.
The account test asserts that no `sync_*` table keeps a row of the deleted
user (ACCT). There is no other new server table.

### 11.4 When a family is blocked

A push is judged as a whole, in the route, from one snapshot (§11.8). The
snapshot holds:

- `state_rev`;
- the idempotency records of the push's `clientChangeId`s;
- the user's `sync_refusals`, without payloads;
- the stored rows that the walk needs: `deleted_at`, `arrival_rev` and the
  ownership column.

**The walk's read.** The stored rows come from **one recursive CTE read**
over `sync_rows`, at most two steps up, following `json_extract` of the
ownership column. It is seeded with:

- the push's rows and the parents they name;
- the records' rows and their parents.

Every link that is not a stored link is therefore a seed, and the CTE
follows the stored links from each one. The route then picks each row's
link by the order below, in plain code. The read finds the rows; the rule
lives in one place.

**The change that counts.** A change whose `clientChangeId` already has a
record is a replay: it changes nothing, and is acked `duplicate` (§11.8).
When one push carries two changes of one row, the later one in array order
is that row's latest arrival.

**Parent links.** A live row's parent is read from:

1. its change in this push, when that change names a **readable parent**: a
   non-empty string in its ownership column; else
2. its `sync_refusals` record; else
3. its stored row in `sync_rows`.

An invalid change whose invalid field is the ownership column itself (for
example, shot T2 with `series_id` null, or a number) names no readable
parent. So it keeps the link of its record or its stored row, and stays in
its family (fix 6, OWN). Its record's `parent_*` columns are filled from the
same fallback.

This order is correct because a record is deleted when a later version of
its row is stored (§11.5). So a record that exists is always newer than the
stored row.

**The root** is the topmost row the walk reaches, at most two steps up
(shot, series, session). The walk **stops at a tombstoned row**, which is
then the root. That can be a stored tombstone or one in this push. The root
can also be a bare id the server has never seen (§9's orphan rule).

**The state after this push.** The judge first works out every row's link
and kind as this push will leave them:

- a valid live change makes its row not bad;
- a tombstone makes its row not bad;
- an invalid live change makes its row bad, unless it is acked
  `tombstoned` (precedence below);
- a row with no change in this push keeps its record's state;
- each row's link is the one this push will leave, so a row moved into a
  blocked family counts as in it (MOVEIN).

Both the push's verdicts and the release (§11.5) come from this one state.
A valid live change takes its row out of the bad set, whether it is applied
or itself refused `family_refused` (because another bad row is left). A
change acked `tombstoned` never counts: its row is tombstoned, so it is
inert (fix 9).

**Inert bad rows.** A bad row is inert when its root is tombstoned. Its own
tombstone already removes it. An inert bad row blocks nothing, and the batch
deletes its record. The user deleted what the refusal was about, so its
family goes out as it did before #856: under a deleted session, the server
stores the rows without a foreign-key check (N5).

**The blocked rule.** A live row is **blocked** when either:

- **session family:** it is in a session-family table, and a non-inert bad
  row of a session-family table has the same root; or
- **firearm family:** its firearm (or itself, if it is a firearm row) is a
  non-inert bad `firearms` row.

A bad license, group, caliber, maintenance event or sight setting therefore
blocks only itself, as C2 says (FIRE). A live change that is valid, not a
replay, not over a tombstone and blocked is refused `family_refused`. The
rule covers every later push and every device of the user (§11.9). It also
covers rows whose parents are absent from the push, because the root comes
from the stored rows and the refusal records.

**The blocker** of a blocked row is one bad row that the rule matched: the
one with the lowest `arrival`, then by table and id. The `family_refused`
ack names it. Every push rewrites the blocker of every waiting record that
is still blocked, so the stored one is never stale (§11.8).

**In this push.** §2.2's walk stays inside `familyRefusals`, which gains the
stored and remembered links and the remembered bad rows as extra roots. So
F1–F3 and F6 hold within a push.

**C4's remaining gap (fix 10).** A row can be linked only through rows the
server has never seen, neither stored, nor waiting, nor in the push. For
example, the first push carries two shots of different series of S1, and
neither series. When one shot is invalid, the other is applied, because
nothing links them yet. When the series arrive, their links join the family
and the series wait; the stored shot is not rolled back (C6). Other devices
then hold an orphan shot that no series shows, which is §9's orphan rule.
The phone pushes a session's rows in outbox order, parents first, so this
needs rows pushed out of order.

**Precedence.** A live change is judged in this order:

1. `duplicate`: a replay (§11.8);
2. `tombstoned` (R2, C11, F10);
3. `invalid_payload` (#697's validator, unchanged);
4. `family_refused`;
5. `applied`.

An invalid change over a tombstoned row is reported `tombstoned`, as now,
and is **not** a bad row. The first draft's `superseded` reason is
withdrawn.

### 11.5 Release, and the order of a waiting row

**Records follow the latest arrival of their row** (fix 6). Each push's
batch, per change:

| The row's latest change in the push is… | Its record                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| applied                                 | deleted                                                                         |
| a tombstone (applied, C3)               | deleted                                                                         |
| refused `invalid_payload`               | upserted as a bad row: no payload, this arrival, its link (§11.4's fallback)    |
| refused `family_refused`                | upserted as a waiting row: this payload, `updatedAt`, arrival, link and blocker |
| acked `tombstoned` or `duplicate`       | unchanged; a tombstoned row's record is inert, and is deleted below             |

A **re-sent, still-invalid** bad row stays bad. A re-queue alone releases
nothing, which fixes round 4's B-1 (X9, X10). A valid version of a bad row
that is still blocked by another bad row becomes a waiting row.

**Release.** A waiting record is released **exactly when §11.4's blocked
rule no longer holds for its row**, judged on the state after this push.
Invariant **I1**: after every committed push, the blocked rule holds for
every waiting record. The batch keeps I1 itself. The route lists every
waiting record that the rule no longer blocks. That is normally exactly the
rows this push released:

- by a fix;
- by a tombstone of the bad row;
- by a tombstone of the root.

The list also catches any record that a defect left unblocked.

**Released payloads are validated again** (fix 8). Before the batch, the
route reads the payloads of the release list (one read) and validates each
one with #697's validator, which may have tightened since the row arrived.
A payload that fails becomes a bad row at its own `arrival`, and the
judgment of the state after this push runs again, so its family keeps
waiting (REVAL). This repeats until no released payload fails. Each round
can only shrink the release list, so it ends, and it needs no new read. The
log line names the tables and the count, as §2.2's does.

**The batch then:**

1. **applies the released rows**, in ascending `arrival` (then table, then
   id). Each takes a new `seq`, so every device's pull sees it, and keeps
   its record's `arrival` as `arrival_rev`. Two kinds are skipped:
   - a row that **this push applies or tombstones**, because the push is
     the later arrival. A `duplicate` replay is not a change of the row, so
     it does not suppress the release (X8);
   - a row that is tombstoned on the server (R2).

   As a guard, a row whose stored `arrival_rev` is not below the record's
   `arrival` is skipped too. By the table above this cannot happen.

2. **deletes** the released records and the inert bad rows.

The release `SELECT` reads the records as this push's own upserts leave
them, because they come earlier in the same batch. A row moved into a
blocked family in this push is a waiting row there, not a released one
(MOVEIN).

A waiting row under a tombstoned root is applied (N5), as it would have been
before #856.

**Nothing on the phone or the web releases a family.** No retry, pull or
timer is involved. The phone that wrote a waiting row may be signed out,
restored from a backup, wiped or gone, and the row still lands with its
family (REV1).

### 11.6 The phone

**Removed:**

- `sync_refused`;
- `sync_outbox.held`;
- every family walk on the phone;
- the retry pass of the first draft;
- item 6's trigger clause;
- items 7–10's engine code.

`shared/src/sync/family.ts` stays; the server uses it.

**Acks.** Every ack clears its outbox entry, rev-matched, as an `applied` ack
does today. A refused change is now on the server, as a bad row or as a
waiting row, so the outbox has nothing left to send. The outbox drains in
every cycle, and the old H9 stall cannot occur.

**Marks.** The phone keeps one small local table, `sync_refusal_marks` (not
synced), so that a pull does not overwrite a local version the server is
holding:

| Column                            | Meaning                                                   |
| --------------------------------- | --------------------------------------------------------- |
| `table_name`, `row_id`            | primary key                                               |
| `kind`                            | `waiting` or `invalid`                                    |
| `arrival`                         | the server record's `arrival`                             |
| `blocker_table`, `blocker_row_id` | for `waiting`: the record's blocker; null for `invalid`   |
| `own`                             | this device's own ack wrote the mark (Revision 4, item 9) |

**The server's list is the source of the marks** (fixes 4 and 5). Every pull
response carries `refusals`: the user's records, read before the pull's
pages (§11.7). The phone replaces its marks with that list, in the same
transaction that applies the response's changes, before it applies them.

- After sign-out, a restore or a fresh install, the first pull rebuilds
  every mark (FRESH). `resetSyncState` and `resetSyncBookkeeping` clear the
  marks along with the outbox, and nothing is lost.
- A mark whose record is gone is dropped by the next pull. One example is
  an invalid T2 made inert when B deletes S1 (STUCK). Nothing is ever pulled
  for T2, and the mark still clears.
- The list is the account's, so it includes rows other devices wrote. The
  counts below are the same on every device and on the web.
- A rebuilt mark is this device's **own** only when the device's own mark
  of that row is at the listed `arrival`: the record still keeps back the
  version this device sent. Every other mark, on a fresh, signed-out or
  restored device too, counts and shadows nothing (Revision 4, item 9).

**Between pulls, acks keep the marks current**, written in the same
transaction as the rev-matched clear of the entry:

- `family_refused` upserts a `waiting` mark, this device's own;
- `invalid_payload` upserts an `invalid` mark, this device's own (fix 3). The bad row is not
  sent again until the user edits it; the edit makes a new outbox entry, as
  today;
- `applied` and `tombstoned` delete the row's mark, unless the mark's
  `arrival` is greater than the ack's (Revision 4, item 12).

An upsert keeps the mark with the greater of the old and new `arrival`, and
a delete spares a mark that arrived after the acked change. Only a later
record of the row can have made such a mark, from a later push of this
device or a pull's list of another device's record; the ack says nothing
about it, and the next pull's list settles it. A `duplicate` ack
is handled by its stored reason, the same way. Then its `current` row
(§11.7) is applied through the rules below.

**Shadowing.** A pulled change for a row:

| The row has…           | The pulled change is…               | Result                                                                                                             |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| a queued outbox entry  | anything                            | shadowed, as today. The entry goes out this cycle, arrives last, and wins (or its ack fixes it)                    |
| a mark, and no entry   | a tombstone                         | applied, and the mark deleted. R2: the deletion wins                                                               |
| a mark, and no entry   | live, `arrival` at least the mark's | applied, and the mark deleted. It is the held version itself, or one that reached the server later                 |
| its own mark, no entry | live, `arrival` below the mark's    | shadowed, and the mark kept. The server holds a later version of this row, which this device holds                 |
| a mark not its own     | live, `arrival` below the mark's    | applied, and the mark kept. The device does not hold the later version; the stored one is all it can show (item 9) |
| neither                | anything                            | applied, as today                                                                                                  |

The phone compares the server's arrivals, never a clock.

- **This device's own echo** (ECHO, H16) is older than its own waiting edit,
  so it is shadowed.
- **Another device's later edit** (AB, X7) has a greater arrival, so it wins.
- **The release itself** reaches every device as a pulled change whose
  `arrival` equals the waiting version's. The device that wrote it applies
  that change and drops its mark.

**No device stays behind (fix 2).** A shadowed pull is final only when the
shadowing thing loses to it. There are two cases:

- **A mark** shadows only on the device whose own ack wrote it, the one
  device that holds the version the server keeps back, and only versions
  older than that one. Every other device applies the stored version
  (Revision 4, item 9).
  That held version, or a later one, arrives as a new `seq` when the family
  is released, and the table applies it. If the record goes without a
  release (it is deleted as inert), the next pull's list drops the mark. The
  shadowed version is then the stored one, and it stays on the device.
- **A queued entry** shadows anything. Its push either applies, arriving
  last, or acks `duplicate`. A `duplicate` ack carries the row's current
  stored state, read at the end of the batch, and the phone applies it by
  the table. This also closes the gap on `main` today: a committed push
  whose response is lost, then another device's edit, then a shadowed pull
  (DUP).

**Local foreign keys** (fix 10). A release, a discard or a deletion on
another device can bring a child whose parent row this device does not hold:

- H7' and ROOT put rows under a deleted session that a device may never
  have pulled;
- DISCARD leaves a session's rows without the discarded row.

The intended behaviour is that the phone applies such a child, as the
server does (N5), and as sync already does today for a child pushed before
its parent.

- **Production:** `app/src/db/client.ts` sets no `foreign_keys` pragma, so
  SQLite's default (off) holds. The build confirms this by reading
  `PRAGMA foreign_keys` in the dev build and records it in the evidence.
- **Tests:** `app/src/db/test-db.ts` turns foreign keys on, and every
  existing test keeps that. `createTestDb` gains a `{ foreignKeys: false }`
  option that matches production. The H7', ROOT and DISCARD apply tests use
  it. One more test pins the difference: on the default test DB, with foreign
  keys on, the same apply fails at commit, because `applyChangesSync` defers foreign-key checks to
  the end of the transaction.

**What the user sees (§2.4, revised):**

- "n change(s) refused by the server and not synced" counts `invalid`
  marks. It now survives a restart; today it is an app-session count.
- "n change(s) waiting on a refused change" counts `waiting` marks.
- "n change(s) waiting to upload" counts outbox entries, which no longer
  include refused ones. So no change is counted twice (round 4's N-2).

The first two lines count the account's refusals, from the server's list,
so other devices' refused and waiting rows are included.

The manual's held paragraph says:

- the server keeps the family back until the refused change arrives fixed,
  or until it or its session is deleted, from any device;
- changes to that session from other devices wait on the server too, and
  are not lost by signing out, restoring a backup or reinstalling;
- the counts are the account's, the same on every device and the web;
- when two devices change the same entry, the change that reached the server
  last wins, and a waiting change counts from when it reached the server.

### 11.7 Protocol

Changed in place, at `PROTOCOL_VERSION` 1 (rule 8):

- **`ChangeRow.arrival`**: the row's `arrival_rev`, on every pulled row.
- **`PullResponse.refusals`**: on every pull response, the user's records as
  `{ tableName, rowId, reason, arrival, blocker }`. `blocker` is
  `{ tableName, rowId }` for a waiting row and null for a bad row. There are
  no payloads. It is read once per pull request, before the pages.
- **`PushAck.arrival`**: on every ack. It is the change's arrival, or the
  original arrival on a `duplicate`.
- **`PushAck.blocker`**: `{ tableName, rowId }`, on every `family_refused`
  ack, first or `duplicate`. It names the bad row (§11.4).
- **`PushAck.current`**: on every `duplicate` ack. It is a `ChangeRow` for
  the row's current stored state, or null when the row is not stored.
- **503** `{ error: 'busy' }` when the snapshot guard fails four times
  (§11.8). The phone treats it as a network failure, as every 5xx today.
- No new reason. `superseded` is withdrawn.

**Amended Must-NOTs:**

- **N1:** the ack and pull shapes gain the fields above, and the push may
  answer 503. Nothing else changes.
- **N2:** the pull path carries `arrival` and `refusals`; nothing else
  changes.
- **N4:** a valid change in a family with no refused member is applied,
  cleared and counted as today. Its ack gains `arrival`, and its replay gains
  `current`.
- **N6:** no id or value in a log line. A `family_refused` ack and the
  pull's `refusals` name the user's own rows by table and id. That data goes
  only to the user's own signed-in client, and it is never logged, on the
  server, the phone or the web. A mark's `blocker_*` columns stay on the
  device.

**The web.** It reports `family_refused` as `partlyRejected`, as now, and
the save is not lost: the server applies it on release, as for the phone.
That closes fix 8, and the web needs no retry for parity (rule 11). The web
holds no local copy of a row, so it needs no marks for shadowing.

For parity, the web reads `refusals` from its own pull (`web/src/pull.ts`,
`pullAll`). Its account page (`web/src/account/account.tsx`) shows the same
two counts as the phone's Account & Sync, with the same strings. That is
part of this change. The save message, "saved, waiting on a refused change",
is #863.

### 11.8 Idempotency, atomicity and D1's limits

**One batch.** One D1 batch, one transaction, writes all of a push's
outcomes:

- the applies, with their `seq` and `arrival_rev`;
- the idempotency records;
- the record upserts and deletes;
- the blockers;
- the release;
- the `state_rev` bump.

A refusal is never recorded without the push's other outcomes, or the
reverse.

**Snapshot guard.** The route judges from reads made outside the batch, so
another push of the same user can commit between the reads and the batch.
The batch's **first statement** is the guard, and it also bumps
`state_rev`:

```sql
INSERT INTO sync_sequence (user_id, last_seq, state_rev)
VALUES (?1, CASE WHEN EXISTS (SELECT 1 FROM "user" WHERE id = ?1)
  AND (?2 = 0 OR EXISTS (SELECT 1 FROM sync_sequence WHERE user_id = ?1))
  THEN 0 END, 1)
ON CONFLICT (user_id) DO UPDATE
  SET state_rev = CASE WHEN state_rev = ?2 THEN state_rev + 1 END
```

Here `?2` is the `state_rev` the route read first, before the other
snapshot reads: `COALESCE(state_rev, 0)`, so 0 when the user has no row.

- **Unchanged snapshot:** `state_rev` becomes `?2 + 1`, this push's
  arrival.
- **Another push committed in between:** the `CASE` yields null, the
  `NOT NULL` constraint fails, and D1 rolls back the whole batch. SQLite's
  message names the column:
  `NOT NULL constraint failed: sync_sequence.state_rev`. The route
  recognises that message. No other statement writes `state_rev`, so the
  message cannot come from anywhere else (fix 2).
- **A user's first push** (no row, `?2` = 0): the insert creates the row
  with `state_rev` 1 and `last_seq` 0, even when every change is refused
  (FIRST). When two first pushes race, the second meets the first's row with
  `state_rev` 1, the `CASE` yields null, and it is judged again.
- **The account is gone by the batch:** its `user` row is gone, or the
  push was judged with a sequence row that is gone (`?2` > 0, no row).
  `last_seq` is null, and the insert fails with
  `NOT NULL constraint failed: sync_sequence.last_seq`. The route answers
  401 and does not judge again (Revision 4, items 11 and 13; GONE). Every
  attempt runs the guard, so a push whose reads, first or retried, follow
  the deletion cannot recreate the account either: it reads no sequence
  row, but the `user` row is gone too. A push whose batch commits before
  the deletion's is an ordinary push of a live account, and the deletion
  removes what it wrote.
- D1 runs a batch's statements in sequence, as one transaction, with no
  other query interleaved (`sync-push-atomicity-spec.md` §6). So one guard
  at the start covers every later statement, and no statement needs a
  `state_rev` subquery.
- On the guard's failure, the route reads and judges again, at most 3 more
  times, then answers 503. Any other error is rethrown, as today.
- Two devices pushing into one family at once are judged one after the
  other, each against the other's committed state (CONC).

**The statements of one push** of N changes:

- 1 guard, which also bumps `state_rev`;
- 5 per change: today's four (`sync-push-atomicity-spec.md` §3), plus the
  record's upsert or delete, placed before the idempotency insert so it sees
  the same `notDuplicate`;
- 1 that rewrites the blockers of the waiting records still blocked;
- 3 for the release:
  1. an `INSERT … SELECT` from `sync_refusals`, numbering `seq` with
     `row_number() OVER (ORDER BY arrival, table_name, row_id)`;
  2. raising `last_seq` to the new maximum `seq`;
  3. deleting the released and inert records;
- 1 that reads `current` for the push's `duplicate` changes.

That is 5N + 6 statements, at most 2,506 for `PUSH_BATCH_MAX` (500). Today
it is 4N (2,000). The release is a constant number of statements whatever
the family's size, and it copies payloads inside D1 without binding them.

**Reads before the batch**, per attempt:

1. `state_rev`;
2. the idempotency records;
3. the user's records;
4. the walk's recursive CTE;
5. the payloads of the release list, for re-validation, only when it is not
   empty.

A pull request makes one more read, for `refusals`.

**Lists are one JSON parameter.** Every list a statement or read needs is
passed as one bound JSON array, read with `json_each(?)`:

- the push's `clientChangeId`s;
- the walk's seeds;
- the records to release and their blockers;
- the `duplicate` rows.

So no statement binds more than about 15 parameters, against D1's 100.
Nothing needs chunking.

**Each list is read once and joined by primary key** (Revision 4, item 10).
A statement reads its list with `(table_name, row_id) IN (SELECT … FROM
json_each(?))`, or scans the list and probes `sync_refusals` per pair, so a
push costs what its lists hold, not what the user has waiting. The batch
rewrites only the blockers that change.

**Against D1's production limits**, as `sync-push-atomicity-spec.md` §9 and
its Revisions cite them:

| Limit                                                       | This design                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queries per Worker invocation: 50 on the Free plan          | The maintainer decided that a batch is one call to D1, and that the design must hold on the Free plan. Each attempt is at most 5 reads plus 1 batch, so four attempts make 24 calls                                                                                                                                                                                                                                                                                        |
| 100 bound parameters per statement                          | about 15 at most; lists are one JSON parameter                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 30 s for "the entire batch call"                            | today's 2,000-statement batch took 200–299 ms locally. The build records BUDGET: a 500-change push that also releases 2,000 waiting rows                                                                                                                                                                                                                                                                                                                                   |
| Row, string or bound-value size (2 MB, to confirm at build) | a payload is at most `MAX_PAYLOAD_BYTES` (16 KiB). The longest bound string is the walk's seed list, which every push binds: each refusal record of the user and its parent, listed separately. With the phone's UUIDv7 ids that is about 99 characters for a shot or series record and 52 for a session record, so the limit is about 20,000 to 38,000 records, past which every push fails, a fix included (Revision 4, item 14). A session family is a few hundred rows |

The build re-reads Cloudflare's D1 limits page, and records each figure in
the evidence with the date it was read. The page could not be fetched while
this revision was written.

**Lost response** (X8, REV2, DUP): the batch committed and the phone got
nothing. The phone sends the same ids again. Every verdict is final and
replays as `duplicate`, with its reason, `arrival`, `blocker` and `current`.
The waiting row is on the server either way, so the family lands whole or
waits whole. `current` brings the phone up to date.

**A crash in the phone's ack loop** (X1, X1b): it leaves an entry queued,
which is sent again and acks `duplicate`, with or without a mark. Nothing on
the phone can release or split a family.

### 11.9 Roots across devices, and the way out

Families are per user. Another device's rows in a blocked family wait on
the server too, counted on every device's waiting line, until the bad row is
fixed or the family is deleted.

**No automatic lift** (the maintainer's answer to the first draft's Q2). A
lift after a time would split the family that the design keeps whole.

**The way out.** The bad row may exist only on the device that wrote it,
and that device may be gone. The pull's `refusals` list names every bad row
to every device and to the web, so any of them can act. There are three
ways to release the family:

- **edit the bad row**, when the server stores an older valid version of it;
- **delete the session**: a tombstone of the root makes the bad row inert;
- **"Discard the refused change"**: push a tombstone of the bad row. A
  tombstone is never refused (C3). It needs no local copy of the row: a
  tombstone of a row the server has never stored is stored as one, as N5
  allows. The bad row's family is released in that push, without the bad
  row.

  Discarding deletes the row. When the server stores an older valid version
  of it, that is deleted too. The confirm dialog says so, for example: "This
  deletes the shot on all your devices. The rest of the session will
  sync."

**In this change:** the `refusals` list, the `blocker` field, the marks, and
the counts on the phone and the web (fix 5).

**Recommended as a follow-up issue (Q2):** the Discard action itself, which
is:

- a control on both clients (rule 11);
- i18n strings;
- a manual section.

Until it ships, deleting the session or editing the row is the way out,
and both clients show the block.

### 11.10 Scenarios

**Stand as written in §4:** F1, F2, F3, F5, F6, F7, F8, F10, F11, H4, H5,
H6, H12.

**Revised:**

- **F4.** A row whose parent is not in the push, not in `sync_rows` and not
  in `sync_refusals` is not linked. It is its own family, by the §9 rule.
- **F9.** As written, plus: the replay's ack carries `arrival`, `blocker`
  and `current`.
- **H1–H3 and H7–H17** are restated below, with the server as the judge.

```gherkin
Feature: The server keeps refused families and their waiting rows (Revision 3)

  # Every cycle: pull, then push. "A" and "B" are two devices of one user.
  # S1 owns series R1 and R2; R1 owns shots T1, T2; R2 owns T3.
  # "arrival n" is the state_rev of the push that carried the change.

  Scenario: H1' rows after a refused session wait on the server
    Given S1 was refused invalid_payload
    When A pushes R1, T1 and T2 in a later push
    Then all three are acked family_refused, naming S1 as the blocker
    And the server holds their payloads as waiting rows
    And A's outbox is empty, with three waiting marks and one invalid mark
    And B pulls nothing of S1's family

  Scenario: H2' fixing the refused row lands the family in one batch
    Given H1'
    When A edits S1 to a valid name and pushes
    Then S1 is applied, and the same batch applies R1, T1 and T2
    And B's next pull returns all four
    And A's pull returns R1, T1 and T2 at their own arrivals, and A drops its marks

  Scenario: H3' a waiting row survives on the server
    Given R1 is waiting
    Then the server's record holds R1's payload until its family is released
    And nothing on A needs to send it again

  Scenario: H7' deleting the refused row releases the family
    Given H1'
    When A deletes S1
    Then the tombstone of S1 is applied (C3)
    And the same batch applies R1, T1 and T2 under the deleted session (N5)

  Scenario: H8' another device's valid version of the refused row releases it
    Given T2 is a bad row, and B holds an older stored T2
    When B edits T2 validly and syncs
    Then T2's record is deleted and S1's waiting rows are applied in that batch

  Scenario: H9' refused changes leave the outbox
    Given 600 queued entries, of which 590 are refused
    When a cycle runs
    Then every entry is acked and cleared, and the cycle drains

  Scenario: H10' tombstones are never refused
    Given S1 is a bad row
    When A deletes T1
    Then the tombstone is applied

  Scenario: H11' the counts survive a restart
    Given H1', and the app restarts
    Then Account & Sync shows "3 change(s) waiting on a refused change"
    And "1 change(s) refused by the server and not synced"

  Scenario: H13' a bad row acked tombstoned blocks nothing (round 2, V-D)
    Given B deleted S1 and synced
    When A, not yet synced, pushes S1 with name null, plus R1 and T1
    Then S1 is acked tombstoned and is not recorded as a bad row
    And R1 and T1 are applied in that push

  Scenario: V1 deleting a waiting row sends the deletion (round 1)
    Given S1 is a bad row and T1's edit is waiting
    When A soft-deletes T1
    Then the tombstone is pushed and applied, and T1's record is deleted
    And B deletes T1, and S1's release later does not bring T1 back

  Scenario: ECHO this device's own older push does not replace its waiting edit (round 3, H16)
    Given S1, R1 and T1 are on A and B
    And A pushes S1 "A1" and an invalid T2 of R1, at arrival 5
    And during that push the user renames S1 to "A2"
    Then "A1" is applied and T2 is a bad row
    And A's next push sends "A2", which waits at arrival 6
    When A pulls its own "A1" at arrival 5
    Then the pull is shadowed and A keeps "A2"
    And when T2 is fixed, "A2" is applied at arrival 6, and both devices show "A2"

  Scenario: RELEASEFAIL a failed push changes nothing (round 3, H17)
    Given T2 is a bad row and A's rename of S1 waits at arrival 7
    When B's pushes fail, with batches of 2 and of 1
    Then the server's records are unchanged
    When B renames S1 and the push succeeds
    Then B's rename waits at arrival 9 and replaces A's waiting version
    And once T2 is fixed, B's rename is applied, and both devices show it

  Scenario: AB another device's later edit of a waiting row wins (round 2, H14)
    Given T2 of S1 is a bad row from A
    And A's rename of S1 to "A-name" waits at arrival 10
    And B renames S1 to "B-name", which waits at arrival 12
    When A fixes T2
    Then the batch applies "B-name" at arrival 12
    And A pulls it, 12 not below its mark's 10, and both devices show "B-name"

  Scenario: VC another device's deletion of a waiting row arrives at once (round 2, H15)
    Given T2 of S1 is a bad row and A's rename of S1 waits
    When B deletes S1 and R1 and syncs
    Then the waiting S1 record is deleted and T2 is inert
    And A's pull applies both tombstones and drops its marks

  Scenario: X1 a crash after the invalid ack leaves nothing half-done (round 4)
    Given A pushes S1 with name null, and the server records it as a bad row
    When the phone throws while handling the ack
    Then the next cycle sends S1 again, acked duplicate invalid_payload
    And A writes the invalid mark then
    And A's later R1 and T1 wait on the server

  Scenario: X1b a crash before the family_refused ack is handled (round 4)
    Given R1 waits on the server, and A threw before clearing R1's entry
    When T2 is fixed from B
    Then R1 is applied in B's batch, together with T2
    And A's replay of R1 acks duplicate, with current set to the applied R1
    And B never has T2 without R1

  Scenario: X5 a waiting row deleted locally keeps its deletion (round 4)
    Given R1 waits, and A deletes R1
    And B then edits R1
    Then A's tombstone is applied (C3), and R1's record is deleted
    And B's later live edit is acked tombstoned (R2)
    And the deletion stands on both devices

  Scenario: X7 offline edit, then another device's later edit (round 4)
    Given T2 is a bad row
    And A, offline, renames S1 to "A-name"
    And B renames S1 to "B-name", which waits at arrival 20
    When A comes online and pushes, and its rename waits at arrival 21
    Then once T2 is fixed, "A-name" wins on both devices
    # The change that reached the server last wins, so the manual's wording
    # holds in every cycle.

  Scenario: X8 a lost push response cannot split a family (round 4)
    Given A pushes R1 (new) and T1 (invalid)
    And the server records T1 as bad, and R1 as waiting
    And the response is lost
    When the user fixes T1 and A pushes R1 (same id) and T1 (new id)
    Then T1 is applied and R1 is released in the same batch
    And R1's ack is duplicate, with current set to the applied R1
    # The replay of R1 is not a change of R1, so it does not suppress R1's release.
    And B pulls R1 and T1 together

  Scenario: X9 a still-invalid re-queue keeps the family blocked (round 4)
    Given T2 of R1 is a bad row
    And A adds T3 of R2
    When the user edits T2 again, and it stays invalid
    Then T2 is refused invalid_payload and stays bad
    And T3 waits: its root S1 comes from the stored R2
    And B has neither

  Scenario: X10 a batch boundary cannot split a family (round 4)
    Given S1 is a bad row, and R1 and T1 are queued
    And a write re-queues S1, still invalid
    When pushes run with a batch of 2
    Then R1 and T1 wait, and S1 is refused invalid_payload again
    And B has none of them

  Scenario: REV1 sign-out or a restore loses no waiting row (review 1)
    Given T1 is a bad row and R1 waits on the server
    When A signs out, or restores a backup, which empties its outbox and marks
    And a valid T1 later arrives from any device
    Then the batch applies R1 together with T1
    And B never has T1 without R1

  Scenario: REV2 a lost response, then another device's edit (review 2)
    Given T2 is a bad row
    And A's rename of S1 to "A" waits at arrival 10, and the response is lost
    When B fixes T2 and renames S1 to "B" in one push, at arrival 12
    Then the batch applies "B" and drops A's waiting S1, which is older
    And A's pull of "B" is shadowed by A's still-queued entry
    When A pushes its rename again
    Then it acks duplicate family_refused, with current set to "B" at arrival 12
    And A applies "B", so A, B and the server all show "B"

  Scenario: REV3 a refused re-edit stays visible (review 3)
    Given T2 v1 is applied
    And during a push the user edits T2 to an invalid v2
    When v2 is refused invalid_payload
    Then A clears the entry and writes an invalid mark at v2's arrival
    And A's next pull of v1, whose arrival is lower, is shadowed
    And A keeps showing v2, counted as refused
    And A's next changes to S1 wait, naming T2 as the blocker

  Scenario: REV6 a moved row leaves no stale link (review 6)
    Given T2 of S1 is a bad row and R1 waits, linked to S1
    When the user moves R1 to session S2, which is not blocked
    Then R1 is applied, and its record is deleted
    And T7, a new shot of R1, is applied: its root is S2, from the stored R1
    And S1's later release does not bring back R1's older version

  Scenario: DUP a lost response on today's plain path (review 2)
    Given A's edit E of S1 was applied, and the response was lost
    And B edits S1 afterwards
    When A pulls B's edit, which is shadowed by E's queued entry
    And A pushes E again
    Then E acks duplicate applied, with current set to B's edit
    And A shows B's edit

  Scenario: TOMBROOT the root walk stops at a tombstoned row (review 10)
    Given series R1 of S1 is tombstoned on the server
    When A pushes an invalid shot of R1 and a valid T3 of R2
    Then the invalid shot's root is R1, which is tombstoned, so it is inert
    And T3 is applied

  Scenario: GAP C4's remaining gap (review 10)
    Given neither R1 nor R2 is stored
    When A's first push carries an invalid T1 of R1 and a valid T3 of R2
    Then T3 is applied, because nothing links R2 to S1 yet
    And when R1 and R2 arrive, linked to S1, both wait

  Scenario: FIRST a user's first push may refuse everything (review 7)
    Given a user with no sync_sequence row, so the snapshot reads state_rev 0
    When their first push is one invalid change
    Then the guard creates the row with last_seq 0 and state_rev 1
    And when a second first push, judged from state_rev 0, commits after it
    Then its guard fails, and it is judged again from state_rev 1

  Scenario: DISCARD a tombstone of the blocker releases the family
    Given T2 exists only on A, as a bad row, and A is gone
    When B pushes a tombstone of T2, named by its blocker
    Then the tombstone is stored, T2's record is deleted
    And S1's waiting rows are applied in that batch

  Scenario: CONC two devices push into one family at once
    Given A's push makes T2 a bad row
    And B's push carries T3 of S1, and both are judged from the same snapshot
    When A's batch commits first
    Then B's guard fails with "NOT NULL constraint failed: sync_sequence.state_rev"
    And B's batch writes nothing
    And the route judges B's push again instead of answering 500, and T3 waits

  Scenario: L1 a fix written mid-push goes out in the same cycle (round 1 O2, round 3 L-1)
    Given A pushes S1 with name null, and tag G1
    And the user fixes S1 during the push
    Then the fix is pushed in the next iteration of the same cycle
    And its batch releases S1's waiting rows

  Scenario: ROOT a session deleted on another device releases its family
    Given T2 of S1 is a bad row and T3 waits
    When B deletes S1 and syncs
    Then T2 is inert, and T3 is applied under the deleted session (N5)

  Scenario: FIRE a firearm family releases by C2 (second review 1)
    Given firearm F is refused invalid_payload, and its license L2 waits
    And license L1 of F is refused invalid_payload
    When F arrives fixed
    Then F is applied, and L2 is released in the same batch
    And L1 stays a bad row, blocking only itself

  Scenario: STUCK a mark clears when its record goes without a pull (second review 4)
    Given A holds an invalid mark for T2 of S1
    When B deletes S1, so T2 is inert and its record is deleted
    Then nothing is pulled for T2
    And A's next pull carries refusals without T2, and A drops the mark
    And A shows no refused change

  Scenario: FRESH sign-out, a restore or a reinstall rebuilds the marks (second review 5)
    Given T2 of S1 is a bad row from A, and R1 waits from B
    When A signs out and in again, restores a backup, or is reinstalled
    Then A's first pull carries both records in refusals
    And A shows 1 refused change and 1 waiting change
    And the web's account page shows the same two counts
    And A shows the stored versions of S1's rows (Revision 4, item 9)

  Scenario: OWN an invalid ownership column keeps the row in its family (second review 6)
    Given T2 of R1 of S1 is stored
    When A pushes T2 with series_id null, and later a valid T3 of R2
    Then T2 is a bad row linked to R1, from its stored row
    And T3 waits, blocked by T2

  Scenario: REVAL a released payload that no longer validates becomes a bad row (second review 8)
    Given R1 and T1 wait on S1's bad row T2
    And the validator has since tightened, so T1's waiting payload fails it
    When T2 arrives fixed
    Then T2 is applied
    And T1 becomes a bad row at its own arrival
    And R1 keeps waiting, now blocked by T1

  Scenario: MOVEIN a row moved into a blocked family waits (second review 9)
    Given T2 of S1 is a bad row, and R5 of S2 is stored
    When A moves R5 to S1 and pushes it
    Then R5 waits, and its record links it to S1
    And a later fix of T2 releases R5 with S1's other waiting rows

  Scenario: ACCT account deletion removes the refusals (second review 3)
    Given a user with bad and waiting records
    When the account is deleted
    Then the dry run counts syncRefusals
    And no sync_* table keeps a row of that user

  Scenario: BUDGET the largest push stays within D1's limits
    Given 2,000 waiting rows of one family
    When one push of 500 changes fixes the family's bad row
    Then the batch has 2,506 statements and no statement binds more than 15 parameters
    And the route makes at most 5 reads before it
    And the evidence records the batch's wall time against the 30 s limit

  Scenario: BUDGET a large account stays fast (round 5, V5-3; Revision 4, item 10)
    Given 1,000, 2,500, 5,000 and 10,000 waiting rows of one family
    When one push of one tag, one fix that moves every blocker, and one fix
      that releases them are each timed
    Then at 10,000 rows the tag push takes under 5 s and each fix under 10 s
    And no statement binds 100 parameters, has 100 KB of SQL, or binds a 2 MB string
    And the evidence records the curve

  Scenario: GONE a push judged before an account deletion cannot land after it (round 5, V5-6)
    Given A's push of T1 (invalid) and T2 is judged
    When the account is deleted before the push's batch runs
    Then the guard's insert fails and the route answers 401
    And no sync_* table keeps a row of that user

  Scenario: GONE a push judged again after an account deletion cannot recreate it (round 6, V6-1; Revision 4, item 13)
    Given another account exists
    And A's push is judged from an existing sequence row
    And another device's push commits, so A's first batch fails its guard
    When the account is deleted before A's second attempt reads
    Then the second attempt's guard fails on the missing user and the route answers 401
    And no sync_* table keeps a row of that user, and the user stays deleted
    And a push whose first read follows the deletion is answered the same way
    And a push of an account whose user row alone is gone, while another
      account exists, is refused and stores nothing (round 7, F1)

  Scenario: TENANT one account's push leaves another's records alone (round 6, V6-2)
    Given accounts U1 and U2 that both hold S1 (a JSON import keeps a session's id)
    And each has a bad T2 and a rename of S1 waiting on it
    When U1 fixes T2, with S1's rename released, demoted, or moved to another blocker
    Then U2's records and stored rows, payloads and blockers included, are unchanged
```

**Properties** (generated trees and push sequences with `fast-check`,
already used in `shared/`): run over the pure judge in `shared/`, then the
same seeded sequences replayed against the Worker's D1 in `backend/`:

- **I1:** after every push, §11.4's blocked rule holds for every waiting
  record.
- **I2:** after every push, no member of a family is stored at an arrival
  after the family's first non-inert bad row, except rows moved into the
  family and rows stored through C4's gap.
- **I3:** two devices that each run cycles until both outboxes are empty
  show the same rows as the server (convergence).

### 11.11 Failure model (Revision 3)

| Failure                                                         | Caught by                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| A family member slips through within a push                     | F1–F3, F6; I2                                                |
| A family splits in a later push after a re-queue of the bad row | X9, X10                                                      |
| A lost response or a replay splits a family                     | X8, F9                                                       |
| A crash on the phone splits a family                            | X1, X1b                                                      |
| A firearm-family row waits on a sibling's refusal (C2)          | FIRE; I1                                                     |
| A refused or waiting row shows nowhere, or a mark never clears  | FRESH, STUCK, REV3                                           |
| A bad ownership column cuts a row out of its family             | OWN                                                          |
| A released payload no longer validates                          | REVAL                                                        |
| A row moved into a blocked family is released early             | MOVEIN                                                       |
| Account deletion leaves refused payloads behind                 | ACCT                                                         |
| A push recreates a deleted account                              | GONE                                                         |
| One account's push changes another account's records            | TENANT                                                       |
| A concurrent push answers 500 instead of retrying               | CONC                                                         |
| Sign-out, restore or a lost device drops a waiting row          | REV1, DISCARD                                                |
| Two devices' concurrent pushes split a family                   | CONC; the guard's mutants                                    |
| A family is never released                                      | H2', H7', H8', H13', ROOT, VC, DISCARD; I1                   |
| A stale link blocks the wrong family, or resurrects a row       | REV6, V1                                                     |
| A waiting edit overwrites a later edit from another device      | AB, X7, RELEASEFAIL                                          |
| This device's own echo replaces its waiting edit                | ECHO                                                         |
| A device stays behind after a shadowed pull                     | REV2, DUP; I3                                                |
| A block nothing on the phone points at                          | REV3                                                         |
| A deletion is held back or lost                                 | H10', V1, X5, VC                                             |
| Refused entries stall the outbox                                | H9'                                                          |
| A seq is consumed, or a half-write happens, on a refusal        | F1 `last_seq`; FIRST; the atomicity suite; one batch (§11.8) |
| A push breaks a D1 limit                                        | BUDGET; the limits table in §11.8                            |
| A new foreign key ships unclassified                            | F11                                                          |
| Old reasons change meaning                                      | N3; F10; §11.4's precedence                                  |

### 11.12 Existing data

Pre-1.0 (rule 8), with no compatibility path:

- **The server's D1 tables** change in `0000_sync_init` in place. A local
  `wrangler dev` database is recreated.
- **The phone's baseline** changes in place:
  - `sync_refused` and `held` go;
  - `sync_refusal_marks` is added;
  - item 6's trigger clause goes;
  - the journal `when` is bumped.

  The old install is cleared (`pm clear`), as for every baseline edit so
  far.

### 11.13 Questions for the maintainer (Revision 3)

- **Q1 Approve Revision 3 as revised?** The server keeps refused families
  and the waiting rows' payloads, and applies them in the batch that
  releases the family. The pull's `refusals` list drives the marks and
  counts on the phone and the web. **Recommended: yes.**
- **Q2 "Discard the refused change": in this change, or a follow-up?** The
  `refusals` list, the `blocker` field and the counts on both clients ship
  in this change either way. **Recommended: follow-up.** The action is a
  control on two clients plus the manual. Deleting the session or editing
  the row already releases a family.
- **Q3 Drop Revision 2 item 6** (the soft-delete clause in 28 triggers),
  which has nothing left to do? **Recommended: yes.**
- **Q4 Change the protocol in place at version 1?** That means:
  - `arrival` on pulled rows and acks;
  - `refusals` on pull responses;
  - `blocker` on `family_refused` acks;
  - `current` on `duplicate` acks;
  - a 503 when the guard keeps failing.

  **Recommended: yes** (rule 8).

## Revisions

- **Revision 1 (2026-10-14).** First draft, before implementation.
- **Approved (2026-10-16).** Q1–Q4 answered as recommended.
- **Revision 3 (2026-10-19).** The server remembers refused families and
  keeps the waiting rows; see §11. The first draft (`228185e`) was revised
  (`91d9c4d`) after a review judged it "sound with fixes". A second review
  judged the revision "sound with fixes" too, and its findings are applied
  (`f461e61`). It supersedes §2.3, §2.4, C4, C5, Revision 2 items 6–10, and
  parts of N1, N2, N4 and N6.
- **Revision 3 approved (2026-10-20).** By the maintainer: "Approve all",
  answering "Approve the revised #856 design (Revision 3) with the
  recommended answers to Q1–Q4?". Q1 yes; Q2 Discard is a follow-up issue;
  Q3 drop item 6; Q4 protocol in place at version 1.
- **Revision 4 (2026-10-20), during the Revision 3 build.** Each item is a
  place where the approved text was wrong or silent; the build follows the
  reading stated. Items 1–8 approved by the maintainer, 2026-10-20:
  "Approve", answering "Approve the 8 small corrections the rebuild made to
  the #856 spec (Revision 4)?". The round-5 fixes approved by the
  maintainer, 2026-10-20: "Fix, check again", answering "Fix the round-5
  findings in #856 as proposed, then run a sixth independent check?" (that
  answer also approves a sixth round). The proposal it approves covers:
  shadowing only on the device that sent the waiting change, with other
  devices showing the stored session and the counts everywhere; indexed
  lookups and a 10,000-row test; the missing concurrency test, the test and
  evidence corrections, the required protocol fields, and refusing a push
  that lands after the account is deleted. Items 9–12 match that
  proposal and are approved with it. The round-6 fixes approved by the
  maintainer, 2026-10-21: "Fix, check again", answering "Fix the round-6
  findings in #856, then run a seventh independent check?" (that answer
  also approves a seventh round). The proposal it approves covers: the
  guard refusing, on every attempt, a push whose account no longer exists,
  with a test of the race; tests that pin the user filter of the demotion,
  blocker and release/inert statements; and two wording corrections, the
  manual's sign-out sentence and the bound-string ceiling. Items 13 and 14
  match that proposal and are approved with it. The round-7 fixes approved
  by the maintainer, 2026-10-22: "Fix, check again" (that answer also
  approves an eighth round). The proposal it approves covers: a test that
  pins the guard's account check to the pushing user, with its mutant; the
  bound-string ceiling measured with the phone's ids; the manual's
  sign-out wording; and the Revision 4 item references. It changes items
  13 and 14 only in wording and figures. Any item beyond these approvals
  stays pending.
  1. **REVAL's T2 waits; it is not applied.** The scenario says "T2 is
     applied". Re-validation turns T1 into a bad row at T1's own arrival,
     which is earlier than the push that fixes T2. By §11.4's blocked rule
     and I2, T2 then arrives into a family whose first bad row is T1, so T2
     is `family_refused`, blocked by T1, as R1 is. The test expects that.
     The other lines of the scenario stand.
  2. **The batch is 5N + 7 statements, and a statement binds up to 45
     parameters.** §11.8 counts 5N + 6 and BUDGET says 2,506 and "no more
     than 15 parameters". The build adds one statement, the demotion of
     re-validated rows to bad rows (§11.5 names the step but §11.8 does
     not count it): 2,507 for 500 changes. The per-change idempotency
     insert binds each of `ok` and `notTombstoned` several times, so the
     largest statement binds 45 parameters, measured in BUDGET. D1's limit
     is 100 per statement, so BUDGET asserts fewer than 100 and records
     the measured figure.
  3. **ECHO needs two pushes.** As written, A pushes S1 "A1" and the
     invalid T2 in one push. Under F2 that push refuses S1 with its
     family, so "A1" is never applied and there is no echo to shadow. The
     test sends T2 first and "A1" in a second push, then "A2", which
     keeps the scenario's point: A's own older version comes back in a
     pull and is shadowed by its later waiting edit.
  4. **REV6's T2 is T3 of R2.** In the cast, T2 belongs to R1, so moving
     R1 to S2 moves its bad row with it, and S1 is no longer blocked. The
     test uses T3 of R2 as S1's bad row, which keeps the scenario's point.
  5. **N3: existing assertions gain the new fields.** Tests that compare
     whole acks with `toStrictEqual` now include `arrival`, `blocker` and,
     on a `duplicate`, `current` (§11.7's N1 allows it).
     `sync_idempotency` gains `blocker_table` and `blocker_row_id`, so a
     `duplicate` replays its blocker. ADV1 counts 5 D1 calls (4 reads plus
     the batch), where it counted 1. Every push bumps `state_rev`, a
     replay too, so C4 and C9 compare the snapshot without `state_rev` and
     assert its value apart.
  6. **The production foreign-key check is read from the build flags,
     not a dev build.** §11.6 says the build reads `PRAGMA foreign_keys`
     in the dev build. No dev build ran here. The evidence instead cites
     expo-sqlite 57.0.3's compile flags (`android/build.gradle`,
     `ios/ExpoSQLite.podspec`), which do not set
     `SQLITE_DEFAULT_FOREIGN_KEYS`, and `app/src/db/client.ts`, which sets
     no pragma. The dev-build read is still open.
  7. **Silent, decided by the phone (rule 11): the web's two lines show
     only when non-zero**, as on the phone. The web page has no sync state
     line, so its **Sync** card is absent when both counts are 0.
  8. **Silent: release ties sort by code unit.** `ORDER BY arrival,
table_name, row_id` uses SQLite's BINARY collation, so the judge
     sorts ties the same way rather than with `localeCompare`.
  9. **Only the device that sent a held version shadows with its mark
     (round 5, V5-1 and V5-2; a gap in the approved §11.6).** The
     approved table shadows every live change below a mark's arrival, and
     every device rebuilds its marks from the account's list. So a device
     that never held the waiting version also shadowed the stored one:

     - a fresh, reinstalled or signed-out device never applied a stored row
       that has a record, and showed S1's shots with no session;
     - a device that missed an applied edit kept an older version (T1 = 90
       where the server stores 80).

     That broke C6 ("other devices show the family as it was before the bad
     row"), "No device stays behind", and the manual. The build now gives
     each mark an `own` flag:

     - an ack's mark is the device's own;
     - a pull's list keeps a mark its own only when the device's own mark of
       that row is at the listed arrival;
     - sign-out, a restore and a reinstall drop every mark, so the next
       pull rebuilds them all as not its own.

     A mark that is not its own counts on Account & Sync and shadows
     nothing. Scenarios V5-1 and V5-2 (backend `sync-client.spec.ts`) pin
     it.

  10. **Each list is read once and joined by primary key; only changed
      blockers are rewritten (round 5, V5-3).** The approved statements
      matched each record against each list with an `EXISTS` over
      `json_each`, so a push's cost grew with the square of the user's
      waiting rows: 40 s at 6,000, above D1's 30 s for a batch, after
      which every push of the account would fail. Lists are now read with
      a row-value `IN`, or scanned and joined by primary key (`EXPLAIN
QUERY PLAN` in the evidence). The judge lists a blocker only when it
      differs from the one stored with the record, which `RefusalRecord`
      now carries. BUDGET gains the 10,000-row curve.

  11. **A push judged before an account deletion cannot land after it
      (round 5, V5-6).** The approved guard inserted `(?1, 0, 1)` whatever
      `?2` was, so a push judged before the deletion recreated the user's
      sequence row and wrote its rows and waiting payloads after it. The
      insert's `last_seq` is now null unless `?2` is 0 or the row exists;
      the route answers that failure with 401 and no retry (GONE).

  12. **An ack's delete spares a later mark (round 5, V5-8).** §11.6 said
      `applied` and `tombstoned` delete the row's mark. The build deletes
      it only up to the ack's arrival, and keeps a mark that arrived after
      the acked change. The text now says what the build does. That is
      the safer reading: deleting the later mark would let a pull overwrite
      a version the server still holds back, until the next pull's list
      rebuilt it, while keeping it costs at most one stale count, which
      that same list removes.

  13. **A push whose account is gone cannot recreate it, on any attempt
      (round 6, V6-1).** Item 11 kept a push judged from an existing row
      from recreating the account, and said the route does not judge
      again since a fresh read would find no row. The retry loop did judge
      again: when another device's push failed the first attempt's guard
      and the deletion committed before the second attempt read, that
      attempt read `state_rev` 0, its guard created the sequence row, and
      the push answered 200 with its rows stored for the deleted user. The
      guard's `last_seq` is now also null when the account's `user` row is
      gone, which every attempt checks in its own batch. That closes the
      limit item 11 left ("a first push that races a deletion still
      creates the row") as well. Tests that trust the bearer token as the
      user id create that user's row (`backend/test/dev-account.ts`), as
      better-auth's session lookup needs it in the Worker.

  14. **The 2 MB string ceiling is the walk's seed list, on every push
      (round 6, E6-1).** §11.8's limits table named the release key list.
      The longest string a push binds is the walk's seed list, every
      record of the user and its parent, which every push binds, a fix
      included. With the phone's UUIDv7 ids (36 characters) a shot or
      series record and its parent take about 99 characters and a session
      record 52, so D1's 2 MB string limit is about 20,000 to 38,000
      refusal records; past it every push of the account would fail. BUDGET's
      short test ids give about 34 characters a record, which round 6 first
      took for the ceiling (round 7, F2).

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
