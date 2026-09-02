# M3 scoring — evidence report

> Old-coder EVIDENCE artifact for milestone M3.
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/m3-scoring-evidence.md`
> Spec: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/m3-scoring-spec.md`

## 0. What this report does and does not buy you

- **Spec approval: not obtained (autonomous run).** The maintainer did not
  review the spec before the code was written, so the one correlation-breaking
  step in the old-coder loop did not happen: the spec and the implementation
  were authored by the same agent, in the same session. Everything below shows
  that the code satisfies **that** spec — it cannot show the spec asks for the
  right things. Two spec decisions in particular are the maintainer's to make
  and are called out as open VERIFY items in §6.
- **Tier: 3.** Scoring math feeding a logbook that later drives märke,
  standardmedalj and föreningsintyg decisions.
- **Scope of the loop:** `shared/src/` only. The app UI (`app/src/`) got
  ordinary tests plus the Maestro flow, per CLAUDE.md.
- **Reproduce everything:** `pnpm gauntlet` from the repo root (defined in
  `package.json`).

## 1. Source state and environment

| Item        | Value                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Branch      | `feat/m3-score-entry`, based on `feat/m2-shell` (`0fa2009`)                                                             |
| Isolation   | branch, not a worktree — a fresh worktree has no `node_modules` and the gauntlet could not run there                    |
| Node / pnpm | v24.12.0 / 11.24.0                                                                                                      |
| vitest      | 3.2.7                                                                                                                   |
| TypeScript  | ~6.0.3 (`tsc -b`)                                                                                                       |
| Stryker     | @stryker-mutator/core 10.0.0 + @stryker-mutator/vitest-runner 10.0.0                                                    |
| Coverage    | @vitest/coverage-v8 ^3.2.4 (pinned to vitest 3.x — the 4.x default is ABI-incompatible with vitest 3 and fails at load) |
| Properties  | fast-check 4.9.0                                                                                                        |

Environment changes actually made (all authorized by the spec's setup plan):
`zod` added to `shared/` (runtime), `expo-image-picker` added to `app/`
(runtime), `@vitest/coverage-v8`, `fast-check`, `@stryker-mutator/core`,
`@stryker-mutator/vitest-runner` added at the workspace root (dev).
New files added by the gauntlet: `stryker.config.json`,
`scripts/mutate-schema.mjs`, coverage config in `vitest.config.ts`,
`.gitignore` entries for `.stryker-tmp/`, `coverage/`, `reports/`, and
eslint ignores for the same.

## 2. Baseline

Before any M3 code, on `feat/m2-shell`: `pnpm check` green —
**62 vitest tests / 12 files passed, 1 jest test passed, 0 failures**.
There were no pre-existing failures to hold a line against in `pnpm check`.

One pre-existing condition worth recording, because it limits what the type
layer proves: **`pnpm typecheck` (`tsc -b`) does not include the `app/`
project** — the root `tsconfig.json` references only `shared` and `backend`.
Running `tsc --noEmit -p app/tsconfig.json` by hand reports three
**pre-existing** errors (`src/db/migration-gate.tsx`,
`src/db/queries/sessions.ts`, `src/theme/tokens.test.ts`, all from M1/M0).
M3 adds **zero** new type errors there — verified by running that command
before and after, and diffing the file list. Fixing the three pre-existing
ones is out of scope (that is someone's M1 bug, not this milestone's), but
the maintainer should know the app is currently not type-gated by CI.

## 3. Spec-to-test mapping

Every scenario id in the spec appears verbatim in a test name, so
`pnpm exec vitest run shared -t "<id>"` finds it.

| Spec        | Test file                              | Coverage                                                                                                   |
| ----------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| §3.3 I1–I7  | `shared/src/scoring/entry.test.ts`     | integer mode: digits, miss, X, `(X)` ignored, full series, key list                                        |
| §3.4 D1–D11 | same                                   | decimal two-tap entry, X/(X) rings, pending-ring rules                                                     |
| §3.6 E1–E8  | same                                   | select, overwrite, cursor return, backspace in 4 positions                                                 |
| §3.7 C1–C6  | same                                   | construction guards, seeding, immutability                                                                 |
| §3.8 P1–P5  | same (`describe('properties')`)        | fast-check over arbitrary key sequences in both modes                                                      |
| §4 M1–M13   | `shared/src/scoring/marke.test.ts`     | full SHB threshold table, age reductions, group mapping, applicability, bad birth years                    |
| §5 T1–T9    | `shared/src/scoring/totals.test.ts`    | existing behaviour kept, X counts, beforeFinal/final/total, sighter exclusion, volume                      |
| §6 G1–G18   | `shared/src/disciplines/index.test.ts` | zod validation + negative control, discipline/program set, skeleton, groups/classes, naming, decimal rules |

Negative constraints:

| Id  | How it is held                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | T6, T7, T7b, and the property "adding a sighter series never changes any score, only volume"                                                                                                                                             |
| N2  | pre-existing `SighterLimitExceededError` test in `app/src/db/queries/series.test.ts` (untouched) + the UI disables the toggle (`sighter-toggle` `disabled` when the section has one); **the UI half is not unit-tested** — see §6 limits |
| N3  | C5, the boundary test (0 and 109 accepted, 110 and −1 rejected), property P1                                                                                                                                                             |
| N4  | G13/G14 (`formatGroupAndClass`), and the schema keeps `weaponGroup`/`shooterClass` separate columns                                                                                                                                      |
| N5  | `levelShortLabel` in `app/src/features/session/labels.ts` derives KM/SM from level + flag; the form stores the flag separately. **Not unit-tested** — see §6 limits                                                                      |
| N6  | property T8, over arbitrary series lists                                                                                                                                                                                                 |
| N7  | full suite green, and `sumValueTenths`/`tenthsToScore` tests untouched from M2                                                                                                                                                           |
| N8  | every new string added to `sv.json`/`en.json`; no literal user-facing strings in the new screens                                                                                                                                         |
| N9  | `shared/` imports only `zod`; verified by the file contents and by the fact vitest runs it in plain Node                                                                                                                                 |

## 4. Gauntlet

All numbers below come from one fresh run after the last code edit, on
`feat/m3-score-entry`. Reproduce with `pnpm gauntlet` (§7).

| Layer              | Command                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full test suite    | `pnpm check`                                              | **PASS** — 15 test files, **187 vitest tests passed, 0 failed**; jest: 1 suite, 1 test passed. Baseline was 62 vitest tests, so M3 adds 125.                                                                                                                                                                                                                                           |
| Static types       | `pnpm typecheck` (`tsc -b`)                               | **PASS** — exit 0, no output. (Scope caveat in §2: this does not cover `app/`.)                                                                                                                                                                                                                                                                                                        |
| Lint               | `pnpm lint` (`eslint .`)                                  | **PASS** — exit 0, no output                                                                                                                                                                                                                                                                                                                                                           |
| Format             | `pnpm format` (`prettier --check .`)                      | **11 pre-existing files fail**, none of them M3 code: the vendored `.claude/skills/old-coder/*`, `plan.md`, `renovate.json5`, `app/expo-env.d.ts`, `docs/reference/spsf-shb-2026.md`, `docs/implementation-plan.md`. Every file M3 wrote under `shared/`, `app/src/`, `scripts/` is prettier-clean. `format` is deliberately not part of `pnpm check` (§1 of the implementation plan). |
| Coverage (gate)    | `pnpm coverage`                                           | **PASS** — statements **100% (384/384)**, branches **100% (166/166)**, functions **100% (41/41)**, lines **100% (384/384)** over `shared/src/scoring/**` + `shared/src/disciplines/**`. The threshold is enforced: the run **exits nonzero** when it is missed (proved — see §5).                                                                                                      |
| Mutation (tool)    | `pnpm mutation` (Stryker)                                 | **PASS** — score **98.26%**: 393 killed, 2 timeout, **7 survived**, 0 no-coverage, 0 errors. Break threshold 95. All 7 survivors classified equivalent below.                                                                                                                                                                                                                          |
| Mutation (schemas) | `pnpm mutation:schema`                                    | **PASS** — **17/17 mutants killed**, exit 0                                                                                                                                                                                                                                                                                                                                            |
| Property-based     | inside the vitest run                                     | 7 fast-check properties (P1–P5 on the keypad, 2 on the result model), 100 cases each by default                                                                                                                                                                                                                                                                                        |
| Real execution     | `expo run:android` + `maestro test app/e2e/m3-entry.yaml` | **PASS** — dev build on the `shotledger` AVD; the flow creates a C-precision session, taps five series of five 9s, and asserts `session-total` reads **225**. Screenshots in §5.                                                                                                                                                                                                       |
| Supply chain       | `pnpm audit --prod`                                       | 2 moderate advisories (`uuid <11.1.1`, `decode-uri-component <=0.4.2`), both **transitive Expo dependencies present on the base branch too** — verified by running the same command on `feat/m2-shell`: identical 2 moderate. M3's own new dependencies (`zod`, `expo-image-picker`) add none.                                                                                         |
| Suite health       | `pnpm exec vitest run --sequence.shuffle`                 | **PASS** — 187/187 in randomized order; no order dependence                                                                                                                                                                                                                                                                                                                            |
| Complexity         | reviewed by hand                                          | The largest new function is `loadSessionDetail` (one query pass + one map). `entry.ts` is a set of ≤15-line functions with one branch each. No function needs a paragraph to explain.                                                                                                                                                                                                  |

### Surviving mutants, classified

Stryker cannot kill these because they do not change behaviour. None is
covered by adding a test that asserts nothing (anti-gaming rule 4).

| Location                 | Mutant                                          | Why it is equivalent                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classes.ts:29`          | `/^(Dam\|Vet)(.+)$/` → `/^(Dam\|Vet)(.+)/`      | `.+` is greedy, so dropping the end anchor matches exactly the same strings                                                                                                           |
| `groups.ts:41`           | `if (!id) return null` → `if (false)`           | falls through to `find(g => g.id === id)`, which returns `undefined` for a null/empty id, and `?? null` yields the same `null`                                                        |
| `index.ts:88`            | error-context string → `` ` ` ``                | only reachable when a shipped data file names a group that does not exist — impossible with the shipped data; the message itself is asserted at the `resolveWeaponGroupIds` call site |
| `index.ts:108`           | `groups[0]?.` → `groups[0].`                    | the schema enforces `groups.min(1)`, so element 0 always exists                                                                                                                       |
| `entry.ts:137`           | `key === '(X)' && enabled` → `true && enabled`  | digits and `X` have already returned above, and `backspace` is handled in `pressKey`, so `(X)` is the only key that reaches this line                                                 |
| `entry.ts:162`           | `if (cursor === 0) return state` → `if (false)` | falls through to `withShot(state, -1, null)`, which matches no index and produces a structurally identical state                                                                      |
| `index.ts` (×2 timeouts) | —                                               | counted as killed by Stryker (a mutant that hangs the suite is a detected mutant)                                                                                                     |

`schema.ts` shows `n/a` in the Stryker table on purpose: its mutants live in
code that only runs at **module load**, which the vitest runner cannot
re-activate once the module is cached (`ignoreStatic: true`). That gap is
closed by `scripts/mutate-schema.mjs`, which mutates the file **on disk** so
each mutant is genuinely in effect — 17/17 killed.

### Checker controls (proving the gates can fail)

Home-grown gates get a negative control, per the old-coder checker rule.

| Gate                        | Control                                                                    | Observed                                                                                                |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Coverage threshold          | Ran with three branches uncovered in `index.ts`                            | `ERROR: Coverage for branches (98.17%) does not meet global threshold (100%)`, nonzero exit             |
| Schema negative control G3  | Relaxed `disciplineSchema` from `strictObject` to `object` on disk         | G3 failed; restored, green again                                                                        |
| `scripts/mutate-schema.mjs` | Pointed one mutant at the wrong line so its search text would not be found | Hard error, **exit 1**: "Mutant … did not apply … an unapplied mutant must never be reported as killed" |
| `scripts/mutate-schema.mjs` | Real survivors found and fixed twice (see §5)                              | Proves the runner reports survivors rather than always printing "killed"                                |
| New coverage-closing tests  | Throwaway mutants (`?? null` → `?? 0`; deleted the unknown-group `throw`)  | Both tests went red; mutants reverted                                                                   |

What the controls do **not** prove: that each gate recognises every violation
of the rule it stands for. A negative control shows one known-bad input
reaches the failure path, nothing more.

## 5. What failed on the way, and how

1. **RED was observed for every module.** `entry.ts`: 38/38 failing against a
   throwing stub, then 38/38 green. `marke.ts` + `totals.ts`: 41 failing / 4
   passing (the 4 being the untouched M2 totals tests), then all green.
   `disciplines`: an early run failed at _collection_ (a stub call in a
   `describe` body) — a weaker RED, so the test was restructured to call
   lazily and re-run, giving 23 failing / 1 passing.
2. **A vacuous test caught during RED.** `expect(() => weaponGroupsForDiscipline('nope')).toThrow()`
   passed against the throwing stub — it asserted "something throws", which the
   stub satisfied. Tightened to `.toThrow(/unknown discipline/i)` before
   implementing.
3. **One test passed immediately (G3, the schema negative control)**, because
   the zod schemas were written before the stubs. Proved non-vacuous with a
   throwaway mutant (`strictObject` → `object`): G3 went red, then restored.
4. **`@vitest/coverage-v8` resolved to 4.x against vitest 3.x** and crashed with
   `does not provide an export named 'BaseCoverageProvider'`. Pinned to `^3.2.4`.
5. **Stryker could not find its own plugin** under pnpm's strict `node_modules`
   until `"plugins": ["@stryker-mutator/vitest-runner"]` was added to the config.
6. **First full mutation run scored 87.42%** with 61 survivors. Rather than
   lower the threshold, the survivors were read one by one and the tests were
   strengthened where a survivor represented a real gap — the notable ones:
   backspace on a **full** series was untested (an off-by-one in the
   `cursor < seriesLength` guard survived); `(X)` in **integer** mode with the
   flag on was untested; the boundary birth years 1900 and "born this year"
   were untested; magnum group ids M2–M8 were untested. That is 4 real holes
   the unit tests would not have caught. Score after: 94.23%, then 98.26%.
7. **A hand-rolled mutation attempt silently reported a false survivor.** The
   first pass at the schema mutants used a plain string replace with no check
   that it matched; one mutant never applied and was reported as "SURVIVED".
   That is exactly the fail-open failure the old-coder checker rule warns about.
   The persisted runner now **throws** when a mutant's search text is not found,
   and that behaviour has its own negative control (above).
8. **Two genuine survivors in the schema runner** (`programSchema` and its
   `structure` accepting unknown keys) were real test gaps, closed by adding
   those cases to G3b — not by deleting the mutants.
9. **The first Maestro run failed for a self-inflicted reason.** While the flow
   was running I ran `git stash` / `git checkout feat/m2-shell` to compare the
   audit baseline. Metro hot-reloaded the app mid-flow, the dev client returned
   to Home, and the keypad vanished under Maestro's feet. Not a product bug —
   but worth writing down: **do not touch the working tree while a Maestro flow
   is running against a Metro dev build.**
10. **The second run failed on the flow's own trailing wait.** After the fifth
    series, `extendedWaitUntil: visible: 'Add series'` failed because the button
    had been pushed below the fold — `extendedWaitUntil` does not scroll. The
    app was correct at that moment (screenshot showed Total 225, five series of
    45). The flow now waits for the `session-total` element, which sits at the
    top of the screen. Third run: **passed**, `Assert that "225", id:
session-total is visible... COMPLETED`, exit 0.

### Screenshots (from the passing run)

Scratchpad directory
`/tmp/claude-1000/-home-jimisola-cloud-dev-clones-jimisola-github-mobile-app/59be8895-7aeb-4fcf-b10a-f402a9c9e010/scratchpad/m3/`:

- `m3-01-home.png` — Home before the session exists
- `m3-02-new-session.png` — the new-session form with Precision / C / klass 2 selected
- `m3-03-session-empty.png` — the session detail with no series yet
- `m3-04-session-five-series.png` — five series of 45, **Total 225**, "Gold at 46 pts"
- `m3-run1-detail-225.png` — the same state from the run that failed on its trailing wait, kept as the evidence that the failure was in the flow, not the app
- `maestro.log` — the passing run's output

## 6. Known limits and open questions

**Open VERIFY items — the maintainer's call, not mine:**

- **V1 — what `(X)` actually means.** The implementation plan itself marks
  `is_inner_ten_decimal` as VERIFY. It is implemented behind
  `innerTenDecimalEnabled`, **default `false`**, and **no UI path enables it**,
  so M3 writes no data with that flag. The state machine's behaviour for it is
  specified and tested (D6, D7, D8, D11) so that turning it on later is a
  one-line change, not a redesign.
- **V2 — which key types "10" in decimal mode.** §4 M3 writes the example as
  `"10" then "9"` while listing the keys as `1–9, 0, X, (X)`. There is no spare
  `10` key, and `0` is needed for ring 0 (a decimal miss). This build assigns
  ring 10 to `X` (and `(X)`), which satisfies the plan's other two decimal
  statements exactly. If the maintainer intends `0` to mean "10", the change is
  one branch in `pressDecimal` plus its tests.
- **V3 — märke row for the A sub-groups.** `AM`, `AP`, `AG` and `A-opt` are
  mapped to the **A** row. SHB prints "A/A-opt" together for standardmedalj
  (C.5.1.2.3) and the sub-groups are defined as variants of A (F.4.1, F.4.5),
  but Bilaga 1 mom 5.1.1.1 lists only A/B/C, so this is an inference.
- **V4 — championship short labels beyond KM and SM.** SHB documents that
  mästerskap is a flag on a level, and names KM (förening) and SM (riks). The
  i18n file invents `KretsM`, `LandsdelsM`, `NM` for the other three levels
  because the default session name needs _something_. Only KM and SM are
  sourced.

**Limits of this report:**

- The spec was never approved before implementation. Everything here shows
  conformance to a spec I wrote myself.
- **`app/` is not type-checked by `pnpm check`** (§2). The M3 screens were
  type-checked manually with `tsc --noEmit -p app/tsconfig.json` and add zero
  new errors, but nothing enforces that on the next change.
- **Two invariants are only held by UI code, untested:** N2's UI half (the
  sighter toggle disabling once a section has one — the _database_ half is
  tested and untouched) and N5 (the KM/SM label derivation). Both are one
  screen away from a jest-expo or extra Maestro assertion; neither got one.
- The keypad component itself (`app/src/components/score-keypad.tsx`) has **no
  component test** — it is a thin render of the tested state machine, and the
  Maestro flow exercises it end to end, but a rendering regression that does not
  break that specific flow would not be caught.
- `expo-image-picker`'s photo attach was **not exercised on the emulator** (it
  needs a permission dialog and a library with images). It is wired and
  type-checked only. The camera path named in §4 M3 is not implemented; the
  library path is.
- Coverage and mutation cover `shared/` only. `app/src/features/session/*` is
  not covered by either.
- Stryker's `ignoreStatic` hides module-load mutants globally, not just in
  `schema.ts`. Today only the schemas run at module load, so the on-disk runner
  covers the whole gap — but if more module-level logic appears in `shared/`,
  the runner's mutant list has to grow with it.

## 7. Reproducing this report

```bash
pnpm i                     # first run on a new machine: pnpm approve-builds esbuild workerd
pnpm gauntlet              # typecheck + lint + format + coverage + jest + both mutation layers
```

`pnpm gauntlet` is defined in `package.json` as:

```
pnpm typecheck && pnpm lint && pnpm format && pnpm coverage &&
(cd app && pnpm exec jest --passWithNoTests) && pnpm mutation && pnpm mutation:schema
```

Note that `pnpm format` currently fails on the 11 pre-existing files listed in
§4, so `pnpm gauntlet` stops there on a clean checkout; run the layers
individually, or fix those files in a separate branch, until that is cleaned up.
`pnpm check` (the project's own gate, without format/coverage/mutation) is green.

The emulator layer is manual, per CLAUDE.md's agentic loop:

```bash
emulator -avd shotledger -no-window -no-audio -gpu swiftshader_indirect &
adb wait-for-device shell getprop sys.boot_completed          # → 1
cd app && pnpm exec expo run:android                          # leave Metro running
maestro test app/e2e/m3-entry.yaml                            # ~9 min on this AVD
```

Source state: branch `feat/m3-score-entry`, based on `feat/m2-shell`
(`0fa2009`). The exact commit this report describes is the branch tip at the
time of writing; `git log --oneline feat/m2-shell..feat/m3-score-entry` lists
the four commits.

---

# Evidence — Amendments A1 and A2 (branch `feat/score-x-semantics`)

> Covers spec `docs/specs/m3-scoring-spec.md` **Amendment A1** (X/(X)
> semantics, session-header stats, unscored extra rounds) and **Amendment A2**
> (final keypad layout `1–9`, `0`, `10`, `X`, which supersedes A1 §A1.1).
> Absolute path of this report:
> `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/m3-scoring-evidence.md`

## A.0 What this buys you, and what it does not

- **Spec approval: maintainer-directed-by-message for the semantics; the
  amendment documents themselves were NOT reviewed before the code
  (autonomous run).** The rulings — X/(X), then `10`/`X`; the extra-rounds
  semantics; the header stats; the accent; the tab and name wording — came
  from the maintainer in the task message, so the _decisions_ are theirs. The
  scenario tables, invariants and spec-to-test mapping below were written by
  the same agent that wrote the code, so the correlation-breaking review still
  did not happen for those. Claim confidence accordingly.
- **The ruling changed mid-task, twice.** A1 was implemented, committed and
  green before A2 arrived. A1 is kept in the spec (append-only) and A2 names
  exactly what it supersedes. No file still implements A1's key labels.
- **Tier 3**, unchanged: this changes the meaning of recorded scoring data.
- **Independent verification: not performed.** Declared downgrade, as for M3.

## A.1 Source state and environment

| Item      | Value                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| Branch    | `feat/score-x-semantics`, based on `feat/theme-purple-rain` (`ea70ae0`)      |
| Isolation | branch, not a worktree (the gauntlet needs the repo's `node_modules`)        |
| New deps  | **none** — runtime or dev (invariant A-N14)                                  |
| Migration | `app/src/db/migrations/0001_fixed_multiple_man.sql` (drizzle-kit generated)  |
| Tooling   | unchanged from the M3 report: vitest 3.2.7, Stryker 10.0.0, fast-check 4.9.0 |

Files added: `app/src/db/queries/extra-rounds.test.ts`,
`app/src/db/migrations.test.ts`, the `0001` migration + its `meta/` snapshot.

## A.2 Baseline

`pnpm check` on `feat/theme-purple-rain` before any change: **273 vitest tests
/ 24 files passed, 1 jest test passed, 0 failures.** No pre-existing failures.

The three pre-existing `tsc --noEmit -p app/tsconfig.json` errors recorded in
§2 are still there and still in the same three files
(`db/migration-gate.tsx`, `db/queries/sessions.ts`, `theme/tokens.test.ts`);
this branch adds **no new file** to that list. The `tokens.test.ts` entry grew
from 1 to 7 lines because the file gained a test — same pre-existing cause
(the app tsconfig has no jest types), not a new defect.

## A.3 Tests whose EXPECTATION changed with the semantics

The maintainer changed what correct means, so some existing tests had to be
re-pointed. Per anti-gaming rule 1, **no test was deleted, skipped, or
broadened** — each below asserts something at least as strong as before.
Every one is listed individually.

| Test (file)                                                         | Old expectation                                           | New expectation                                                                    | Why legitimate                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `entry.test.ts` I3 → A-I3 → B-I3                                    | `X` ⇒ `{100, isInnerTen: true}`                           | `10` ⇒ `{100, isInnerTen: false}`                                                  | the maintainer's ruling: a plain ten carries no flag                                            |
| `entry.test.ts` I4 → A-I4 → B-I4                                    | `(X)` in integer mode is ignored (state unchanged)        | `X` ⇒ `{100, isInnerTen: true}`                                                    | the inner ten is now enterable in integer mode                                                  |
| `entry.test.ts` I5/I5b → A-I5 → B-I5                                | `9,10,8,7,X` totals 440 with 1 inner ten from `X`         | `9,10,8,7,X` totals 440 with 1 inner ten from `X` (`10` contributes no flag)       | same total, stricter flag attribution                                                           |
| `entry.test.ts` I7 → A-I7 → B-I7                                    | `visibleKeys` = `1..9,0,X,backspace`                      | `1..9,0,10,X,backspace`                                                            | the key list itself is the ruling                                                               |
| `entry.test.ts` D4 → A-D4 → B-D4                                    | `X` then `9` ⇒ 109 **with** the flag                      | `10` then `9` ⇒ 109 **without** the flag                                           | ring 10 is now typed with `10`                                                                  |
| `entry.test.ts` D5 → A-D5 → B-D5                                    | `X` then `3` ⇒ 103 with the flag                          | `10` then `3` ⇒ 103 without the flag                                               | same                                                                                            |
| `entry.test.ts` D6 → A-D6 → B-D6                                    | `(X)` then `9` ⇒ 109 with `isInnerTenDecimal`, flag-gated | `X` then `9` ⇒ 109 with `isInnerTen`                                               | the second flag is gone; the first now means centrumtia                                         |
| `entry.test.ts` D7 → A-D7 → B-D7                                    | `(X)` ignored and hidden when the gate is off             | `X` then `3` ⇒ 103 with the flag (not clamped)                                     | the gate no longer exists; replaced by a real assertion                                         |
| `entry.test.ts` D8 → B-D8                                           | pending ring ignores `X`/`(X)`                            | pending ring ignores `10`/`X`                                                      | key rename only                                                                                 |
| `entry.test.ts` D11 → B-D11                                         | decimal `visibleKeys` includes `(X)` when gated on        | decimal `visibleKeys` equals integer's, and excludes `(X)`                         | one key list in both modes                                                                      |
| `entry.test.ts` "defaults the (X) flag to off"                      | `innerTenDecimalEnabled === false` by default             | replaced by "10 and X differ only by the inner-ten flag, never by value"           | the option it asserted no longer exists; the replacement asserts the new invariant, not nothing |
| `entry.test.ts` "never shows (X) in integer mode even when flag on" | `(X)` hidden in integer mode                              | replaced by "the decimal pending ring carries the inner-ten mark from X only"      | same reason                                                                                     |
| `entry.test.ts` properties P1–P5                                    | built states with `innerTenDecimalEnabled: true`          | same properties, option removed; `anyKey` now includes `10`, not `(X)`             | arbitrary widened to the real key set; assertions unchanged                                     |
| `shots.test.ts` "sets is_inner_ten and is_inner_ten_decimal flags"  | `addShot({isInnerTenDecimal: true})` stores 1             | the deprecated column is **always** 0, and an ordinary ten stores `is_inner_ten` 0 | strictly stronger: it now pins the deprecation invariant A-N10                                  |

Everything else in the 273-test baseline is untouched and still passing.

## A.4 New behaviours, mapped to their tests

| Spec                                         | Test                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A2 B-I1..B-I7, B-D1..B-D11                   | `shared/src/scoring/entry.test.ts` (ids verbatim in test names)                                                |
| A-P6                                         | `entry.test.ts` `describe('properties')` — fast-check, both modes                                              |
| A1 A-S1..A-S6 (`seriesAverageTenths`)        | `shared/src/scoring/totals.test.ts`                                                                            |
| A1 A-S7 (`sessionInnerTenCount`)             | `totals.test.ts`                                                                                               |
| A1 A-X1 (round counter)                      | `app/src/db/queries/extra-rounds.test.ts` (3 tests)                                                            |
| A-X2 (ammo-lot usage)                        | `extra-rounds.test.ts`                                                                                         |
| A-X3 (volume)                                | `extra-rounds.test.ts` (2 tests, incl. the session-filtered sum)                                               |
| A-X4 (score exclusion)                       | `extra-rounds.test.ts` (2 tests over `listAllStatsSeries` + stats fns)                                         |
| A-X5 (no series/shots)                       | `extra-rounds.test.ts`                                                                                         |
| A-X6 (delta on edit)                         | `extra-rounds.test.ts` (2 tests, incl. clearing back to null)                                                  |
| A-X7/A-X8 (null/0, guards)                   | `extra-rounds.test.ts` (3 tests)                                                                               |
| A-X9 (migration on an existing populated DB) | `app/src/db/migrations.test.ts`                                                                                |
| A-N10 (deprecated column always 0)           | `shots.test.ts`, `seed.test.ts`, `migrations.test.ts`                                                          |
| Seed uses X sensibly                         | `app/src/db/seed.test.ts` (3 new tests)                                                                        |
| Lavender accent                              | `app/src/theme/tokens.test.ts` (jest)                                                                          |
| B-L1..B-L3 (session list)                    | **not unit-tested** — screen-level rendering; covered by the Maestro flow and the screenshots. Declared limit. |

## A.5 RED evidence

| Step                 | Observed                                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 keypad semantics  | 21 failed / 26 passed in `entry.test.ts` before touching `entry.ts`; 47/47 after                                                                                                                                                  |
| A1 header stats      | 8 failed / 16 passed in `totals.test.ts` before implementing; 24/24 after                                                                                                                                                         |
| A1 extra rounds      | 14 failed in `extra-rounds.test.ts` (`setSessionExtraRounds is not a function`, plus the RangeError guard) before implementing; all green after                                                                                   |
| A2 keypad relabel    | 10 failed / 37 passed in `entry.test.ts` before touching `entry.ts`; 47/47 after                                                                                                                                                  |
| Seed inner-ten tests | passed immediately (pre-existing behaviour). Proved non-vacuous with a throwaway mutant — `isInnerTen = rng() < 0.3` (dropping the `value === 10` condition) made the test fail; reverted, green again. Kept as regression armor. |

Test edits and implementation edits were always separate steps (anti-gaming
rule 2): the test file was edited and run to red, then the implementation.

## A.6 Gauntlet — one fresh run after the last code edit

| Layer              | Command                                               | Result                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full test suite    | `pnpm check`                                          | PASS — 26 files, **302 vitest tests passed, 0 failed**; jest 2 tests passed. Baseline 273 + 1.                                                                                                                            |
| Static types       | `pnpm typecheck` (`tsc -b`)                           | PASS — exit 0. App project checked by hand: same 3 pre-existing files, no new one.                                                                                                                                        |
| Lint               | `pnpm lint`                                           | PASS — exit 0                                                                                                                                                                                                             |
| Coverage (gate)    | `pnpm coverage`                                       | PASS — statements **100% (620/620)**, branches **100% (258/258)**, functions **100% (61/61)**, lines **100% (620/620)**. Threshold unchanged at 100%.                                                                     |
| Mutation (tool)    | `pnpm mutation` (Stryker)                             | PASS — **98.28%**: 568 killed, 2 timeout, 10 survived, 0 no-coverage, 0 errors. Break threshold unchanged at 95. M3 scored 98.26%, so the score did not regress. `totals.ts` (the new header-stat functions) is **100%**. |
| Mutation (schemas) | `pnpm mutation:schema`                                | PASS — **17/17 killed**, exit 0                                                                                                                                                                                           |
| Property-based     | inside the vitest run                                 | 8 fast-check properties (P1–P5 + A-P6 on the keypad, 2 on the result model)                                                                                                                                               |
| Real execution     | `expo run:android` + `maestro test e2e/m3-entry.yaml` | **PASS** — see §A.8                                                                                                                                                                                                       |
| Supply chain       | dependency set unchanged                              | no new dependency, so no new advisory surface; no new network/subprocess/fs capability                                                                                                                                    |
| Suite health       | `pnpm exec vitest run --sequence.shuffle`             | **PASS** — 302/302 in randomized order; no order dependence                                                                                                                                                               |

### Surviving mutants

Ten survivors, all pre-existing classifications from the M3 report except
`entry.ts`, which improved from 3 survivors to 1:

- `entry.ts:148` `if (state.cursor === 0) return state` → `if (false)`:
  **equivalent** — it falls through to `withShot(state, -1, null)`, which
  matches no index and produces a structurally identical state.
- The two survivors introduced by A2's first implementation of `isDigitKey`
  (`key >= '0'`, redundant once `key.length === 1` filters `'10'` and
  `'backspace'`) were removed by a **refactor under green**, not by a test:
  `isDigitKey` now tests set membership. Suite green before and after, mutation
  re-run afterwards (98.28%).
- The remaining seven are `classes.ts`, `groups.ts`, `index.ts` (×2 + 2
  timeouts), `marke.ts`, `standardmedalj.ts` (×3), `stats.ts` — unchanged from
  the M3 report's classification; this branch did not touch those modules'
  logic.

## A.7 Honest notes

- **Prettier churn was committed and then reverted.** A `prettier --write` over
  `app/src` reformatted a dozen M4/M5 files and the generated drizzle migration
  metadata that this change has nothing to do with. Those files were restored
  to their previous content and the commit amended, so the branch diff contains
  only files this change actually touches.
- **`.claude/worktrees/` broke `pnpm lint`** mid-task: other agents' worktrees
  are checkouts of this repo, so `eslint .` from the root linted their
  branches' sources. Added to the eslint ignores and to `.gitignore`. Not a
  scoring change, but it is in the diff and is called out here rather than
  buried.
- **The `0` key is an assumption, not a ruling.** The maintainer wrote "1-10
  and X". A miss has to be enterable, so `0` was kept; flagged in the spec
  (A2.1) for veto.
- **Session-list rendering (B-L1..B-L3) has no unit test.** It is screen code;
  the underlying math (`seriesAverageTenths`, `sessionInnerTenCount`) is fully
  tested and mutation-covered at 100%, but the row's string assembly is not.
- **The date-format amendment was issued and then withdrawn.** Nothing was
  built for it; Home already renders `dateStyle: 'medium'`, which is what the
  withdrawn-to state asks for. No shared `format-date.ts` helper exists, and
  per-screen date formatting is unchanged.

## A.8 Real execution — emulator

Dev build (`expo run:android`, BUILD SUCCESSFUL) on the `shotledger` AVD,
Metro attached. `app/e2e/m3-entry.yaml` was updated for the new keys and the
new header assertions: each of the five series is entered as `9, 9, 9, 10, X`,
so the flow exercises **both** ten keys.

**First run: FAILED**, honestly reported rather than papered over. The
post-save step `extendedWaitUntil visible: id session-total` timed out from the
third series on — the new "Extra rounds" card lengthened the header, pushing
the results card above the fold, and `extendedWaitUntil` does not scroll (the
CLAUDE.md M5 note). The **flow** was wrong, not the app: the screenshots taken
during that run show the correct values throughout. Fixed by replacing that
wait with `scrollUntilVisible … direction: UP`.

**Second run: PASSED**, every step COMPLETED, including:

```
Assert that "235", id: session-total is visible... COMPLETED
Assert that "47.0", id: session-series-average is visible... COMPLETED
Assert that "5", id: session-inner-ten-count is visible... COMPLETED
```

235 = 5 × 47; 47.0 = the per-series average; 5 = one centrumtia per series,
from the `X` key only — the four `10` presses per series contribute none.

Screenshots (session scratchpad `x-semantics/`):

| File                            | Shows                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `m3-01-home.png`                | Home, empty state                                                                                                             |
| `m3-02-new-session.png`         | new-session form, vapengrupp C + klass 2                                                                                      |
| `m3-02b-extra-rounds-field.png` | the "Extra rounds (not scored)" field on the form                                                                             |
| `m3-03-session-empty.png`       | session detail before any series                                                                                              |
| `m3-04-session-five-series.png` | Total 235, Avg/series 47.0, X (inner tens) 5; chips read `9 9 9 10 X`                                                         |
| `dark-01-dev.png`               | dark theme, **lavender** buttons (the rejected gold appears nowhere)                                                          |
| `dark-02-home.png`              | dark theme Home: lavender FAB, "Firearms & Ammo" tab untruncated, session rows reading `Sep 1, 2026 · 251 · 41.8/series · 1X` |

One UI defect was found by looking at a screenshot rather than by a test: the
keypad hint collided with the running total on a narrow screen. Fixed by
letting that row wrap (`flexWrap` + `flexShrink` on the hint).
