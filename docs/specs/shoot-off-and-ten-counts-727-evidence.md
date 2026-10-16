# Ten counts from the shots, no precision särskjutning (#727, PR C) — evidence

Spec: `docs/specs/shoot-off-and-ten-counts-727-spec.md`.

**Spec approval: awaiting the maintainer.** The PR does not merge before it.

The first version of this PR modelled a precision särskjutning as its own
section and result part. The maintainer rejected that on 2026-10-14 ("There is
no before final, final and shoot-off"; "let's not support särskjutning in
precision for now"), and this version replaces it.

## Failure model

| Risk                                                      | Caught by                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Dropping the stored ten counts loses a figure             | T2 tests read the counts from the shots; nothing has written the columns since #783                  |
| An older file or synced row with a dropped key is refused | `import.test.ts` (T3, S1); `sync-store.test.ts` "C3 applies rows … the columns #727 dropped"         |
| A precision särskjutning still lands in the total         | `mapping.test.ts` "skips results_distinguish"; `webshooter.test.ts` final kept, särskjutning dropped |
| Fält särskjutning stations break                          | fält tests unchanged and green (`falt*.test.ts`, the fält import in `webshooter.test.ts`)            |
| The baseline edit ships a stale schema                    | `migrations.test.ts` (baseline hash); `drizzle-kit generate` reports no changes                      |

## Spec → tests

| Id  | Tests                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `migrations.test.ts`; `sync-client/rows.test.ts` (R2, every series and session column); `from-rows.test.ts`; `shotlog.test.ts`                |
| T2  | `home-session-row.test.ts`, `session-list-row.test.ts`, `series-entry-model.test.ts` (`liveSessionTotals`), `web/src/sessions/browse.test.ts` |
| T3  | `import.test.ts` "ignores the tenCount and innerTenCount an older file carries (#727)"                                                        |
| S1  | `import.test.ts` "ignores the isShootOff an older file carries on a series"; `sync-store.test.ts` C3                                          |
| S2  | `mapping.test.ts` "skips results_distinguish: a precision särskjutning is not imported (#727)"; `webshooter.test.ts` final/särskjutning test  |
| S3  | session detail no longer reads a series flag (typecheck); covered by the screen tests that render a series list                               |
| S4  | unchanged fält suites                                                                                                                         |

## Gauntlet

All from runs after the last code edit.

| Layer        | Command                                                                                                                   | Result                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Full suite   | `pnpm check`                                                                                                              | exit 0 after merging main; vitest 248 files, 4430 tests; jest 111 suites, 1061 tests |
| Schema       | `cd app && npx drizzle-kit generate`                                                                                      | "No schema changes, nothing to migrate"                                              |
| Mutation     | `stryker run --mutate` `webshooter/mapping.ts`, `json-export/from-rows.ts`, `json-export/types.ts`, `sync-client/rows.ts` | 96.62% (314 killed, 11 survived); none of the survivors on a changed line            |
| Backend      | `cd backend && pnpm test -- --testTimeout=60000`                                                                          | 29 files, 263 tests passed                                                           |
| Docs         | `mkdocs build --strict`, `docs-translation-check`, `docs-anchor-check`                                                    | pass                                                                                 |
| Dependencies | none added or removed                                                                                                     | n/a                                                                                  |

### Mutation survivors

All 11 sit on lines this change did not touch: the fält station checks and
the station loop in `mapping.ts` (lines 158–202) and two zod refinements in
`types.ts`. They are pre-existing gaps, left for a separate change.

No real-app screenshot: the change removes a chip and an import path, and
adds no screen.
