# Schema cleanup (#727), PR A — evidence report

Spec: [`schema-cleanup-727-spec.md`](./schema-cleanup-727-spec.md), **approved
by the maintainer on 2026-10-13** for §1–§3 and §6. §4 (PR B) is not part of
this report.

**Tier 3.** Source state: branch `refactor/727-schema-cleanup` at `950e8b2`,
rebased onto `main` after #783 (ShotLog per-shot import) merged first; every
number below is from runs on that tree. Node 26.11.1, pnpm 12, as
pinned. No dependency added, so no license regeneration and no audit.

## Failure model

| Way this change can hurt                                                      | Layer that catches it                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A re-import duplicates a session, because the dedupe key changed shape        | R1/R2 golden values; R3 cross-source tests on both matchers; the round-trip test on unprefixed refs     |
| A ref from one source matches a session from the other                        | R3 tests: equal strings, different `external_source`, no match (WebShooter and ShotLog)                 |
| A device on an older build pushes the dropped columns and the pull breaks     | C3 test applying old-shape rows through the real apply path                                             |
| A backup made before this change restores the old column set over the new one | journal `when` bumped; `checkSchemaCompatibility` (existing `compat.test.ts`) refuses a different stamp |
| A build ships the old baseline (Metro cache)                                  | `migrations.test.ts` checks the `baseline sha256` line                                                  |
| The web builds rows the phone schema no longer has                            | `web-rows.test.ts` A1 column parity between `rows.ts` and `schema.ts`                                   |
| The shoot-off flag is lost on export → import                                 | S5 tests in `from-rows`, `import`, `round-trip` (app)                                                   |
| A user-typed maintenance kind "adjustment" is mislabeled                      | A3 test                                                                                                 |

## Behavior → test mapping

| Spec | Behavior                                                            | Verified by                                                                                                                                        |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | Three columns gone from schema, baseline, web row builders          | `app/src/db/migrations.test.ts` (baseline hash), `app/src/db/queries/web-rows.test.ts` A1 (column parity), `shared/src/sync-client/rows.test.ts`   |
| C2   | WebShooter and ShotLog imports create the same rows                 | `app/src/db/queries/webshooter.test.ts`, `shotlog.test.ts` (unchanged apart from the removed fields)                                               |
| C3   | Old-shape pulled payloads apply; the dropped keys are ignored       | `app/src/db/queries/sync-store.test.ts` "C3 applies rows from a build that still has the columns #727 dropped"                                     |
| R1   | `buildExternalRef(363, 35937)` → `'363:35937'`                      | `shared/src/integrations/webshooter/reconcile.test.ts` R1                                                                                          |
| R2   | ShotLog ref carries no prefix                                       | superseded by #783: the ref is ShotLog's own Session ID (`S-0a1b2c3d`) and `ref.ts` is gone; `shotlog.test.ts` asserts the stored ref              |
| R3   | Exact match compares `(external_source, external_ref)`              | `reconcile.test.ts` R3; `shared/src/shotlog/dedup.test.ts` "never matches another source's session with the same ref" (from #783)                  |
| R4   | Export/import carry the unprefixed ref                              | `app/src/db/json-export/round-trip.test.ts` (#7xx external refs block), regenerated JSON Schema (`pnpm schema:check`)                              |
| R5   | `external_source` set whenever `external_ref` is                    | `webshooter.test.ts` "creates a competition session…" and `shotlog.test.ts` "creates a session…" assert both                                       |
| S1   | `series.note` → `series.is_shoot_off`                               | schema + baseline; `web-rows.test.ts` A1                                                                                                           |
| S2   | `results_distinguish` → `isShootOff: true`, elsewhere false         | `mapping.test.ts` (three section tests), `webshooter.test.ts`                                                                                      |
| S3   | A shoot-off series still scores                                     | unchanged scoring code; screenshot below (374 = 7 × 47 + 45)                                                                                       |
| S4   | Phone and web show a Shoot-off chip                                 | `web/src/sessions/browse.test.ts`; real execution below                                                                                            |
| S5   | Export carries `isShootOff`; import restores it                     | `from-rows.test.ts` S5, `import.test.ts` "isShootOff (#727)" (default and reject), `round-trip.test.ts` S5                                         |
| A1   | `is_adjustment` column                                              | schema + baseline                                                                                                                                  |
| A2   | Adjustment writes `is_adjustment = 1`, `kind = ''`, reason in notes | `app/src/db/queries/maintenance-events.test.ts` A2                                                                                                 |
| A3   | Label by flag; typed "adjustment" shown as typed                    | `app/src/features/firearms/maintenance-event-lines.test.ts` A3 (two tests)                                                                         |
| §3.5 | Stale comments                                                      | `schema.ts` syncOutbox comment, `protocol.ts` MAX_PAYLOAD_BYTES comment                                                                            |
| N1   | 14 synced tables, triggers, protocol version unchanged              | `app/src/db/sync-apply-order.test.ts`, `migrations.test.ts`; protocol constant untouched                                                           |
| N2   | Tests changed only where they assert a removed column or old format | see "Tests changed" below                                                                                                                          |
| N3   | Gates                                                               | gauntlet table                                                                                                                                     |
| N4   | Manual EN + SV                                                      | `docs/manual/guides/exporting-sessions(.sv).md`, `webshooter(.sv).md`; the manual does not describe the adjustment label, so nothing there changed |

### Tests changed (N2)

- **Removed:** `seed.test.ts` A-N10, which asserted that `is_inner_ten_decimal`
  stays 0. Its subject, the column, no longer exists.
- **Edited, assertion kept:** fixtures dropped the three removed fields;
  prefixed refs became unprefixed (`reconcile`, `round-trip`, the WebShooter
  session in a `shotlog.test.ts` fixture); `mapping.test.ts` asserts `isShootOff`
  where it asserted `note`; `maintenance-events.test.ts` A2 asserts the flag
  where it asserted `kind = 'adjustment'`.
- **Added:** C3, R1, R3, S5 ×4, A3 ×2.
- **Rebase:** the ShotLog conflicts (`dedup`, `plan`, `ref`) were resolved to
  `main`'s version, which already compares source and ref; this branch's own
  ShotLog test edits were dropped with them.

## Gauntlet (fresh run after the last code edit)

| Layer                     | Command                                                                                       | Result                                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root check                | `pnpm check` (typecheck ×3, schema, i18n, licenses, lint, format, vitest + coverage, jest)    | green: vitest 218 files, 3707 tests; jest 69 suites, 787 tests                                                                                                                                                                                                           |
| Coverage                  | in `pnpm check`                                                                               | 100% statements (5057/5057), branches (3389/3389), functions (1191/1191), lines (4266/4266)                                                                                                                                                                              |
| Mutation (Stryker)        | `pnpm mutation`                                                                               | 97.18% overall (10490 killed, 68 timeout, 306 survived; break 95). Touched modules: `from-rows`, `rows`, `protocol` 100%; `mapping` 95.54%, `reconcile` 96.75%, `json-export/types` 91.49%. Every survivor in a touched file is on a line older than this branch (below) |
| Mutation (zod schemas)    | `pnpm mutation:schema`                                                                        | **fails before running, pre-existing**: its mutant for `shared/src/disciplines/schema.ts:70` no longer matches that file. Neither file is touched by this branch, so `main` fails the same way. Recorded, not fixed here                                                 |
| Mutation (WebShooter zod) | `pnpm mutation:webshooter-schema`                                                             | 11/11 killed                                                                                                                                                                                                                                                             |
| Backend (Workers)         | `cd backend && pnpm test -- --testTimeout=60000`                                              | 27 files, 225 tests passed                                                                                                                                                                                                                                               |
| Docs                      | `mkdocs build --strict`; `node scripts/docs-translation-check.mjs`; `pnpm docs:anchors`       | locally before the rebase: built clean, 27 translated pages current, no dangling anchors; CI's _Build (strict)_ green on `950e8b2`                                                                                                                                       |
| Property-based            | `shared/src/json-export/round-trip.property.test.ts` (existing, fixtures gained `isShootOff`) | in `pnpm check`                                                                                                                                                                                                                                                          |
| reqstool                  | —                                                                                             | not affected: no `@SVCs`-tagged test or `docs/reqstool/` file changed                                                                                                                                                                                                    |
| Supply chain              | —                                                                                             | no dependency change                                                                                                                                                                                                                                                     |

### Survivors in touched files

All 15 sit on lines `git blame` gives to commits before this branch, in code
this PR did not change: the fält station checks in `mapping.ts` (161, 165,
187, 192, 205), `nameSimilarity` in `reconcile.ts` (64, 70, 73, 76), and two
`refine` guards in `json-export/types.ts` (210, 259). None is in a line this
PR added or changed.

## Real execution

Run before the rebase onto #783; the rebase changed no UI file, WebShooter
mapping or JSON export code.

- **Phone (web preview, `/dev` demo data, WebShooter dev mock).** Competition
  9001 now has one `results_distinguish` station. Imported through
  `/webshooter/import/9001`; the session shows Series 8 with the Shoot-off chip
  and a total of 374 (7 × 47 + 45, S3).
- **Web app** (`wrangler dev` serving `web/dist`, a synthetic account seeded
  through `/sync/push`): the session view shows the Shoot-off badge on the
  flagged series.
- **The maintainer's 2026-10-06 JSON export** imported into the new schema
  (4 sessions, 19 series) in a throwaway test that was deleted afterwards. The
  file never entered the working tree.

## Known limits

- **Server-held rows keep the old shape.** D1 stores each row's payload as
  pushed, so rows pushed before this change keep their prefixed refs and
  `note`, and a fresh pull would bring the prefix back. The maintainer
  confirmed (2026-10-13) that no device is signed in to sync with real data,
  so there is nothing on the server to rewrite.
- **A backup bundle from before this change is refused** at restore, by design
  (journal stamp bumped). The maintainer chose not to carry the phone's data
  across (2026-10-13): the originals are in ShotLog and other backups.
- **The chip reads "Shoot-off"**, the existing `station.shootOff` string shared
  with fält stations; the spec wrote "Shoot-Off". Changing it would change the
  fält screens too, so it was left.
- No `docs/implementation-plan.md` checkbox exists for #727; the plan's §6.3
  särskjutning sentence was amended instead.
