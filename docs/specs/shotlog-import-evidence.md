# ShotLog CSV import — evidence report

> old-coder EVIDENCE for `docs/specs/shotlog-import-spec.md`. The spec is
> the contract; this is the proof that the code meets it. The maintainer
> reviews these two documents rather than the diff.

## 1. What was built

| Layer                                   | File                                             | Reviewed by         |
| --------------------------------------- | ------------------------------------------------ | ------------------- |
| CSV → rows (§2)                         | `shared/src/shotlog/parse.ts`                    | gauntlet            |
| tag vocabulary + defaults (§3)          | `shared/src/shotlog/tags.ts`                     | gauntlet            |
| mapping → suggestions (§3)              | `shared/src/shotlog/classify.ts`                 | gauntlet            |
| stable `external_ref` (§4)              | `shared/src/shotlog/ref.ts`                      | gauntlet            |
| lost dates, in-file duplicates (§5)     | `shared/src/shotlog/dedup.ts`                    | gauntlet            |
| plan assembly, statuses, bulk edit (§6) | `shared/src/shotlog/plan.ts`                     | gauntlet            |
| write path (§7)                         | `app/src/db/queries/shotlog.ts`                  | integration tests   |
| screen glue (§7)                        | `app/src/features/shotlog/use-shotlog-import.ts` | device verification |
| mapping + preview screen (§7)           | `app/src/app/dev/shotlog-import.tsx`             | device verification |

No new dependency, no schema change, no migration; `shared/src/scoring/**`
untouched. `CreateSessionInput.externalSource` widened to accept
`'shotlog'` — the only edit to an existing query module.

## 2. Gauntlet results

| Layer                            | Command                                    | Result                                                             |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Types, lint, format, i18n, tests | `pnpm check`                               | green — 1122 vitest tests / 77 files, 108 jest tests               |
| Coverage (v8, 100% gate)         | `pnpm coverage`                            | 100% statements / branches / functions / lines                     |
| Mutation (Stryker)               | `pnpm mutation`, `shared/src/shotlog/*.ts` | **100.00%** — 604 mutants, 603 killed, 1 timed out, **0 survived** |

Per-file mutation score, all 100.00%: `plan.ts` 178 · `parse.ts` 141 ·
`classify.ts` 111 · `tags.ts` 93 · `dedup.ts` 66 · `ref.ts` 14
(+1 timeout).

**No surviving mutants, so no equivalence arguments are owed.** The single
timeout is in `ref.ts`'s FNV loop, where a mutated loop condition does not
terminate — a killed mutant by Stryker's own accounting.

`vitest.config.ts` coverage `include` and `stryker.config.json` `mutate`
both gained `shared/src/shotlog/**`, so these gates now run on every
future change to this module rather than only today.

Test counts for the module: 215 (`classify` 42, `parse` 37, `tags` 37,
`plan` 34, `dedup` 31, `ref` 12, barrel 1, DB write path 22).

## 3. Defects found and fixed while proving the spec

- **Line numbers drifted past a quoted line break.** §2 promises the file
  line the user sees; the first implementation used the CSV _record_
  index, so a session name containing a newline shifted every later
  error by one. `parse.ts` now measures each record's physical span
  (`lineSpan`) and advances the counter by it, blank records included.
  Covered by three break flavours (LF, CRLF, bare CR) plus the
  skipped-blank-record case.
- **A real value from the maintainer's export had leaked into fixtures.**
  The bulk-import timestamp quoted in §1.1 was used verbatim as the
  lost-date fixture in `plan.test.ts` and `shotlog.test.ts`, against §0's
  real-data rule (a date is one of the listed field kinds). Replaced with
  a synthetic instant and removed from the spec text; the aggregate
  counts (277 rows, 119 sharing one stamp, 41 with `(X)` > `Number of X`)
  stay, as §0 permits.

- **The import button's count could exceed what would be written.** Every
  `new` row was pre-selected, including rows the write path refuses for
  having no discipline. The first device run said "Import 9 selected" and
  then "Imported 8 sessions (1 skipped)". `useShotlogImport` now clears
  the selection on any row `isShotlogRowImportable` rejects, both on the
  first plan and on "Select all"; the second run said 8 and imported 8.
- **The tag-mapping card stalled the UI thread.** Rendering every role as
  a chip for every tag at once (~22 × N) produced an "app isn't
  responding" dialog on the emulator. Each tag is now one row showing its
  chosen role, and only the tag the user opens renders its picker.

## 4. Spec invariants, and where each is proven

| Invariant (§7)                                                                               | Proof                                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| No existing test weakened or deleted                                                         | `git diff` touches no existing test file                                                                                   |
| No new dependency, no schema change, no migration                                            | `package.json` and `app/src/db/migrations/` unchanged                                                                      |
| `shared/src/scoring/**` untouched                                                            | `git status`                                                                                                               |
| Nothing writes before the user confirms                                                      | `useShotlogImport.planImport` calls only pure `buildShotlogImportPlan`; every write lives in `importShotlogRow`            |
| `error` / `exact-duplicate` / `duplicate-in-file` can never be written, whatever the UI says | `isShotlogRowImportable` is re-applied inside `importShotlogRows`, tested directly in `app/src/db/queries/shotlog.test.ts` |
| Re-importing the same file is a no-op                                                        | `buildShotlogRef` is deterministic; §6's `exact-duplicate` outranks `empty` (revision R1); verified on device, §5 step 6   |

## 5. Device verification (Android, AVD `shotledger2`)

A **synthetic** 12-row CSV — invented names, invented dates — pushed to
`/sdcard/Download/` and imported through the real UI. It exercises: a
quoted name with an embedded comma, a `Tävling` competition row, an
`A Opt` row, a `Milsnabb`/`Final` row, a three-row shared-timestamp
(lost-date) group, a zero-total empty row, an exact repeat of an earlier
row, a row with no weapon-group token, a malformed datetime, and a row
with no tags at all.

Steps and screenshots (`docs/` links are to the run's scratchpad, not the
repository — screenshots are not committed):

1. `/dev` with the "Import from ShotLog (dev)" entry — `10-dev.png`
2. The tag-mapping card: every distinct tag with its default role —
   `11-tag-mapping.png`, `12-tag-mapping-more.png`
3. One tag's role picker, open, with the current role selected —
   `13-role-picker.png`; the plan rebuilt after changing it —
   `14-role-changed.png`
4. Per-row verdicts, warning chips, and the import button whose count
   matches what will be written — `15-import-button.png`
5. Result after importing — `16-imported.png`
6. A firearm-role tag creating the firearm it names —
   `17-firearm-tag.png`, `18-firearm-imported.png`
7. Earlier run, before the entry point moved to `/dev`: preview
   (`03-preview.png`), row verdicts (`04-rows.png`), result
   (`05-imported.png`), re-import dedup — every row "Already imported",
   nothing selected (`06-reimport-dedup.png`), and the imported sessions
   in the logbook (`07-sessions.png`).

Verified in the database after each run: eight sessions with the right
names, timestamps, disciplines, weapon groups and shooter classes; one
total-override series each at the right tenths with `total_override_shot_count`
NULL; `is_final` set only on the `Final`-tagged row; `is_sighter` never
set and the sighter row's total unchanged; the notes carrying the ten and
inner-ten counts; and `Pistol Nine` created as a firearm and linked.

**Known, pre-existing:** the Home screen shows `0` as an imported
session's total, because `useHomeData` sums `shots` rows. Every
total-override session has the same problem, Webshooter imports included,
so it is out of scope here — but it is worth a follow-up.

## 6. VERIFY items — answered by the maintainer 2026-09-02

All four are resolved; see spec §1.1 for the wording the code follows.
`Number of X` = tens and `(X)` = inner tens; `Warmup` means the total
includes a sighter; `A Opt` is a real SPSF class; the shared timestamp is
a lost date. **One follow-up remains open** — see §7.

### Superseded reading (kept for the record)

1. **Does `Number of X` mean tens, and `(X)` inner tens?** 41 of 277 real
   rows have `(X)` > `Number of X`, which a strict subset reading forbids.
   Current behaviour: `(X)` is carried as the inner-ten count, `Number of
X` is recorded in the session note only, and the discrepancy raises a
   per-row warning. Neither number is written to a scored column.
2. **Does `Warmup` mean the session total includes a sighter series?**
   Current behaviour: recorded as the tag `shotlog:includes-sighter` and a
   note line; the total is never adjusted and no sighter series is invented.
3. **Is `A Opt` a real class?** Read as weapon group A with optics and
   _suggested_ as `spsf:A-opt`, never applied without the user selecting
   the row.
4. **The lost dates.** 119 of 277 rows share one bulk-import timestamp.
   Current behaviour: imported at that timestamp (nothing better exists),
   tagged `shotlog:date-unknown`, noted, and flagged in the preview.
   Known limitation, recorded rather than silently handled:
   date-sensitive statistics do not exclude these sessions, because no
   `date_uncertain` column exists and adding one needs a migration and a
   stats-layer contract that does not exist yet.

## 7. Open follow-up — a missing column, not a missing decision

The maintainer asked that `Number of X` and `(X)` be mapped onto "the
app's tens/inner-ten counters". **There is no such counter to write to.**
Ten and inner-ten statistics in `shared/src/scoring` count `is_inner_ten`
flags on `shots` rows, and a total-override series deliberately has none —
that is the whole point of the WS1 granularity the Webshooter import
already uses. Storing them needs a new session- or series-level column,
which is a schema change (Drizzle migration, hard rule 2) plus a
stats-layer contract that does not exist yet.

Rather than guess at either, both numbers are written verbatim and
correctly labelled into the session note
(`ShotLog: 8 tens, 3 inner tens`), and rows whose `(X)` exceeds
`Number of X` still raise `inner-ten-exceeds-ten-count`. **This is the one
instruction from 2026-09-02 that is not fully carried out, and it needs a
maintainer decision:** add the column and the migration, or leave the
counts in the note.
