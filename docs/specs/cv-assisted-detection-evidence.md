# Hole/patch filter — evidence report

> **2026-10-03:** the Python in `spike/cv/` is retired; the CV tools are TypeScript in [`tools/cv/`](../../tools/cv/README.md) (ADR 0018). The record below is as written.

Companion to [`cv-assisted-detection-spec.md`](cv-assisted-detection-spec.md).
Every number below comes from one fresh run after the last code edit, on
branch `feat/cv-hole-patch-filter`.

**Spec approval: not obtained (autonomous run).** The correlation-breaking
review the loop depends on did not happen, so the spec is the artifact to
review after the fact, and the confidence claimed here is correspondingly
lower. Two criteria were also **revised during implementation**; both
revisions are recorded in the spec, in place, with the measurement that forced
them.

Tier 2+, as declared. The filter can only ever refuse a snap, and a refusal
leaves the shooter's own tap standing, so no path here can move a mark to a
place the shooter did not touch.

## Environment

|                     |                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Isolation           | existing worktree, branch `feat/cv-hole-patch-filter`, branched from `feat/cv-face-prior` (PR #280) |
| Node / pnpm         | as the repo pins; `pnpm check` from the worktree root                                               |
| Vitest / Stryker    | 5.0.0 / repo-pinned, `stryker.config.json` unchanged                                                |
| Python (reference)  | `opencv-python-headless` 5.0.0, numpy 2.5.2, the spike venv                                         |
| Dependencies added  | **none**, in any package                                                                            |
| Environment changes | none — no installs, no system-level changes                                                         |

## Spec behavior → test

|   # | Behavior                                        | Verified by                                                                                                                                                                                                                                                  |
| --: | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | six descriptors of a gray crop                  | `hole-features.test.ts` — the 14 `reproduces OpenCV feature values for …` cases, which assert all six against the Python reference                                                                                                                           |
|   2 | uniform crop has zero texture                   | `reports no texture at all for a uniform crop`, plus fixtures `uniform_mid`/`uniform_black`/`uniform_white`                                                                                                                                                  |
|   3 | blind to a constant brightness offset           | `is blind to a constant brightness offset`                                                                                                                                                                                                                   |
|   4 | too-small or short buffer → zeros               | `returns zeros rather than reading past the end of a short buffer`, `returns zeros for a crop too small to convolve`, `does measure the smallest crop a 3x3 kernel fits on` (the 3-versus-2 boundary)                                                        |
|   5 | logistic of the fitted combination              | `is the logistic of bias plus the weighted features`, `saturates without overflowing at absurd inputs`                                                                                                                                                       |
|   6 | `isHoleLike` at the threshold                   | `isHoleLike cuts exactly at the threshold, inclusive`                                                                                                                                                                                                        |
|   7 | lock-step with Python                           | `uses the crop size the weights were fitted on`, `ships the constants the fixture was generated with`, `has fixtures that actually span both answers`, the 14 per-case reproductions, and `agrees with Python that a hole reads the same in either polarity` |
|   8 | filter is an additional gate, not a replacement | `tap-snap.test.ts` — every pre-existing assertion still passes **unchanged** (see 13), and `refuses a real repair patch — flat AND the same tone as the ink` exercises the case only the new gate catches                                                    |
|   9 | polarity-agnostic                               | `snaps a dark hole on white paper too — polarity is not assumed` (pre-existing, unchanged) and `agrees with Python that a hole reads the same in either polarity`                                                                                            |
|  10 | a real repair patch is refused                  | `refuses a real repair patch — flat AND the same tone as the ink`; fixture `flat_patch_dark` at p = 0.0046                                                                                                                                                   |
|  11 | crop reflected at the rim                       | `still snaps within a crop-width of the canvas edge`, `refuses rather than guessing when the canvas is narrower than a crop`, plus the four `reflectIndex` tests                                                                                             |
|  12 | `SnapResult` reports the probability            | `reports a hole probability at or above the fitted threshold too`                                                                                                                                                                                            |
|  13 | existing assertions survive unchanged           | all 10 pre-existing `tap-snap.test.ts` tests pass; `git diff` on that file adds tests and changes no assertion                                                                                                                                               |
|  14 | no new dependency                               | no `package.json` in the diff; `pnpm licenses:check` 100 packages, unchanged                                                                                                                                                                                 |
|  15 | no user-visible string change                   | `pnpm i18n:check` 1032/1032 keys, 0 issues, unchanged; no `.tsx` in the diff                                                                                                                                                                                 |
|  16 | joins the mutation set with no config change    | `stryker.config.json` untouched; the run below picked the new file up from the existing `shared/src/target-scoring/*.ts` glob                                                                                                                                |

## Gauntlet

| Layer                   | Command                                                                                                                                                           | Result                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Full suite              | `pnpm check`                                                                                                                                                      | **2074 Vitest** (+33) and **365 Jest** (+4) passing, 0 failures                                                   |
| Static types            | `pnpm typecheck` + `pnpm typecheck:app` (in `check`)                                                                                                              | 0 errors                                                                                                          |
| Lint                    | `pnpm lint` (in `check`)                                                                                                                                          | 0 warnings                                                                                                        |
| Format                  | `pnpm format` (in `check`)                                                                                                                                        | "All matched files use Prettier code style!"                                                                      |
| i18n                    | `pnpm i18n:check` (in `check`)                                                                                                                                    | 1032/1032 keys, 0 issues                                                                                          |
| Licenses                | `pnpm licenses:check` (in `check`)                                                                                                                                | 100 packages, invariants hold                                                                                     |
| Coverage, changed lines | `vitest run --coverage --coverage.include='shared/src/target-scoring/hole-features.ts'`                                                                           | **100% statements (117/117), 100% branches (20/20), 100% functions (11/11), 100% lines (92/92)**                  |
| Mutation, new module    | `stryker run --mutate 'shared/src/target-scoring/hole-features.ts'`                                                                                               | **93.02%** — 171 killed, 29 timed out, **15 survived**, 0 errors                                                  |
| Mutation, project       | `pnpm mutation`                                                                                                                                                   | **92.52%** aggregate, exit 1 against the config's `break: 95`. **Pre-existing failure — see the baseline below.** |
| Real execution          | the Python reference and the TypeScript port run over the same 14 crops                                                                                           | agree to ≤1.3e-4 absolute; the port also drives `snapToHole` end to end in the Jest suite                         |
| Supply chain            | dependency set unchanged                                                                                                                                          | nothing to audit; no new network, subprocess, filesystem or env use                                               |
| Property-ish            | `is blind to a constant brightness offset`, `keeps folding until it lands inside, however far out the index is`, `saturates without overflowing at absurd inputs` | pass — invariants rather than examples, but hand-written, not generated                                           |

### Mutation baseline — the project layer was already red

`pnpm mutation` exits 1. It did so before this change too, and the arithmetic
is in the run itself:

|                              | killed + timed out | survived | total |      score |
| ---------------------------- | -----------------: | -------: | ----: | ---------: |
| With this change             |               4872 |      394 |  5266 | **92.52%** |
| Subtracting this file's rows |               4672 |      379 |  5051 | **92.50%** |

So the baseline is 92.50% and the new file **raises** the aggregate by 0.02
points while itself scoring 93.02% — above the project's current aggregate.
**Zero new failures.** The pre-existing shortfall is concentrated in
`shared/src/timer` (`mic-diagnostics.ts` 85.90%, `falt.ts` 95.10%,
`shot-detector.ts` 93.58%) and is not this change's to fix — surfaced here,
not silently improved.

### Survivors, classified

15 survive on the new module. All 15 are **equivalent mutants**, in three
groups:

1. **Loop bounds `i < n` → `i <= n`** (7 mutants, in `toFloat`, `separable`,
   `convolve3`, the histogram and the center window). One extra iteration
   writes past the end of a `Float64Array`, which JavaScript silently drops,
   and reads through `reflectIndex`, which folds any index back in range. The
   output is bit-identical. Not killable without adding a bounds assertion
   that exists only to be mutated.
2. **Gradient sign and kernel handedness** (5 mutants: `sum +=` → `sum -=` in
   both convolution helpers, `x + d` → `x - d`, `y ± ky`, `x ± kx`). These
   negate or mirror the gradient field, and **not one of the six features
   uses the sign or handedness of a gradient**: magnitude is invariant under
   negation, the orientation histogram's entropy is invariant under rotation
   by π and under mirroring, and the Laplacian's variance is invariant under
   negation. This is a real property of the feature set, not a test gap.
3. **`reflectIndex`'s two conditionals** (3 mutants: `if (true)` on each
   branch, and `i < 0` → `i <= 0`). Making a fold unconditional inside the
   `while` loop changes the path but not the fixed point it converges to, and
   folding at `i === 0` maps 0 to −0, which indexes identically.

Two survivors from the first run of this layer were **not** equivalent, and
both were real test gaps, fixed by adding tests rather than by touching the
threshold:

- `n < 3` → `n <= 3` survived because no test used a 3×3 crop. Added
  `does measure the smallest crop a 3x3 kernel fits on`.
- The short-buffer length guard could be deleted entirely and survive, because
  the test's short buffer was all zeros — so reading past it produced a
  uniform crop, whose features are the all-zero result the guard returns
  anyway. The buffer is now deliberately textured.

Those two fixes plus deleting genuinely dead code (an unreachable `bin < 0`
clamp, two unreachable empty-array guards, ten `?? 0` fallbacks that masked
out-of-range reads behind a plausible value) took the module from **90.20% to
93.02%** and coverage from 68.51% to 100% branches. No test was weakened and
no threshold was moved.

## What failed on the way, and how it was resolved

Nothing was quietly fixed. Three things went red:

1. **RED was real.** The first run of `hole-features.test.ts` was 14 failed /
   14 passed. Two of those failures were genuine porting bugs, and the
   cross-language fixture is what caught both:
   - **The orientation histogram split one direction across two bins.**
     Implemented as a single 3×3 kernel, OpenCV's Sobel is reproduced to
     within a ~1e-16 rounding residue — and the _sign_ of that residue decides
     which bin a zero-gradient pixel lands in. `cv2.Sobel` is **separable**,
     and done separably the derivative pass differences two identical numbers
     and cancels exactly. A linear ramp went from an entropy of 0.66 (mass
     split across two bins) to ~0 (all in one), matching Python.
   - **The Gaussian blur used the wrong kernel.** For `ksize <= 7` with
     `sigma <= 0`, OpenCV returns a hardcoded binomial kernel ([1,4,6,4,1]/16),
     not a sampled Gaussian at the sigma it would otherwise derive. Computing
     the Gaussian put `hfEnergy` **2.5%** out.
2. **A spec criterion was unachievable and was revised, visibly.** Behavior 7
   asked for 1e-6 absolute agreement with Python. OpenCV and numpy compute
   this pipeline in float32 and the TypeScript in float64, so they agree to
   about 1e-7 relative and no closer. The criterion is now a 1e-4 **relative**
   tolerance — still 250× tighter than the smaller of the two real bugs above.
3. **A spec criterion was wrong about behavior and was revised, visibly.**
   Behavior 11 said the crop _shifts inward_ near the canvas rim. Built that
   way, `snapToHole` silently stopped snapping within 24 px of the edge, and
   the test written for the criterion caught it: `centerDeviation` is defined
   against the middle of the crop, so a crop slid sideways reads a real hole as
   off-center texture. The crop now **reflects** at the rim and stays centered.

## What this evidence does not cover

- **The measurement is the Python twin's, not this code's.** The 89.7%
  precision and 0.32 false positives per photo in
  `cv-corpus-validation-2026-09.md` §5 were measured by running
  `spike/cv/hole_filter.py` over real photos, which cannot be done in CI. The
  TypeScript is pinned to that reference by a fixture, and the fixture's crops
  are **synthetic** — so what is proven here is _the port is faithful_, not
  _the filter performs on photos_. The latter rests on the Python run.
- **`snapToHole`'s own behavior on real photos is unmeasured.** The corpus
  measurement is of the filter behind the spike's proposal stage; the app
  runs it behind `snapToHole`'s blob finder, as a second gate. The
  conjunction cannot accept more than before, so the change is one-directional
  and safe, but nobody has measured how often it now declines to help on a
  real tap.
- **4 of 96 labelled holes are outside the black zone.** The polarity fix
  removes a structural bias against white-zone holes; it does not give them an
  evidence base.
- **No independent verification** (the Tier 3 option) was run. Not performed,
  declared as such.
- The whole chain — spec, implementation, tests, fixture generator and this
  report — was written by the same agent. The spec was not reviewed before the
  code existed, which is the one correlation the loop is designed to break.
