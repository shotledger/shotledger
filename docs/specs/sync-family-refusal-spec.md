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
| A held row is never released                          | H2, H3, H7, H8                                                     |
| A held entry spins the push loop                      | H9                                                                 |
| A held row is lost (cleared without being sent)       | H3; engine tests on rev-matched hold                               |
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

## Revisions

- **Revision 1 (2026-10-14).** First draft, before implementation.
- **Approved (2026-10-16).** Q1–Q4 answered as recommended.
- **Revision 2 (2026-10-16), during implementation. Not yet approved:**
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
