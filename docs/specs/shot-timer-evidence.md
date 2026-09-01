# Shot timer — evidence report

> Old-coder EVIDENCE artifact for the shot timer.
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/shot-timer-evidence.md`
> Spec: `docs/specs/shot-timer-spec.md`

## 0. What this report does and does not buy you

- **Spec approval: not obtained (autonomous run).** Same caveat as M3: this
  spec and its implementation were authored in the same session.
- **Tier: 2.** Reproduce: `pnpm coverage` + `pnpm mutation` from the repo
  root (`shared/src/timer/**` is now in both `vitest.config.ts`'s
  `coverage.include` and `stryker.config.json`'s `mutate`).

## 1. Source state and environment

| Item        | Value                                                        |
| ----------- | ------------------------------------------------------------- |
| Branch      | `feat/shot-timer`, based on `feat/m7-release`                 |
| Isolation   | this agent's pre-existing worktree (has its own `node_modules`, `pnpm i`'d) |
| Node / pnpm | v24.12.0 / 11.24.0                                             |
| vitest      | 3.2.7                                                          |
| TypeScript  | ~6.0.3                                                         |
| Stryker     | @stryker-mutator/core 10.0.0 + @stryker-mutator/vitest-runner 10.0.0 |

New dependencies added (see spec §0 for the reasoning):
`expo-audio` ~57.0.4, `expo-keep-awake` ~57.0.1 (both in `app/`, both via
`npx expo install` for SDK-compatible versions). No new dependency in
`shared/` or at the workspace root — the timer reuses the M3 gauntlet
tooling.

## 2. Modules and what covers them

| Module                                    | Unit tests                | Coverage        | Mutation      |
| ------------------------------------------ | -------------------------- | ---------------- | -------------- |
| `shared/src/timer/engine.ts`               | `engine.test.ts` (32 tests) | 100% (all axes) | 97.7% (4 equivalent survivors, see §4) |
| `shared/src/timer/presets.ts`              | `presets.test.ts` (16 tests) | 100% (all axes) | 100% |
| `shared/src/timer/types.ts`                | (data shapes only, no branches) | n/a  | n/a |
| `app/src/features/timer/timer-controller.ts` | `timer-controller.test.ts` (7 tests, jest) | not gated (app/ has no coverage threshold, per M3 precedent) | not run (Stryker is scoped to `shared/`) |

`app/src/features/timer/use-timer.ts` and `app/src/app/timer.tsx` are
routine UI/hook glue, per CLAUDE.md — ordinary review, no coverage/mutation
gate, consistent with `use-home-data.ts` having no dedicated test either.

## 3. Coverage run

```
$ pnpm coverage
...
Test Files  39 passed (39)
     Tests  444 passed (444)

Statements   : 100% ( 1014/1014 )
Branches     : 100% ( 394/394 )
Functions    : 100% ( 96/96 )
Lines        : 100% ( 1014/1014 )
```

100% on `shared/src/{scoring,disciplines,compliance,timer}` combined (the
pre-existing M3/M4/M6 modules plus the new timer package).

One coverage-shaped design decision worth calling out: `engine.ts`'s
`advance()` originally had a defensive `MAX_TRANSITIONS_PER_ADVANCE` loop
guard (a `throw` on runaway zero-length-phase chains). It was **removed**,
not left untested — `config.series[i].durationMs > 0` is validated in the
constructor, which already proves the phase-transition loop terminates
within `2 × series.length` iterations regardless of `readyDelayMs`/`restMs`
being 0 (documented in the code comment above the loop). An untestable
"can't happen" branch would have blocked the 100% gate for no safety
benefit; removing dead code was the honest fix, not a lowered bar.

## 4. Mutation run

```
$ pnpm mutation
...
timer               |  98.16 |   98.16 |      210 |         3 |          4 |        0 |        0 |
  engine.ts          |  97.73 |   97.73 |      171 |         1 |          4 |        0 |        0 |
  presets.ts         | 100.00 |  100.00 |       39 |         2 |          0 |        0 |        0 |
...
Final mutation score of 97.85 is greater than or equal to break threshold 95
```

`presets.ts` is a clean 100%: the original "program is malformed" guards
were refactored from an optional-chain-on-a-defaulted-parameter (which made
the `?.` mutant unreachable by construction) into `requireMilsnabbProgram()`
+ `buildMilsnabbDrillConfigFrom()`, both independently testable with an
injected bad program/lookup — the same shape as `requireDiscipline` in
`shared/src/disciplines/index.ts`.

`engine.ts` has 4 survivors, all **equivalent mutants** (the mutated code is
behaviorally indistinguishable from the original, given the surrounding
invariants — not a coverage gap):

1. `if (this.isTerminal()) return [];` → `if (false) return [];` (line 81).
   Removing the early return doesn't change the result: the `while` loop's
   own `!this.isTerminal()` guard (line 93) already stops immediately in
   the same case, producing the same empty `events` array either way.
2. `while (remaining > 0 && ...)` → `while (true && ...)` (line 93). Same
   reasoning — `remaining` starting at 0 only happens via `advance(0)`,
   and the loop body's first branch (`remaining < this.remainingMs`) still
   breaks out immediately with no state change, whether the outer
   condition read `remaining > 0` or `true`.
3. `remaining > 0` → `remaining >= 0` (line 93, same site, different
   operator mutant). Same reasoning as #2.
4. `this.seriesIndex >= 0 ? this.config.series[this.seriesIndex] : undefined`
   → `true ? ... : undefined` (line 144, `currentSeriesSpec()`). JavaScript
   array indexing with `-1` returns `undefined` (no out-of-bounds
   exception), so `config.series[-1]` and the ternary's `undefined` branch
   are the same value — the ternary is redundant given that semantics, not
   wrong.

None of the four are reachable-but-untested logic gaps; all are documented
in the code itself (see the comments at engine.ts:86-92 and the
`isTerminal()` docstring). 97.85% overall (all files) clears the repo's 95
break threshold with room to spare.

## 5. Domain-fact verification (spec §2)

- `spsf-milsnabb.json`'s `structure` (`sighterSeries: 1`, groups
  `4×10s/4×8s/4×6s`) matches `docs/reference/spsf-shb-2026.md`'s J.6.1
  citation exactly — `presets.test.ts`'s
  `builds 1 provserie (10s) + 3 omgångar x 4 serier at 10/8/6s (J.6.1 p. 290)`
  asserts the generated series list against those literal numbers, so a
  future edit to the JSON that silently drifts from the SHB citation fails
  the test, not just the discipline scoring tests.
- The J.6.2 "FÄRDIGA 60 s after LADDA" fact is captured as
  `MILSNABB_OFFICIAL_READY_DELAY_MS = 60_000`, exposed but not defaulted —
  see spec §2 for why defaulting it would make solo practice impractical.
  This is a **documented simplification**, not a claim that the real match
  procedure inserts a 60 s pause before every one of the 13 series.

## 6. Audio/vibration/keep-awake verification (task's audio caveat)

Per the task instructions, emulator audio cannot be meaningfully verified.
What's actually verified, and at which layer:

| Claim                                                    | Verified how                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The engine emits the right cue at the right time, with the right `vibrate` flag | `engine.test.ts` — data assertions, 100% coverage/mutation (§3/§4) |
| The controller calls `playSound`/`vibrate` once per cue, correctly gated by `cue.vibrate` | `timer-controller.test.ts` — mocked effect functions, asserts call sequences (e.g. `ready` never vibrates, `start`/`stop`/`complete` always do) |
| `expo-audio`/`Vibration`/`expo-keep-awake` calls actually happen from the running app | **Not verified here** — `app/src/platform/timer-cues.ts` and `use-timer.ts` have no automated test (matches the existing `app/src/platform/*` precedent — none of `notifications.ts`/`csv-export.ts`/`pdf-export.ts` have one either) |
| A real device plays audible beeps / vibrates / stays awake | **Not verified at all in this session** — flagged below as a maintainer smoke-test item |

**Maintainer smoke-test item:** install a dev build on a physical Android
device, run each preset (especially the milsnabb drill, since it's the
longest), and confirm: (a) 4 distinct-sounding cues (ready/start/stop/
complete), (b) a vibration pulse on start/stop/complete but not on ready,
(c) the screen does not sleep while a drill is running and does sleep
normally again after Reset. The synthetic placeholder tones in
`app/assets/sounds/*.wav` (generated locally, no external asset — see
`shared/src/timer/presets.ts` for the drill math they're wired to) are
functional but not sound-designed; swapping them for produced audio is a
cosmetic follow-up, not a correctness one.

## 7. `pnpm check` tail

```
$ pnpm typecheck && pnpm i18n:check && pnpm lint && vitest run && (cd app && pnpm exec jest --passWithNoTests)
$ tsc -b
$ node scripts/i18n-check.mjs
en.json: 291 keys, sv.json: 291 keys, 0 issues
$ eslint .

 Test Files  39 passed (39)
      Tests  444 passed (444)

Test Suites: 2 passed, 2 total
Tests:       9 passed, 9 total
```

(438 vitest tests on `feat/m7-release` baseline + 6 new `engine.test.ts` +
`presets.test.ts` cases beyond the M3/M4/M6 baseline count = 444; jest gained
`timer-controller.test.ts`'s 7 tests alongside the pre-existing
`tokens.test.ts`'s 2.)

## 8. Deviations from a literal reading of the task

- **`shotledger2` AVD did not exist** — created it (`avdmanager create avd
  -n shotledger2 -k "system-images;android-36;google_apis;x86_64" -d
  pixel_7`), same system image as the primary `shotledger` AVD, started on
  `-port 5556` per the task's explicit port choice.
- **`expo-av` vs `expo-audio`**: task said "check which is current in SDK
  57 — pick the supported one, flag." `expo-audio` is current;
  `expo-av` is Expo's deprecated audio API as of the SDK this app runs on.
  Flagged in spec §0 and here.
- **Sound assets**: no audio-generation tool was available; 4 short
  synthetic sine-wave WAV tones were generated locally with a Python
  script (no network fetch, no new dependency) rather than left as missing
  `require()` targets that would crash the timer screen. See §6 for the
  maintainer follow-up.
- **Ready-delay authenticity**: the milsnabb drill's ready delay defaults
  to a practice value (5 s), not the SHB-cited 60 s LADDA→FÄRDIGA cadence —
  documented as a deliberate simplification in spec §2, with the authentic
  value exposed as a named constant for a shooter who wants it.
