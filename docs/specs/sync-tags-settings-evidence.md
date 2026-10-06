# Evidence report — sync `session_tags` and account settings (Tier 3)

- **Spec:** `docs/specs/sync-tags-settings-spec.md`. **Approval:** obtained
  2026-10-06 from the maintainer, relayed by the orchestrator session, with
  revision 1 (tag names). Revisions 2–4 were made during implementation and
  are listed in the spec; revision 2's final state is the plain baseline
  reset that was approved first.
- **Source state:** the commits after `0d7cd65` on
  `feat/sync-session-tags-settings`. The code was last changed in `edf96c8`;
  every number below comes from runs against that tree.
- **Toolchain:** pnpm 12.10.0 and the versions in `pnpm-lock.yaml`.
- **Entry points:** `pnpm check`; `cd backend && pnpm test`;
  `pnpm exec stryker run --mutate "shared/src/sync/protocol.ts,shared/src/sync-client/order.ts,shared/src/tags/canonical.ts"`;
  `node scripts/manual-mutation-sync-tags-settings.mjs`; the docs gates.
- **Independent verification:** not performed.

## Spec → test mapping

| Scenario                   | Test                                                                                                                         | Status |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| P1, P2, G2                 | `shared/src/sync/protocol.test.ts`                                                                                           | pass   |
| P3                         | `app/src/db/sync-apply-order.test.ts` (FK edges from schema.ts), `shared/src/sync-client/order.test.ts`                      | pass   |
| P4                         | replaced by N2 (revision 1)                                                                                                  | n-a    |
| B1–B4, B3b–B3d             | `backend/test/sync.spec.ts` › session_tags and settings                                                                      | pass   |
| A1, A2, N8                 | `app/src/db/migrations.test.ts`                                                                                              | pass   |
| A3, S1–S3                  | `app/src/db/queries/settings.test.ts`                                                                                        | pass   |
| A4, S4, S4b, E7/E8 local   | `app/src/db/queries/sync-store.test.ts`                                                                                      | pass   |
| T1–T5, N5–N7               | `app/src/db/queries/tags.test.ts`                                                                                            | pass   |
| T4 (stats reads)           | `app/src/db/queries/stats-sessions.test.ts`                                                                                  | pass   |
| N1–N4, N3b + property      | `shared/src/tags/canonical.test.ts`                                                                                          | pass   |
| E1–E8                      | `backend/test/sync-client.spec.ts` (real engine, real Worker, in-memory devices)                                             | pass   |
| E10–E12                    | `app/src/db/sync-tags-settings.test.ts` (real engine, real SQLite adapters, the server's merge rules in memory)              | pass   |
| W1–W4                      | `web/src/pull.test.ts`, `web/src/stats-inputs.test.ts`, `web/src/account/archive.test.ts`                                    | pass   |
| N1 (no protocol/D1 change) | `git diff 0d7cd65 -- backend/migrations` is empty; `PROTOCOL_VERSION` is 1                                                   | pass   |
| N2                         | A3 + B3 + B3c + S4 + E6 + E10                                                                                                | pass   |
| N3                         | A1 (unique indexes), S2                                                                                                      | pass   |
| N4                         | `app/src/db/no-hard-delete.test.ts`, negative control inside; proven against the real defence by a mutant (below)            | pass   |
| N5                         | no `package.json` changed; shared imports only zod                                                                           | pass   |
| N6                         | baseline before any change: vitest 156 files / 2803 tests, jest 59 / 690, backend 13 / 135, all passing. Tests edited: below | pass   |
| N7                         | no web push code; the web suite's existing tests unchanged in intent                                                         | pass   |

### Tests changed rather than added (spec changes, not weakening)

- `protocol.test.ts` G2 asserted `settings`/`session_tags` were **rejected**
  (the old §1 exclusion). It now asserts they are accepted.
- `sync-validation.spec.ts` V1e/V2f/V2k used `settings` as their example of an
  unknown table. They now use `shot_marks`, which is still unsynced, so each
  test keeps its intent.
- `sync-apply-order.test.ts`: `session_tags` left the list of local-only
  children.
- `text-limits.test.ts`: `tag_id` was added to the app-written id columns.

## Gauntlet (final runs)

| Layer                       | Command                                                                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite + types + lint   | `pnpm check`                                                                        | exit 0. Vitest: 159 files, 2861 tests passed. Jest: 59 suites, 690 tests passed. Includes typecheck (root, app, web), schema/i18n/licenses checks, eslint and prettier                                                                                                                                                                                                                                                                   |
| Coverage (gauntlet modules) | inside `pnpm check` (thresholds 100, failing build)                                 | statements 3208/3208, branches 1944/1944, functions 737/737, lines 2732/2732                                                                                                                                                                                                                                                                                                                                                             |
| Backend (Workers pool)      | `cd backend && pnpm test`                                                           | 13 files, 149 tests passed                                                                                                                                                                                                                                                                                                                                                                                                               |
| Mutation (Stryker)          | the stryker command above                                                           | 107 mutants, 105 killed, 2 survived (98.17%). Both are equivalent: `a < b` → `a <= b` in the name comparator, and `tag.id < current` → `<=`. Names passed to the comparator are distinct, and ids within one name are distinct, so equality never reaches either. A first run found two real survivors (`typeof payload === 'object'` and the deleted-tag skip in `canonicalIdOf`). Tests were added for both (`undefined` payload, N3b) |
| Mutation (manual)           | `node scripts/manual-mutation-sync-tags-settings.mjs`                               | 18/18 killed. Covers the app query layer, both settings triggers' allowlist, the `tags.name` unique index (the pull wedge), the web read side and the Worker route. Each mutant runs only the tests named for it. The runner fails closed on a match count ≠ 1, a run error, or a dirty file                                                                                                                                             |
| Property-based              | `canonical.test.ts` › every result is a live, canonical, distinct pair              | pass (fast-check defaults)                                                                                                                                                                                                                                                                                                                                                                                                               |
| Real execution              | `wrangler dev` on :8797, seeded through `/sync/push` by a script, web app signed in | 119 rows pushed, all `applied`. A `backupFolder` settings push was refused with `400 setting_not_synced`. The web Statistics page loaded the account over `session_tags` and `settings`: `~/tmp/screens-301/web-statistics-synced-account.jpg`                                                                                                                                                                                           |
| Docs gates                  | `mkdocs build --strict`, `docs-translation-check.mjs`, `pnpm docs:anchors`          | built; 23 translated pages current; no dangling anchors                                                                                                                                                                                                                                                                                                                                                                                  |
| Supply chain                | —                                                                                   | no dependency added or removed                                                                                                                                                                                                                                                                                                                                                                                                           |

## Known limits

- The backend end-to-end devices hold rows in memory and have no SQLite
  constraints. The tag-name wedge is therefore shown by E12 and the
  sync-store E7/E8 on real SQLite, where the server's merge rules are the
  shared `mergeChange` rather than the Worker's SQL.
- The N4 gate catches `.delete(<synced table>)` and `DELETE FROM <synced
table>` only.
- Add-wins: an untag on one device does not remove a link another device
  made concurrently without having seen it (E4). This is by design.
- Same-name tag copies stay on disk until a later merge edit (ADR 0019).
- The web tag-filter control and the web guldserie tile are not built.
