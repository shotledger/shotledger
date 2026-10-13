# EVIDENCE — backups carry no sync bookkeeping; a restore starts sync afresh

Spec: [`backup-sync-bookkeeping-spec.md`](./backup-sync-bookkeeping-spec.md).

- **Spec approval: not obtained (autonomous run).** Confidence is
  correspondingly lower; the spec is the artifact to review after the fact.
- **Source state**: commit `764c8124` on `fix/757-backup-sync-bookkeeping`
  (from `origin/main` at `41b1b7fe`). This report is the only file added
  after it.
- **Tier**: 3 (sync state, data loss).
- **Isolation**: worktree `~/tmp/wt-757`, `pnpm i --frozen-lockfile`.
- **Reproduce**: `pnpm check && node scripts/manual-mutation-backup-sync.mjs`,
  then `pnpm check` again before `pnpm reqstool:status`. The mutation script
  overwrites the vitest JUnit file.
- **Tool versions**: vitest 5.0.3, better-sqlite3 13.0.3, typescript 6.0.2,
  node 26.10.0.

All numbers below come from runs after the last code edit.

## 1. Behaviors → tests

| #   | Test                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------- |
| B1  | `app/src/db/queries/sync-store.test.ts` "B1 empties the outbox, the cursors and the photo queue"        |
| B2  | same file, "B2 returns sync_control to a fresh install"                                                 |
| B3  | same file, "B3 leaves every synced table exactly as it was" (all 14 `SYNC_TABLES`, row for row)         |
| B4  | same file, "B4 queues the next local edit again, from rev 1"                                            |
| B5  | same file, "B5 recreates a missing sync_control row, so edits are still queued"                         |
| B6  | same file, "B6 makes the next sync pull every table from the start" (through the sync store's own read) |
| B7  | `app/src/db/backup/sync-bookkeeping.test.ts` "B7 a VACUUM INTO copy is reset while the live database…"  |

**RED observed**: with `resetSyncBookkeeping` stubbed to throw, all seven
failed (`Error: not implemented`). In B5, the precondition assertion (with no
`sync_control` row, an edit queues nothing) ran and passed before the throw. So
the failure mode B5 guards is real, not hypothetical.

## 2. Negative constraints

| #   | Evidence                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- |
| N1  | B7: the live database's outbox, cursors, control row and photo queue are unchanged after the copy is reset |
| N2  | B5, plus the mutants "sync_control is deleted" and "a missing sync_control row is not recreated"           |
| N3  | no file under `app/src/db/migrations/` changed; `schema.ts` unchanged                                      |
| N4  | `shared/src/backup/` unchanged                                                                             |
| N5  | "pendingCount and resetSyncState" passes unchanged; `resetSyncState` untouched                             |
| N6  | `pnpm-lock.yaml` unchanged; `licenses:check` green                                                         |

## 3. Gauntlet

| Layer                              | Command                                                                          | Result                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite + types + lint + format | `pnpm check`                                                                     | green. Vitest 202 files / 3281 tests, jest 66 suites / 726 tests. Gauntlet coverage still 100% (4045/4045 statements, 2589/2589 branches); `app/src/db` is outside that list |
| Changed-line coverage              | `vitest run … --coverage.include=app/src/db/queries/sync-store.ts`               | `resetSyncBookkeeping` fully covered. The file's only uncovered lines (183–188, `pendingRowKeys`) predate this change                                                        |
| Mutation                           | `node scripts/manual-mutation-backup-sync.mjs`                                   | **7/7 killed**, baseline pass first                                                                                                                                          |
| Mutation runner control            | same script plus one equivalent mutant (a comment edit), run from a scratch copy | reported `SURVIVED`, `7/8`, exit 1. The runner fails closed on a survivor                                                                                                    |
| Suite health                       | the two test files with `--sequence.shuffle`, three runs                         | 36/36 each run                                                                                                                                                               |
| Docs                               | `mkdocs build --strict`, `docs-translation-check.mjs`, `docs-anchor-check.mjs`   | all three pass                                                                                                                                                               |
| Traceability                       | `pnpm reqstool:tags && pnpm reqstool:status`, after a fresh `pnpm check`         | 21/21 tests passed, 0 SVCs missing tests                                                                                                                                     |
| Property tests                     | not used                                                                         | the input space is four fixed tables and one row. The behaviors list it exhaustively                                                                                         |
| Supply chain                       | n/a                                                                              | no dependency change                                                                                                                                                         |

## 4. Adversarial pass

- **Bundle captured mid-pull (`applying = 1`).** B2 and B4 start from
  `applying = 1`. After the reset, edits queue again.
- **Bundle with the control row missing.** B5.
- **Restore of a pre-restore bundle, or a bundle written before this change.**
  Restore runs the reset on whatever file it wrote, so neither depends on how
  the bundle was made.
- **Restored file from another schema.** Already refused before anything is
  written (`checkSchemaCompatibility`), so the reset never meets a missing
  table.

## 5. Deviations and honest limits

- **Real execution not performed.** No emulator or device was available, so
  `export-bundle.ts`, `restore-bundle.ts` and `openDatabaseFile` never ran under
  expo-sqlite. B7 rehearses the export path on the same function with
  better-sqlite3 `VACUUM INTO`. The restore call is one line that no test
  executes. **A device check is still owed**: export with an edit queued,
  restore, sync, and confirm the edit is not pushed and new edits queue.
- **Independent verification not performed.**
- **The cost in spec §2 is a product decision taken from the issue, not
  confirmed separately**: a restored edit that never synced is replaced by the
  account's copy of the row on the next pull.
