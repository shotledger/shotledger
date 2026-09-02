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
