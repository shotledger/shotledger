# SPEC — backups carry no sync bookkeeping; a restore starts sync afresh

Source: issue #757 (from the #727 data-model review, Theme 3.3).

**Spec approval: not obtained (autonomous run).** This document is for the
maintainer to review after the fact. Evidence:
[`backup-sync-bookkeeping-evidence.md`](./backup-sync-bookkeeping-evidence.md).

**Tier 3**: sync state and data loss. Old-coder applies because this changes the
sync client's state (`shared/CLAUDE.md`).

**This reverses a recorded decision.** `backup-export-spec.md` Part 1 kept the
four client-only sync tables in a bundle on purpose, because it treated restore
as a same-account replace. The issue shows that assumption does not hold. That
paragraph now points here.

## 1. The defect

A bundle is a `VACUUM INTO` copy of the whole database, and restore replaces the
database file. A restored bundle therefore brings back the exporting device's
sync bookkeeping:

| Table          | What goes wrong after a restore                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_outbox`  | An edit that was queued at export time is pushed again. The server orders by arrival, so the **old payload overwrites newer edits** from any device.              |
| `sync_state`   | On a device signed into a **different account**, the first account's cursors stay. The second account's rows with `seq ≤ cursor` are never pulled until sign-out. |
| `sync_control` | `last_rev` and `applying` belong to the exporting device. If a bundle captured `applying = 1`, the outbox triggers stay off and no edit is ever queued.           |
| `photo_queue`  | Entries carrying the exporting device's `file://` paths are retried.                                                                                              |

## 2. The rule

The four tables are device bookkeeping, not user data. **A bundle carries none
of it, and a restore starts sync from scratch.** One function,
`resetSyncBookkeeping(db)` (`app/src/db/queries/sync-store.ts`), does both jobs:

- it empties `sync_outbox`, `sync_state` and `photo_queue`;
- it sets `sync_control` row 0 to `applying = 0, last_rev = 0`. The row is
  **written, never deleted**: the outbox triggers read `applying` from row 0,
  and with no row there `NULL = 0` is false, so every later edit would silently
  stop being queued.

It runs in two places:

- **export**, on the `VACUUM INTO` copy before it is serialized
  (`export-bundle.ts`). The live database is never touched.
- **restore**, on the replaced database file before the app reopens it
  (`restore-bundle.ts`), through a short-lived connection
  (`openDatabaseFile` in `platform/backup-fs.ts`). This also covers a bundle
  written before this change, and the pre-restore bundle.

With no cursor rows, every cursor reads 0, so the next sync re-pulls everything.
Applying a pull is an upsert, so that is safe. `photo_queue` is rebuilt from the
series rows before every sync (`reconcilePhotoQueue`), so emptying it loses
nothing.

### What this costs, stated plainly

- An edit still queued when the backup was made is **not** pushed after a
  restore. The edit is still in the restored row. But a row the server also
  holds is replaced by the server's copy on the next pull, because nothing marks
  it pending any more. A row the server never had stays on the device and is
  pushed only when it is next edited. That was already the case for every row
  that was not queued at export time.
- On a signed-in device, a restore followed by a sync brings back the account's
  current copy of every row the account holds.

This is the trade the issue chose: replaying a stale outbox could overwrite
other devices' newer edits without anyone noticing, and that is worse than
losing the "needs push" mark on this device's own unsynced edits.

## 3. Behaviors (each a named test)

| #   | Given                                                                     | Then                                                                                       |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| B1  | queued outbox entries, cursors and photo-queue rows                       | all three tables are empty                                                                 |
| B2  | `sync_control` at `applying = 1, last_rev = 7`                            | row 0 is `applying = 0, last_rev = 0`                                                      |
| B3  | a logbook with rows in the synced tables                                  | every synced table holds exactly the same rows afterwards                                  |
| B4  | after the reset                                                           | a local edit is queued again, at rev 1                                                     |
| B5  | `sync_control` row 0 missing                                              | the row is recreated, and a local edit is queued                                           |
| B6  | after the reset                                                           | every cursor the sync store reads is 0                                                     |
| B7  | export: a live DB with bookkeeping, copied with `VACUUM INTO`, copy reset | the copy has none, the live DB's bookkeeping is unchanged, and user rows are equal in both |

## 4. Negative constraints

- N1: export never changes the live database's bookkeeping (B7).
- N2: `sync_control` row 0 is never left missing (B5).
- N3: no schema change and no migration.
- N4: `BACKUP_CONTAINER_FORMAT_VERSION` is not bumped; manifest unchanged.
- N5: sign-out's `resetSyncState` behaves as before. Its existing test passes
  unchanged.
- N6: no new dependency.

## 5. Failure model

| Mode                                                         | Caught by                                             |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| Reset deletes the `sync_control` row and edits stop syncing  | B4, B5                                                |
| Reset reaches a user table                                   | B3 (every synced table compared row for row)          |
| Export clears the live device's outbox instead of the copy's | B7                                                    |
| A table is left out of the reset                             | B1, B2, plus manual mutants that drop each statement  |
| Restore glue never calls the reset                           | not caught by a test: the glue needs expo-sqlite (§6) |

## 6. Known limits

- The two glue call sites (`export-bundle.ts`, `restore-bundle.ts`) and
  `openDatabaseFile` run only under expo-sqlite, which is not available in
  vitest or jest here. B7 rehearses the export path with better-sqlite3
  `VACUUM INTO`. The restore call is one line and is not executed by a test.
  A device check of export → restore → sync is still owed.

## 7. Setup plan

- Isolation: worktree `~/tmp/wt-757` on `fix/757-backup-sync-bookkeeping`,
  from `origin/main`, `pnpm i --frozen-lockfile`.
- Files: `app/src/db/queries/sync-store.ts` (+ test),
  `app/src/db/backup/export-bundle.ts`, `app/src/db/backup/restore-bundle.ts`,
  `app/src/platform/backup-fs.ts`, `app/src/db/backup/sync-bookkeeping.test.ts`,
  this spec and its evidence, `backup-export-spec.md` (pointer), the manual's
  backup guide (EN + SV).
- Mutation: `app/src/db` is outside Stryker's `mutate` list, so this uses
  manual mutants added to `scripts/manual-mutation.mjs`. Each mutant now names
  its own test directories.
- New dependencies: none.
