# SPEC — the phone enforces SQLite foreign keys; sync holds orphans aside

Source: the open item from the #856 sync review (Revision 4, item 6, in
[`sync-family-refusal-evidence.md`](./sync-family-refusal-evidence.md)):
"The production `PRAGMA foreign_keys` read in a dev build was not made."

**Tier 3**: the sync engine's apply path, the local schema and the migration
gate (`shared/CLAUDE.md`).

**Revision 2.2 (2026-11-25), from review.** FK7 keeps an existing pending
entry (a newer pulled version) rather than overwriting it with the older
local row, and states that it runs with foreign keys off, so a parent with a
kept child is still moved. AP6 also drops a row's pending entry when the push
of its queued edit is acknowledged, so promotion cannot revert the edit.

**Revision 2.1 (2026-11-25), after approval.** From review: FK7 must not
move a row with a queued local change, or the push loses the edit. FK7, AP6
and rule 3 are amended and scenario KEEP is added. Found while implementing:
the sweep runs at open only (with foreign keys on, moving a parent would
fail on children it must keep), and rows in tables that do not sync stay in
place. Nothing else changes.

**Revision 2 (2026-11-25), approved by the maintainer.** Revision 1 pinned foreign keys **off** so that
§11.6's orphan apply kept working. The maintainer chose foreign keys **on**
for data consistency. This revision replaces it. Revision 1's code is on the
branch's history (`1f4d189`) and is reverted by this one.

## 1. Current state

- Nothing sets the pragma. `app/src/db/client.ts` and `client.web.ts` open
  the database as SQLite builds it: foreign keys off (expo-sqlite 57.0.3 sets
  no `SQLITE_DEFAULT_FOREIGN_KEYS`; the web preview's wa-sqlite read `0`).
- The schema declares 14 foreign keys (`0000_baseline.sql`), all
  `ON DELETE no action`. With enforcement off they document intent only. A
  row can point at a parent that does not exist and nothing notices.
- The tests already run with foreign keys **on** (`createTestDb`), so every
  local query the suite reaches works under enforcement. Production is the
  odd one out.
- §11.6 of [`sync-family-refusal-spec.md`](./sync-family-refusal-spec.md)
  relies on enforcement being off. A pull can bring a child whose parent this
  device will never hold:
  - **ROOT / H7′**: the parent was refused, never stored, then deleted on
    another device. The device pulls a tombstone for a row it never had (a
    no-op) and the children, applied under it (N5).
  - **DISCARD** (#943): the parent is discarded on the device that holds it;
    every other device gets its children only.
  - **Out of order**: a child pushed before its parent by a slow device
    arrives a cycle earlier than the parent.

## 2. The rule

1. **Every app connection runs with foreign keys on**, set and read back at
   open. A read that is not `1` stops the app at open.
2. **A pulled row whose parent this device does not hold is not written to
   its table.** It goes to a new bookkeeping table, `sync_pending_rows`,
   and is promoted into its table, in the same transaction, as soon as every
   parent it names is there.
3. **The database holds no dangling reference it does not have to.**
   `foreign_key_check` runs after migrations at every open; any row it reports is moved aside the same way, **except a
   row with a queued local change**, which stays until its push is
   acknowledged (FK7, Revision 2.1).

What the user sees does not change: an orphan was never visible (the screens
reach rows through their session or firearm), and a pending row is not
either. When its parent arrives, both show.

### Why this route

| Option                                             | Verdict                                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parent-first ordering only                         | **Rejected.** Already in place (`APPLY_ORDER`). It cannot help when the parent never arrives (ROOT, DISCARD) or arrives a cycle later.                                                     |
| `defer_foreign_keys` in the pull transaction only  | **Rejected as the fix, kept as a guard.** Already in place. It covers a parent later in the same transaction; any parent that never comes fails the commit and stalls sync on every retry. |
| `DEFERRABLE INITIALLY DEFERRED` on the schema      | **Rejected.** Same limit as the pragma, and SQLite can only add it by rebuilding all 10 child tables.                                                                                      |
| Placeholder parent rows                            | **Rejected.** Parents have NOT NULL columns with no honest value, and a placeholder session would show in lists and counts.                                                                |
| Drop orphans                                       | **Rejected.** Loses the out-of-order case: the parent does arrive later and its children must be there.                                                                                    |
| **Pending table, promoted when the parent exists** | **Chosen.** Enforcement holds everywhere, no data is dropped, out-of-order and never-arriving parents both work, and the server and wire format are unchanged.                             |

Foreign keys add **integrity, not security**: they stop a row from pointing
at nothing (a bug, a bad sync payload), so every screen and export can trust
the joins. They do not protect against an attacker; the device's data is
the user's own.

## 3. Schema

Migration `0001_sync_pending_rows.sql` (appended, Drizzle-generated):

```
sync_pending_rows(
  table_name TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  payload    TEXT NOT NULL,   -- the ChangeRow, JSON
  PRIMARY KEY (table_name, row_id)
)
```

Client-only, like `sync_outbox`: no outbox trigger, not synced, emptied by
`resetSyncBookkeeping` and `resetSyncState`, so no backup carries it.

## 4. Behaviors

### Connection (`app/src/db/foreign-keys.ts`)

- **FK1** `checkForeignKeysOn(row)`: `{ foreign_keys: 1 }` passes. `0`, no
  row (a build without foreign-key support), or any other shape throws
  `Error('SQLite foreign keys are off; the app needs them on (docs/specs/phone-foreign-keys-spec.md)')`.
- **FK2** `client.ts` and `client.web.ts` open with foreign keys **off**,
  so migrations can rebuild tables as SQLite's documented procedure requires
  (`PRAGMA foreign_keys` is a no-op inside the migrator's transaction).
- **FK3** The migration gate (`migration-gate.tsx`, `.web.tsx`), after
  migrations succeed: runs the **sweep** (FK7), then
  `PRAGMA foreign_keys = ON`, then FK1 on the read-back. Only then does the
  app render. Any failure shows the gate's existing error screen.
- **FK4** Restore: the restored connection is migrated with foreign keys off
  as today; the app reloads, so FK3 runs on the restored file.

### Apply (`app/src/db/queries/sync-store.ts`)

- **AP1** A pulled live row whose every non-null foreign-key column names a
  row present in its parent table (deleted or not) is written as today.
  Parents are read from `PRAGMA foreign_key_list`, cached per table.
- **AP2** A pulled live row with a missing parent is written to
  `sync_pending_rows` (insert or replace by `(table_name, row_id)`), and
  its table is not touched. If the row already exists locally (an update that
  moves it under a parent this device lacks), the local version stays until
  promotion.
- **AP3** A pulled tombstone deletes the row's pending entry, then updates
  the table as today.
- **AP4** Any pulled row written to its table deletes its pending entry: the
  newer version wins.
- **AP5** Promotion: after the batch's rows, in the same transaction, one
  pass over the pending entries in `APPLY_ORDER`, which puts every parent
  table before its children. An entry whose parents now exist is written as
  AP1 and removed. Chains (a shot under a pending series under a pending
  session) promote in the pass that brings their root. (Implementation
  note: the approved text said "until a pass promotes nothing"; a second
  pass can never promote anything after an `APPLY_ORDER` pass, so the loop
  was dead code, shown by a surviving mutant.)
- **AP6** An entry whose row **is in its table** and has a queued outbox
  entry is dropped, not promoted: the local row is newer, and its push sends
  it (the push reads the row from its table, so it is there to send). No
  other pending entry can have an outbox entry: a row that is only pending
  has no local copy to edit, and FK7 never moves a row with a queued change.
  The same holds after the push: acknowledging the outbox entry deletes the
  row's pending entry in the same transaction, whatever the outcome
  (Revision 2.2, from review). The push sent the newer local version, so
  promoting the older pulled one later would revert the edit; a refusal that
  returns the server's current row applies it through AP1 to AP4 as before.
- **AP7** `defer_foreign_keys` stays on in the apply transaction. A
  violation at commit (a case AP1 missed) rolls back the whole batch, as
  today; tests prove none of the scenarios reach it.

### Sweep (FK7)

- **FK7** `PRAGMA foreign_key_check`, after migrations at open (foreign
  keys still off). Only at open: with foreign keys on, moving a parent would fail on its kept children. Each reported row
  **without a queued outbox entry** is copied to `sync_pending_rows` as a
  live `ChangeRow` built from its current columns and deleted from its table.
  If `sync_pending_rows` already holds an entry for that key, the entry is
  kept: it is a newer pulled version (AP2, AP4). The local row is still
  deleted (Revision 2.2, from review). The sweep runs with foreign keys off,
  so deleting a parent that a kept child still references does not fail;
  that child then dangles, as SQLite allows, until the parent is promoted.
  Repeat until no movable row is reported (deleting a row can orphan its
  children). One transaction.
  A reported row in a table that does not sync (`shot_marks`,
  `training_samples`) also stays: it has no pending form, and it is valid
  again once its parent is promoted.
  A reported row **with** a queued outbox entry stays in its table, so the
  push reads it and sends it; deleting it would make the push treat the
  entry as a hard delete and drop the edit (Revision 2.1, from review). Once
  the push is acknowledged and the entry is gone, the sweep at the next open moves it.
  SQLite allows an existing violation to stay while foreign keys are on; it
  only refuses a write to that row, and an orphan has no screen to edit it
  from. This is also the one-time move of orphans already on a
  device from the foreign-keys-off era: no data migration is needed, and it
  heals any later inconsistency the same way.
- **FK7a** Scenario KEEP: an orphan with a queued edit survives the sweep in
  its table, is pushed with its edit, and is moved to `sync_pending_rows`
  by the sweep at the next open after the push's ack.
- **FK8** The sweep's count goes to the dev log; no UI.

### §11.6 scenarios, restated

- **H7′ ROOT DISCARD** (`sync-store.test.ts`): the orphan series lands in
  `sync_pending_rows`, not `series`; the commit succeeds with foreign keys
  on; sync's cursor moves.
- **LATE**: the orphan's session arrives in a later pull; both are in their
  tables after it and the pending table is empty.
- **CHAIN**: shot, series and session arrive in three pulls in reverse
  order; all three are in their tables after the third.
- **STALE**: a pending series, then its tombstone: the entry is gone and
  `series` is untouched.
- **NEWER**: a pending version, then a newer version whose parent exists:
  the newer is written, the entry is gone.
- **LOCAL**: a pending entry for a row with a queued outbox entry is dropped
  at promotion; the local row is unchanged.

## 5. Must not change

- **N1** The server, the protocol, the wire format and the web app.
- **N2** `createTestDb()` keeps foreign keys on; the `{ foreignKeys: false }`
  option is removed once no test needs it.
- **N3** Every existing test passes unchanged, except the three §11.6 orphan
  tests, whose expected table moves from `series` to `sync_pending_rows`
  (a spec change, recorded here).
- **N4** Push, outbox triggers and refusal marks unchanged.
- **N5** No new dependency, no UI string.

## 6. Size and risk

- **Size**: one migration and table, about 150 lines in `sync-store.ts`
  and `foreign-keys.ts`, the two migration gates, the two reset functions,
  about 20 tests, and the doc updates (§11.6, `ARCHITECTURE.md` § Local-first,
  manual unchanged). Roughly one working session.
- **Risks and their guards**:
  - _A local write path that breaks under enforcement_: the suite already
    runs with foreign keys on; plus a web-preview run that loads `/dev`
    demo data, edits, deletes and syncs.
  - _A future migration that rebuilds a parent table_: migrations run with
    enforcement off (FK2), then the sweep and the check (FK3).
  - _A pending row that never promotes_ (ROOT, DISCARD): it is invisible,
    bounded by the refused families, and cleared by sign-out or restore.
  - _An existing row hidden by the sweep_: only a row that points at
    nothing, which no screen could show anyway.

## 7. Evidence plan

- RED first for every behavior; changed-line coverage 100% on the new code.
- `scripts/manual-mutation-foreign-keys.mjs` rewritten for the new code:
  mutants in the parent check, promotion loop, tombstone and newer-version
  handling, outbox drop, sweep loop and the read-back.
- A property test (fast-check): any order of a generated session/series/shot
  family across pulls ends with every row in its table and an empty pending
  table, and foreign-key-check empty after every pull.
- `pnpm check` green.
- Real execution: web preview reads `1` after the gate; `/dev` demo data,
  an edit, a delete and a sync against `wrangler dev`.

## 8. Setup

Branch `bugfix/phone-foreign-keys-pinned-off` (PR #944), renamed in the PR
title to say foreign keys are enforced. Files: this spec and its evidence,
the migration and its snapshot, `schema.ts`, `foreign-keys.ts` and its test,
`sync-store.ts` and its test, a property test, the two clients and the two
gates, `ARCHITECTURE.md`, §11.6 pointer. No dependency changes.
