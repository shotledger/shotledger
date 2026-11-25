# EVIDENCE — the phone enforces SQLite foreign keys; sync holds orphans aside

Spec: [`phone-foreign-keys-spec.md`](./phone-foreign-keys-spec.md),
Revisions 2 to 2.2.

- **Spec approval:** Revision 2 was approved on the decision card ("Approve,
  implement it", 2026-11-25). After Revisions 2.1 and its amendments the
  maintainer wrote: "I have approved the specs, go ahead." Revision 2.2 (FK7
  keeps a newer pending entry) came later, from review, and is not yet
  approved.
- **Source state:** `bugfix/phone-foreign-keys-pinned-off`, code as of
  `1658796` (from `origin/main` at `3393b69`), plus docs and this report.
- **Tier:** 3 (the sync apply path, the local schema, the migration gate).
- **Reproduce:** `pnpm check && node scripts/manual-mutation-foreign-keys.mjs`.
- **Tool versions:** vitest 5.0.5, fast-check 4.10.2, typescript 6.0.2,
  node 22.23.5, expo-sqlite 57.0.3.

Revision 1 (foreign keys pinned off) is superseded. Its code was replaced in
`0ed9c40`.

## 1. Behaviors → tests

`FK` = `app/src/db/foreign-keys.test.ts`, `SP` =
`app/src/db/queries/sync-pending.test.ts`, `PROP` =
`app/src/db/queries/sync-pending.property.test.ts`.

| #           | Test                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| FK1         | FK "FK1 checkForeignKeysOn": `1` passes; `0`, null, undefined, `{}`, `'1'`, `true` and `1` throw the spec's error  |
| FK2         | `client.ts` / `client.web.ts` set `PRAGMA foreign_keys = OFF` at open. Native module load: real execution, §4      |
| FK3         | FK "FK3 enableForeignKeys" (on, and a pragma that is ignored throws); both gates call `useFinishOpening`, §4       |
| FK4         | No code: restore reloads the app, and the gate runs on the restored file                                           |
| AP1         | SP "AP1 a row whose parent is held…", "AP2 a null foreign key needs no parent"                                     |
| AP2         | SP "H7′ ROOT DISCARD AP2…", "AP2 the pending entry holds the whole change", "AP2 an update that moves a held row…" |
| AP3         | SP "STALE AP3 a tombstone drops the pending entry…"                                                                |
| AP4         | SP "NEWER AP4" ×2, "AP4 writing a row to its table drops a stale pending entry"                                    |
| AP5         | SP "LATE AP5", "CHAIN AP5", "AP5 promotion does not queue…", "AP5 an entry whose parent is still missing stays"    |
| AP6         | SP "LOCAL AP6…", "AP6 a held row without a queued edit takes its pending version"                                  |
| AP7         | Every SP scenario commits with foreign keys on; PROP checks `foreign_key_check` is empty after every pull          |
| FK7         | FK "FK7 the sweep at open": moves an orphan, moves its children, local-only tables stay, clean DB moves nothing    |
| FK7 (2.2)   | FK "keeps a newer pulled pending version over the older local row, and still moves the row"                        |
| FK7a KEEP   | FK "KEEP leaves an orphan with a queued edit in its table", "KEEP once the push is acknowledged, the next open…"   |
| FK7 + AP5   | FK "a swept orphan is promoted when its parent arrives, deleted_at intact"                                         |
| Bookkeeping | SP "sign-out and a backup reset empty it"                                                                          |
| §7 property | PROP: 100 runs, a 10-row family in any order across 4 pulls, then every row in its table and nothing pending       |

**RED observed** (before any implementation):

- SP: 14 of 16 failed. 13 failed with `SqliteError: FOREIGN KEY constraint
failed` and one failed on an assertion. The two that passed (AP1 with its
  parent held, and a null foreign key) were behaviour that already existed. A
  throwaway mutant (`lacksParent` always true for `series`) turned both AP1
  tests red, so neither is vacuous.
- FK: all 17 failed against stubs that threw `not implemented`.
- FK7 (2.2): the new test failed (`expected +0 to be 9`: the sweep had
  overwritten the newer entry), then passed after the fix.
- PROP was written after the code. With `promotePending` commented out it
  failed with a counterexample, so it is not vacuous.

## 2. Negative constraints

| #   | Evidence                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | No file under `backend/`, `web/` or `shared/src/sync/protocol.ts` changed                                                                                                                                                   |
| N2  | `createTestDb()` defaults to foreign keys on. The `{ foreignKeys: false }` option stays (deviation): it now models the database before the gate, for the gate's own tests                                                   |
| N3  | Existing tests unchanged except: the three §11.6 orphan tests moved to SP, and two atomicity tests used an orphan as their failing write. They now use a NOT NULL violation, with the same assertions (deviation, recorded) |
| N4  | Push, outbox triggers and refusal marks unchanged; the full suite passes                                                                                                                                                    |
| N5  | No dependency change (`pnpm-lock.yaml` untouched; `licenses:check` green); no i18n key                                                                                                                                      |

## 3. Gauntlet

| Layer                              | Command                                         | Result                                                                     |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Full suite + types + lint + format | `pnpm check`                                    | green, exit 0. Vitest 260 files / 4684 tests; jest 114 suites / 1084 tests |
| Migration chain                    | `migrations.test.ts` (in `pnpm check`)          | `0001_sync_pending_rows` hash recorded; the chain matches `schema.ts`      |
| Mutation                           | `node scripts/manual-mutation-foreign-keys.mjs` | **18/18 killed**, baseline pass first                                      |
| Mutation runner control            | the same script with the sources uncommitted    | refuses to run (`not committed and pristine`), exit 1                      |
| Property                           | PROP, 100 runs                                  | pass; fails with a counterexample when promotion is disabled               |
| Supply chain                       | n/a                                             | no dependency change                                                       |

Two mutants from the first run were not kills, and both changed the code.
"Promotion runs one pass only" survived because a pass in `APPLY_ORDER`
already promotes every chain, so the loop was dead code and was removed
(`4d26c5a`; the spec's AP5 says so). "Promotion leaves the promoted entry
behind" then looped forever, and the runner stopped on it. Without the loop it
is a plain kill.

## 4. Real execution (web preview, wa-sqlite)

`expo start --web` behind `coi-proxy.mjs`, driven by Playwright, with a
temporary `console.log` in `useFinishOpening` (not committed):

- At open: `[FKREAD] after gate {"foreign_keys":1} moved 0`. The gate ran and
  foreign keys are enforced.
- `/dev` **Wipe Data** (hard deletes, children first): "Data wiped."
- `/dev` **Load Demo Data**: "Demo data loaded: 37 sessions." Every insert of
  the demo seed ran with enforcement on.
- Home then listed the demo sessions with their scores.

An earlier attempt tapped Wipe while the load was still running and got
"Sync operation timeout" from the web worker's channel. Run one action at a
time and it does not happen. It is not a foreign-key failure.

`expo start` writes `app/.expo/types/router.d.ts`; it was deleted afterwards.

## 5. Known limits

- **No native read.** There is no Android or iOS dev build: the cloud session
  has no SDK. FK2 and FK3 are the same code on native, and every launch reads
  the setting back, so a native build that failed to enforce would stop at
  the gate.
- **No end-to-end sync run against `wrangler dev`** for this change. The apply
  path is covered by SP and PROP on the real schema with enforcement on;
  push, the protocol and the server are unchanged.
- **A pending row whose parent never arrives** (ROOT, DISCARD) stays in
  `sync_pending_rows` until sign-out or restore. It is invisible either way.
