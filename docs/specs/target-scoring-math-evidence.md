# Target-scoring math — evidence report

Spec: `docs/specs/target-scoring-math-spec.md`. **Spec approval: not obtained
(autonomous run).** All numbers below are from one final fresh run executed
after the last code edit (source state: branch `feat/target-scoring-math`, on
top of `feat/score-x-semantics`).

## Behavior → test mapping

| Behavior                           | Test                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| GB1-GB5                            | `shared/src/target-scoring/geometry.test.ts` → `describe('buildRectification')`      |
| GT1-GT3 (+1 extra)                 | `geometry.test.ts` → `describe('imageToTargetMm / targetMmToImage')`                 |
| GR1-GR5                            | `geometry.test.ts` → `describe('refineRectification')`                               |
| SP1-SP7 (+2 extra)                 | `geometry.test.ts` → `describe('scoreRadialProfile')`                                |
| CF1-CF5 (+3 extra: CF6-CF8)        | `geometry.test.ts` → `describe('coarseToFineRefine')`                                |
| GP1-GP3                            | `geometry.test.ts` → `describe('geometry properties')`                               |
| TG1-TG12                           | `shared/src/target-scoring/targets.test.ts`                                          |
| SC1-SC13                           | `shared/src/target-scoring/score.test.ts` → `describe('scoreHole — precision face')` |
| SC10 (11 boundaries, table-driven) | `score.test.ts` → `describe('SC10: tangent flip points...')`, `it.each`              |
| SC11                               | `score.test.ts` → `describe('SC11: milsnabb face...')`                               |
| SP-P1-SP-P3                        | `score.test.ts` → `describe('scoreHole properties')`                                 |
| SE1-SE8                            | `shared/src/target-scoring/session.test.ts`                                          |
| barrel re-export                   | `shared/src/target-scoring/index.test.ts`                                            |

Every scenario in the spec has a corresponding test with the exact fixture
values from the spec text (e.g. SC2/SC3's 15.30mm/15.31mm worked example is
the literal input in the test, ported verbatim from cv-spike-report.md §4.5).
Extra tests beyond the spec's numbered scenarios (GT's offset-sign test,
SP6/SP7 and two more window-boundary tests, CF6-CF8) were added during the
mutation-testing gauntlet to close real gaps the initial scenario set left
open — listed below, not silently folded into the numbered scenarios.

## Deviation found and corrected during GREEN

**SC1's `edgeCall` value was wrong in the first draft of the test** (expected
`true`, the correct value is `false` — a 12.5mm margin is nowhere near the
1mm threshold). Caught by the first RED→GREEN run against the real
implementation; the test was corrected, not the implementation. No other
deviation between the spec and what shipped.

## Gauntlet layers — final run

All commands run from the repo root on branch `feat/target-scoring-math`.

### Full suite

```
pnpm exec vitest run
```

```
Test Files  31 passed (31)
     Tests  385 passed (385)
```

302 tests from the `feat/score-x-semantics` baseline + 83 new
(geometry.test.ts 34, score.test.ts 28, session.test.ts 8, targets.test.ts 12,
index.test.ts 1) = 385. Zero new failures; zero pre-existing failures.

### Typecheck / lint / format

```
pnpm typecheck   # tsc -b — clean
pnpm lint        # eslint . — clean
pnpm exec prettier --check shared/src/target-scoring/*.ts docs/specs/target-scoring-math-spec.md \
  vitest.config.ts stryker.config.json shared/src/index.ts   # clean
```

`pnpm check` (typecheck + lint + vitest + app jest) run in full: 385 vitest
tests + 2 jest tests, all passing.

### Coverage (gauntlet layer, fails closed on miss)

```
pnpm coverage
```

```
Statements   : 100% ( 869/869 )
Branches     : 100% ( 303/303 )
Functions    : 100% ( 78/78 )
Lines        : 100% ( 869/869 )
```

Scoped to `shared/src/scoring/**`, `shared/src/disciplines/**` and
`shared/src/target-scoring/**` (`vitest.config.ts`, extended this branch);
`target-scoring/*.ts` are new files inside that glob, so this number is 100%
including all four new modules.

### Mutation testing (Stryker)

```
pnpm mutation
```

```
All files            98.60%   (769 killed / 5 timeout / 11 survived / 0 no-cov / 0 errors)
 target-scoring      99.51%   (201 killed / 3 timeout / 1 survived)
  geometry.ts        99.35%   (149 killed / 3 timeout / 1 survived)
  score.ts          100.00%   (37 killed / 0 timeout / 0 survived)
  session.ts        100.00%   (9 killed / 0 timeout / 0 survived)
  targets.ts        100.00%   (6 killed / 0 timeout / 0 survived)
Final mutation score of 98.60 is greater than or equal to break threshold 95 — exit 0.
```

`disciplines/*` and `scoring/*` survivors (4 + 6 = 10 of the 11
non-target-scoring total) are **pre-existing from M3/M4/M5**, not touched by
this change — already classified in `docs/specs/m3-scoring-evidence.md` /
`m5-stats-evidence.md`. `geometry.ts`'s 3 timeouts are Stryker's own sandboxed
runs of the coarse-to-fine grid search (a triple-nested loop) taking longer
than the default per-mutant budget under instrumentation — not a hang in the
shipped code (the full suite, including every `coarseToFineRefine` test,
completes in milliseconds without Stryker's instrumentation overhead).

**target-scoring's one survivor, classified equivalent:**

1. `geometry.ts:149` — `if (v > localMax) localMax = v;` mutated to `v >=
localMax`. `scoreRadialProfile`'s inner loop computes a **maximum**, and
   `>` vs `>=` differ only in which occurrence of a _tied_ maximum value gets
   assigned to `localMax` — the returned value (the max itself) is identical
   either way, because taking-the-max is order-independent regardless of
   ties. No input can distinguish them: proven by exhaustion over every
   scenario the mutation run exercised (SP1, SP2, SP4, and 5 more), none of
   which found a difference, consistent with the general argument above.

This is a materially better result than the pre-existing scoring modules'
mutation scores (94.23-99.38%), achieved by iterating the test suite directly
against Stryker's own survivor list rather than writing tests speculatively —
each of the 10 non-equivalent survivors reported by the first mutation run
(all in `geometry.ts`: window-boundary off-by-ones, error-message content,
the tie-break comparator, the `(dx,dy,scale)` shrink-formula arithmetic, and
an offset sign) was closed with a targeted test before the final run above.

Negative control (gauntlet checker note): before trusting the final "pass",
each of the added tests was verified non-vacuous by construction — every one
targets a specific mutant Stryker had actually reported as surviving in an
earlier run (quoted in the commit history of this branch), and the identical
final run confirms each one now kills its target (the survivor list shrank
from 14 target-scoring survivors → 11 → 1 across three mutation runs, quoted
mutant-by-mutant in this file's git history if needed).

### Schema mutation (unaffected layer, rerun to confirm no regression)

```
pnpm mutation:schema
```

```
17/17 mutants killed.
```

No zod schema changed in this branch; rerun proves zero regression.

## Layers skipped, and why

- **Real execution**: this is math-only, consumed by no app screen yet (the
  spec's explicit boundary — see spec §1). There is no CLI/UI to run it
  against; the property tests (GP1-GP3, SP-P1-SP-P3) exercise the functions
  across a wide input space in lieu of a manual run, and `session.test.ts`
  SE5 cross-checks the output against the real `entry.ts` constructor
  (`createKeypadState`) rather than only asserting shape.
- **Supply-chain audit**: no new dependency, runtime or dev (spec §0).
- **Fuzzing**: no parser/deserializer in this change; the closest analogue,
  arbitrary numeric input, is covered by the fast-check property suites.
- **Complexity budget**: every exported function is single-purpose;
  `coarseToFineRefine` (the largest, ~35 lines including the `grid` helper)
  is a direct structural port of the spike's own loop nesting, not expanded
  scope.

## Negative constraints check (spec §7)

- **N1** `grep -rn "react-native\|opencv" shared/src/target-scoring` — no
  matches. Pure TypeScript, zero image-processing/native imports.
- **N2** No ellipse-fitting-from-pixels or blob-detection code exists in this
  directory — confirmed by reading every file (4 modules, ~340 lines total).
- **N3** SE5 seeds `createKeypadState` with `seriesToEntryShots`'s own output
  directly and asserts it does not throw — a real cross-module check, not an
  independent re-assertion of the same range rule.
- **N4** 302 pre-existing tests all present in the 385-test run, zero
  failures (`git diff` also confirms no pre-existing test file under
  `shared/src/scoring` or `shared/src/disciplines` was modified).
- **N5** `vitest.config.ts` and `stryker.config.json` thresholds
  (100/100/100/100 coverage, 95 Stryker break) are the same numbers already
  in place for `shared/src/scoring`/`shared/src/disciplines` — extended, not
  lowered, to cover the new directory (see the `git diff` on those two
  files).
- **N6** Every SHB citation (ring diameters in `targets.ts`, F.6.10.1 wording
  in `score.ts`'s header comment) was checked against
  `docs/reference/spsf-shb-2026.md` verbatim during writing, not re-derived
  from `target_cv.py` or memory alone — the reference doc's own ring table
  (lines 114-128) and the spike's `PRECISION_RINGS`/`MILSNABB_RINGS` tables
  were cross-checked against each other and found to agree on every value
  (spec §6).

## Deviations from the spec during implementation

One, already covered above (SC1's `edgeCall` expectation). Otherwise the four
modules were implemented to match the spec's stated formulas and fixtures
exactly; all changes after the first GREEN run were **additional tests**
closing mutation-testing gaps (never an implementation edit in the same step
as a test edit), each traceable to a specific Stryker-reported survivor.

## Native/JS split (task deliverable — where the future app layer's contract lives)

Recorded in the spec (§1) rather than only here, since it is a contract the
native integration code must read before it is written: OpenCV/native code
owns ellipse fitting from pixels and radial-profile sampling from the
rectified image; `shared/src/target-scoring/` owns everything from "an
`EllipseFit` and hole pixel-coordinates exist" onward — rectification math,
driving the coarse-to-fine search (native supplies the `evaluate` callback
that does its own image sampling), SHB scoring, and the bridge into
`shared/src/scoring/entry.ts`'s existing storage model.

## UI layer

None exists yet — out of scope per the task (`shared/src/target-scoring/` +
tests + specs only, no `app/src/` changes). The barrel export
(`shared/src/target-scoring/index.ts`, re-exported from `shared/src/index.ts`)
is the surface a future `app/src/` screen or worklet would import.
