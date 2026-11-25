# SPEC — the phone pins SQLite foreign keys off and checks it

Source: the open item from the #856 sync review (Revision 4, item 6, in
[`sync-family-refusal-evidence.md`](./sync-family-refusal-evidence.md)):
"The production `PRAGMA foreign_keys` read in a dev build was not made."

**Tier 3**: the sync engine's apply path (`shared/CLAUDE.md`).

## 1. Current state

- §11.6 of [`sync-family-refusal-spec.md`](./sync-family-refusal-spec.md)
  decided that the phone applies a pulled child whose parent it does not
  hold (H7′, ROOT, DISCARD), as the server does (N5). That works only while
  SQLite foreign keys are **off** on the connection sync writes through.
- Nothing sets them. `app/src/db/client.ts` and `app/src/db/client.web.ts`
  open the database and set no pragma. Off holds only because expo-sqlite
  57.0.3 builds SQLite without `SQLITE_DEFAULT_FOREIGN_KEYS`
  (`android/build.gradle`, `ios/ExpoSQLite.podspec`). The web preview's
  wa-sqlite build ships as WASM; its flags were never checked.
- No build has ever read `PRAGMA foreign_keys`.
- If foreign keys were on (an expo-sqlite upgrade that changes its flags, a
  SQLite build that defaults them on, a future pragma), the orphan apply
  fails at `COMMIT`, because `applyRows` defers the check
  (`PRAGMA defer_foreign_keys = ON`). The whole pull page rolls back, the
  cursor does not move, and every retry fails the same way: sync stalls with
  no change the user can make to unstick it.

## 2. The rule

Every connection the app's data goes through **sets foreign keys off
itself and reads the setting back**. A read that is not `0` stops the app at
open with an error naming §11.6, before any screen or sync runs. The app no
longer depends on a compile default it does not control, and every launch
makes the read the review asked for.

Foreign keys are **not** turned on. That would undo §11.6 and N5 and needs
another way to hold orphans; it is out of scope here.

## 3. Behaviors

One module, `app/src/db/foreign-keys.ts`:

- **FK1** `checkForeignKeysOff(row)`: pure. `{ foreign_keys: 0 }` passes.
  `{ foreign_keys: 1 }` throws
  `Error('SQLite foreign keys are on; sync needs them off (docs/specs/sync-family-refusal-spec.md §11.6)')`.
  `null` (no row: a build with `SQLITE_OMIT_FOREIGN_KEY`, where they cannot
  be on) passes. Any other shape throws the same error (fail closed).
- **FK2** `pinForeignKeysOffSync(conn)`: runs `PRAGMA foreign_keys = OFF`,
  then `checkForeignKeysOff(conn.getFirstSync('PRAGMA foreign_keys'))`.
- **FK3** `pinForeignKeysOffAsync(conn)`: the same with `execAsync` and
  `getFirstAsync`, for the web connection, which opens async.
- **FK4** `client.ts` calls FK2 on the connection right after
  `openDatabaseSync`, before `drizzle(...)`.
- **FK5** `client.web.ts`'s `openWebDatabase` calls FK3 once, right after
  `openDatabaseAsync`, before resolving.
- **FK6** End to end on better-sqlite3 (which turns foreign keys **on** by
  default): a connection with foreign keys on, pinned by FK2, then reads `0`
  and applies the H7′ orphan through `createSyncStore(...).applyChanges`.
  Without the pin the same apply throws `FOREIGN KEY` (the existing pin
  test).

## 4. Must not change

- **N1** `createTestDb()` keeps foreign keys on by default, so every
  existing test still checks parents-first ordering; `{ foreignKeys: false }`
  stays the production-like option.
- **N2** `applyChangesSync` / `applyRows` unchanged, including
  `defer_foreign_keys`.
- **N3** No schema change, no migration, no new dependency, no UI string.
- **N4** The two short-lived connections in `app/src/platform/backup-fs.ts`
  (the `VACUUM INTO` copy and the restore's migrate-and-reset) are left
  alone: neither applies sync changes, and the app reloads after a restore,
  so FK4 runs again on the restored file.
- **N5** Drizzle's migrator runs inside `BEGIN … COMMIT`, where
  `PRAGMA foreign_keys` is a no-op (SQLite docs), so a generated migration's
  `PRAGMA foreign_keys=ON` cannot flip the live connection. Recorded, not
  changed.

## 5. Evidence plan

- Vitest tests in `app/src/db/foreign-keys.test.ts` (FK1–FK3) and `app/src/db/queries/sync-store.test.ts` (FK6); each
  seen failing first.
- Changed-line coverage 100% on `foreign-keys.ts` (`vitest --coverage`).
- Manual mutants (app code is outside Stryker): drop the `= OFF` exec; flip
  `0` to `1` in the check; treat `null` as failure; make the unknown shape
  pass; remove the FK2 call from a test's wiring. Each must be killed.
- `pnpm check` green.
- **Real execution:** the phone's web preview (wa-sqlite) logs the read
  before and after the pin once; the result goes in the evidence. An Android
  dev-build read stays with the maintainer (cloud sessions have no Android
  SDK), but FK4 makes every launch fail loudly if it ever reads `1`.

## 6. Setup

Branch `bugfix/phone-foreign-keys-pinned-off`. Files: this spec, its evidence
file, `app/src/db/foreign-keys.ts` and its test, `client.ts`,
`client.web.ts`, a one-line pointer in §11.6 and in the #856 evidence's
known limits. No dependency changes.
