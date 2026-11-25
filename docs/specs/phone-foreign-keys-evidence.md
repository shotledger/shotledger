# EVIDENCE — the phone pins SQLite foreign keys off and checks it

Spec: [`phone-foreign-keys-spec.md`](./phone-foreign-keys-spec.md).

- **Spec approval: pending.** Asked of the maintainer before merge; this PR
  does not merge without it.
- **Source state**: commit `1f4d189` on `bugfix/phone-foreign-keys-pinned-off`
  (from `origin/main` at `3393b69`), plus doc pointers and this report.
- **Tier**: 3 (the sync engine's apply path).
- **Reproduce**: `pnpm check && node scripts/manual-mutation-foreign-keys.mjs`.
- **Tool versions**: vitest 5.0.5, typescript 6.0.2, node 22.23.5,
  expo-sqlite 57.0.3.

All numbers below come from runs after the last code edit.

## 1. Behaviors → tests

| #   | Test                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| FK1 | `app/src/db/foreign-keys.test.ts` "FK1 checkForeignKeysOff": `0` passes, `1` throws the §11.6 error, `null` passes, 6 odd rows throw |
| FK2 | same file, "FK2 pinForeignKeysOffSync": on → off on better-sqlite3; a pin whose set is ignored throws on the read-back               |
| FK3 | same file, "FK3 pinForeignKeysOffAsync": the same, async                                                                             |
| FK4 | `client.ts` calls `pinForeignKeysOffSync(expoDb)` before `drizzle(...)`. Native module load; not unit-testable here (§4 below)       |
| FK5 | `client.web.ts` calls `pinForeignKeysOffAsync` before storing the connection. Real execution, §3                                     |
| FK6 | `app/src/db/queries/sync-store.test.ts` "FK6 applies on a foreign-keys-on connection once the app pins them off"                     |

**RED observed**: with the three functions stubbed to throw
`not implemented`, all 14 new tests failed (13 in `foreign-keys.test.ts`,
FK6 in `sync-store.test.ts`).

## 2. Negative constraints

| #   | Evidence                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| N1  | `createTestDb` still defaults to `ON` (only its comment changed); "fails at commit on the default test DB" passes |
| N2  | `app/src/db/queries/sync-store.ts` unchanged (`git diff origin/main -- app/src/db/queries/sync-store.ts` empty)   |
| N3  | no file under `app/src/db/migrations/`, no `package.json`, no `pnpm-lock.yaml`, no i18n file changed              |
| N4  | `app/src/platform/backup-fs.ts` unchanged                                                                         |
| N5  | recorded in the spec; no code                                                                                     |

## 3. Gauntlet

| Layer                              | Command                                                                                        | Result                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Full suite + types + lint + format | `pnpm check`                                                                                   | green, exit 0. Vitest 258 files / 4666 tests; jest 114 suites / 1084 tests                 |
| Changed-line coverage              | the two test files with `--coverage`, `coverage-summary.json` for `app/src/db/foreign-keys.ts` | 100%: lines 10/10, statements 12/12, branches 6/6, functions 3/3                           |
| Mutation                           | `node scripts/manual-mutation-foreign-keys.mjs`                                                | **9/9 killed**, baseline pass first                                                        |
| Mutation runner control            | same script with `foreign-keys.ts` staged but not committed                                    | `FAIL: … is not committed and pristine`, exit 1: the runner refuses to mutate a dirty file |
| Suite health                       | the two test files with `--sequence.shuffle`, three runs                                       | 66/66 each run                                                                             |
| Property tests                     | not used                                                                                       | the input is one pragma row; FK1 lists the shapes                                          |
| Supply chain                       | n/a                                                                                            | no dependency change                                                                       |

Mutants (each a plausible bug): the sync pin only reads; the async pin only
reads; the pin sets `ON`; the sync pin skips the check; the async pin skips
the check; any defined value passes; only an explicit `1` fails; no row
counts as on; an unreadable answer passes.

### Real execution (web preview, wa-sqlite)

`expo start --web` behind `coi-proxy.mjs`, loaded in Playwright, with two
temporary `console.log`s around the pin in `client.web.ts` (not committed):

- `[FKREAD] before {"foreign_keys":0}` and `[FKREAD] after {"foreign_keys":0}`;
  the Home screen rendered. The web build's SQLite also defaults to off.
- With `SET_OFF` temporarily changed to `PRAGMA foreign_keys = ON`, the app
  stopped at the migration gate: "Database migration failed / SQLite foreign
  keys are on; sync needs them off (docs/specs/sync-family-refusal-spec.md
  §11.6)". So the web wiring runs, and a failing read stops the app before
  any screen or sync.

`expo start` writes `app/.expo/types/router.d.ts`; it was deleted afterwards.

## 4. Known limits and deviations

- **No Android or iOS dev-build read** (no Android SDK in the cloud session).
  FK4 is one line, checked by reading and `tsc`. Every launch now runs the
  same read the web preview did; if a native build ever read `1`, the app
  would stop at open with the error above rather than stall sync later.
- **Spec §5's mutant "remove the FK2 call from a test's wiring"** was dropped:
  it has no target, since `client.ts` cannot load under vitest. The forced-`ON`
  run in the web preview stands in for the wiring check.
