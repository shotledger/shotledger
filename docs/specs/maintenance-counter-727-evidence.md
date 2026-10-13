# Derived rounds since maintenance (#727, PR B) — evidence report

Spec: [`maintenance-counter-727-spec.md`](./maintenance-counter-727-spec.md),
**approved by the maintainer on 2026-10-13**. This report records what the
implementation on the same branch was checked against.

**Tier 3.** Source state: branch `feature/issue-727-derived-maintenance-counter`,
rebased onto `main` after #807. Node 24.21.0, pnpm 12, as pinned. No
dependency added, so no license regeneration and no audit.

## Failure model

| Way this change can hurt                                                       | Layer that catches it                                                                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| The figure counts from the wrong event (an adjustment, a deleted or older one) | M2 unit tests on `latestMaintenanceEvent` / `roundsSinceMaintenance`; mutation 29/30 killed (one equivalent, below)     |
| Logging maintenance still writes the firearm, or no longer resets the figure   | `maintenance-events.test.ts` M3 (row unchanged) and the logging test (figure 0)                                         |
| A phone or web counter move still writes the dropped column                    | `rows.test.ts` R4/K11 (`toEqual` on the whole payload); web-parity tests on the phone schema; backend end-to-end specs  |
| The notification fires on a different crossing than before                     | `maintenance-due.test.ts`, with a logged event in the fixture; M5 tests for log and delete                              |
| The figure is lost across export → wipe → import                               | `import-round-counters.test.ts` RC-13; property test P21 on `maintenanceEvents`; `archive.test.ts` for the web download |
| A bad maintenance entry fails the whole file                                   | `import.test.ts` M6 (skipped on its own, terse entry defaulted, invalid ones refused); P22 mutated-file property        |
| A build ships the old baseline                                                 | `migrations.test.ts` checks the `baseline sha256` line; `drizzle-kit generate` reports no schema changes                |

## Behavior → test mapping

| Spec | Behavior                                                   | Verified by                                                                                                                                                               |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | Column dropped; `round_count_at` NOT NULL                  | `app/src/db/migrations.test.ts` (baseline hash), `drizzle-kit generate` (no changes), `web-rows.test.ts` A1                                                               |
| M2   | Derived figure, reference event by date then id            | `shared/src/firearms/maintenance-counter.test.ts` (10 tests); `maintenance-events.test.ts` "an earlier date does not reset"                                               |
| M3   | Log writes only the event; deleting the newest restores    | `maintenance-events.test.ts` M3 ×2                                                                                                                                        |
| M4   | Only `round_count` moves, phone and web                    | `round-count.test.ts`, `maintenance-events.test.ts` M4, `shared/src/sync-client/rows.test.ts` R4/K11, the web-parity tests                                                |
| M5   | Crossing on counter moves only                             | `app/src/db/queries/maintenance-due.test.ts` (existing cases plus M5 ×2)                                                                                                  |
| M6   | `maintenanceEvents` exported, imported, survives a restore | `export.test.ts`, `from-rows.test.ts`, `import.test.ts` M6 ×3, `round-trip.property.test.ts`, `import-round-counters.test.ts` RC-13–15, `web/src/account/archive.test.ts` |

### Tests changed

- **Assertion kept, measured through the derived figure:** every test that read
  `firearm.roundsSinceMaintenance` now reads `getRoundsSinceMaintenance(db,
firearm)` and expects the same number.
- **Fixtures:** a firearm created with a starting count and an implied
  "since 0" now logs a cleaning at that count (web-parity tests,
  `maintenance-due.test.ts`, `import-round-counters.test.ts`), which is what
  the old default stood for. The dropped key is gone from web and backend
  fixtures; the web test helpers lost their `since` argument.
- **Changed expectation:** RC-12 (a file's firearm matched by name to another
  local id) now expects 0 instead of 7: the file's cleaning attaches to the
  matched gun at the file's count (spec §3, known limit).
- **Removed:** nothing.

## Gauntlet

| Layer                  | Command                                                                                 | Result                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root check             | `pnpm check`                                                                            | green: vitest 3733 tests; jest 70 suites, 789 tests                                                                                                            |
| Coverage               | in `pnpm check`                                                                         | 100% statements (5069/5069), branches (3403/3403), functions (1195/1195), lines (4276/4276)                                                                    |
| Mutation (Stryker)     | `pnpm mutation`                                                                         | 97.18% overall (10522 killed, 68 timeout, 307 survived; break 95). `maintenance-counter` 96.67% (1 equivalent), `from-rows`, `export`, `sync-client/rows` 100% |
| Mutation (zod schemas) | `pnpm mutation:schema`                                                                  | fails before running, as on `main`: its mutant for `shared/src/disciplines/schema.ts:70` no longer matches. No json-export mutant is in its list               |
| Backend (Workers)      | `cd backend && pnpm test -- --testTimeout=60000`                                        | 27 files, 226 tests passed                                                                                                                                     |
| Docs                   | `mkdocs build --strict`; `node scripts/docs-translation-check.mjs`; `pnpm docs:anchors` | built clean; 27 translated pages current; no dangling anchors                                                                                                  |
| Property-based         | `round-trip.property.test.ts`                                                           | P21 for maintenance events, P22 mutated files include them; in `pnpm check`                                                                                    |
| reqstool               | —                                                                                       | not affected: no `@SVCs`-tagged test or `docs/reqstool/` file changed                                                                                          |

### Survivors in touched files

- `maintenance-counter.ts:29`, `event.id > latest.id` → `>=`: **equivalent**.
  The two differ only for two entries with the same id, which the primary key
  rules out.
- `import.ts` (57, 64, 80, 115) and `json-export/types.ts` (4): on lines this
  branch did not change (`git blame`), the same survivors as on `main`.

## Real execution

Web preview (`expo start --web` behind the COOP/COEP proxy), `/dev` demo data,
firearm "CZ Tactical Sport 2 Orange" (interval 1500, one cleaning logged before
its sessions):

| Step                                | Rounds Fired | Rounds Since Maintenance |
| ----------------------------------- | ------------ | ------------------------ |
| Demo data loaded                    | 524          | 524                      |
| Adjust Round Count +10              | 534          | 534                      |
| Log Maintenance "Rengöring" (today) | 534          | 0                        |
| Adjust Round Count +6               | 540          | 6                        |

The firearms list shows the status chips (OK) from the derived figure. No
screen deletes a maintenance entry; M3's restore is covered by the query tests.

## Known limits

As spec §3: rounds removed from before the last cleaning lower the figure (as
today); an export written before this change has no maintenance log; a
name-matched firearm takes the file's entries at the file's counts.
