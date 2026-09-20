# Target-scoring math — executable specification

> Old-coder SPEC artifact for the CV-spike math port (photo target scoring,
> mathematics only).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/target-scoring-math-spec.md`
> Evidence report: `docs/specs/target-scoring-math-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** The maintainer did not
> review this spec before implementation. This document is the artifact the
> maintainer reviews after the fact; EVIDENCE claims confidence accordingly.

Tier: **3** (scoring math; a wrong ring value or a wrong transform is silently
wrong data feeding märke/standardmedalj/compliance later, same tier as
`shared/scoring/`). Scope of the old-coder loop: everything under
`shared/src/target-scoring/`. Nothing in `app/src/` or any OpenCV/native code
is touched — this spec is math only, per the task's explicit boundary.

## 0. Setup plan (what approving this authorizes)

- **Isolation:** branch `feat/target-scoring-math`, based on
  `feat/score-x-semantics` (not a worktree of its own — this agent runs inside
  a worktree already, and the gauntlet needs the repo's installed
  `node_modules`, already present).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths
  staged, branch pushed, no PR opened, `main` never touched.
- **No new dependency**, runtime or dev. `fast-check` (property tests) and
  `vitest`/`@stryker-mutator/*` are already in the root `devDependencies`.
- **Files the gauntlet adds, by path:**
  `shared/src/target-scoring/geometry.ts` (+ `.test.ts`),
  `shared/src/target-scoring/targets.ts` (+ `.test.ts`),
  `shared/src/target-scoring/score.ts` (+ `.test.ts`),
  `shared/src/target-scoring/session.ts` (+ `.test.ts`),
  `shared/src/target-scoring/index.ts`,
  `docs/specs/target-scoring-math-spec.md` (this file),
  `docs/specs/target-scoring-math-evidence.md`.
  `vitest.config.ts` and `stryker.config.json` coverage/mutate globs are
  extended to include the new directory; `shared/src/index.ts` gets one new
  barrel line.

## 1. Source material and the native/JS split

- CV spike report: `docs/specs/cv-spike-report.md` (branch
  `spike/cv-target-scoring`, not yet merged to `main` — fetched for this task).
- Python prototype: `spike/cv/target_cv.py` on the same branch, sections
  `build_geom` (stage 2), `refine_geom`/`_radial_profile` (stage 3), and
  `score_hole` (stage 5). Stage 1 (`find_face`, ellipse fitting from pixels)
  and stage 4 (`find_holes`, blob detection) are OpenCV image-processing and
  stay native-side per the task's scope — **this port starts from "an ellipse
  and hole pixel-coordinates exist"**, exactly the task's stated boundary.
- Domain reference: `docs/reference/spsf-shb-2026.md` (ring diameters F.7.1
  p.182 / J.7.1 p.297; edge rule F.6.10.1 p.176).

**The contract for the future native (`react-native-fast-opencv`) layer:**
native code is responsible for (a) producing an `EllipseFit` (center, axis
lengths, rotation) from the fitted black-zone contour, (b) sampling a radial
intensity/edge profile from the rectified image at a candidate geometry (the
spike's `warpPolar` + high-pass step), and (c) producing `Hole[]` (center +
caliber) in image pixel coordinates from the learned/classical hole detector.
Everything downstream of that — rectification math, the coarse-to-fine search
_driver_, and SHB scoring — is pure TypeScript in `shared/src/target-scoring/`,
callable from a worklet or the JS thread with no OpenCV dependency, matching
spike report §4.6 point 4 ("Scoring in `shared/` as pure TypeScript over
(x_mm, y_mm) hole centers — no CV dependency").

## 2. `geometry.ts` — ellipse → target-mm rectification

### 2.1 Types

```ts
interface Point {
  x: number;
  y: number;
}

interface EllipseFit {
  center: Point; // image px
  majorAxis: number; // full axis length (diameter), image px, > 0
  minorAxis: number; // full axis length (diameter), image px, > 0, <= majorAxis
  rotationDeg: number; // degrees; OpenCV fitEllipse convention — see 2.2 note
}

interface RectificationTransform {
  center: Point; // image px pivot (the ellipse center)
  m: readonly [number, number, number, number]; // row-major 2x2, mm per px
  offset: Point; // mm, added after the linear map
}
```

### 2.2 `buildRectification(ellipse, referenceDiameterMm): RectificationTransform`

Ports `build_geom` (target_cv.py:167-188), dropping the fixed pixel canvas —
the spike rectifies into a _second image_ at 4 px/mm and then does ring math
in that image's pixels; this port rectifies directly into **target
millimeters**, which is the representation `score.ts` and the app need and
removes a redundant unit conversion. The linear-algebra content is identical:

```
r_out = referenceDiameterMm / 2
th    = rotationDeg in radians
R     = [[cos th,  sin th],
         [-sin th, cos th]]
S     = diag(2*r_out/minorAxis, 2*r_out/majorAxis)
M     = S @ R
offset = (0, 0)
```

**Convention note (native-layer contract):** `R`'s first row pairs with
`minorAxis` and its second with `majorAxis`, exactly as `target_cv.py`'s
`(cx,cy),(d_minor,d_major),ang = ellipse` unpacking assumes. This is
OpenCV's own `fitEllipse`/`fitEllipseDirect` output convention (`size =
(width, height)`, `angle` measured against that axis order), so the native
layer passes the ellipse through unchanged — no re-derivation needed on that
side.

| #   | Given                                                                     | Then                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GB1 | circular ellipse (major=minor=800px), referenceDiameterMm=200, rotation 0 | `m` is a uniform scale `diag(0.25,0.25)` (200/800·2 = wait: 2·100/800=0.25) mm/px                                                                                                                                                             |
| GB2 | rotation 90°, otherwise as GB1                                            | `m` swaps sign pattern per the rotation matrix; a point on +x image axis maps to -y (or +y, per matrix) mm axis — exact value asserted, not just shape                                                                                        |
| GB3 | anisotropic ellipse (major=1000,minor=800), referenceDiameterMm=200       | `m`'s two diagonal-dominant entries differ (500/1000 vs 500/800 scale) — verifies anisotropic correction, the whole point of rectification                                                                                                    |
| GB4 | `majorAxis<=0`, `minorAxis<=0`, or `referenceDiameterMm<=0`               | throws `RangeError`                                                                                                                                                                                                                           |
| GB5 | `minorAxis > majorAxis`                                                   | throws `RangeError` (caller contract: pass axes pre-sorted, matches OpenCV's own report where size components are not guaranteed sorted, but this port requires the caller to sort — named explicitly so the native wiring code does it once) |

### 2.3 `imageToTargetMm` / `targetMmToImage`

```
imageToTargetMm(t, p) = M · (p - t.center) + t.offset
targetMmToImage(t, p) = t.center + M⁻¹ · (p - t.offset)
```

| #   | Given                                                           | Then                                                                                                                                        |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GT1 | identity-like transform (M=diag(1,1), offset 0,0, center (0,0)) | `imageToTargetMm({x:5,y:3})` = `{5,3}`                                                                                                      |
| GT2 | any transform from GB1-GB3, any point                           | `targetMmToImage(t, imageToTargetMm(t, p))` ≈ `p` (round-trip, direct case, exact-arithmetic assertion, not just the property test in §2.6) |
| GT3 | ellipse center itself                                           | maps to mm `(offset.x, offset.y)` exactly (the center is the transform's own pivot)                                                         |

### 2.4 `refineRectification(t, dxMm, dyMm, scale): RectificationTransform`

Ports the _effect_ of `refine_geom`'s `(dx, dy, scale)` correction
(target_cv.py:193-237: `geom.center = ...`; `geom.px_per_mm *= sc`), redefined
in mm-space because this port has no fixed pixel canvas (§2.2). Defined so
that for every image point `p`:

```
imageToTargetMm(refineRectification(t, dx, dy, scale), p)
  === scale * (imageToTargetMm(t, p) - (dx, dy))
```

i.e. `(dx, dy)` is how far the assumed mm origin was wrong and `scale`
corrects the ring-radius scale error the spike's `ring_fit_err_mm` measures
(cv-spike-report.md §3 "Geometry, measured separately": ±0.6mm residual,
inside SHB's 0.2-2.0mm print tolerance). Closed form: `m' = scale · m`,
`offset' = scale · (offset − (dx, dy))`, `center` unchanged.

| #   | Given                               | Then                                                                                  |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| GR1 | `t` = identity, dx=1,dy=2,scale=1   | any point's mm shifts by exactly (-1,-2)                                              |
| GR2 | `t` = identity, dx=0,dy=0,scale=2   | mm doubles                                                                            |
| GR3 | combined dx,dy,scale, any point `p` | `imageToTargetMm(refined,p)` equals the formula above to float tolerance              |
| GR4 | `scale<=0`                          | throws `RangeError`                                                                   |
| GR5 | `refineRectification(t,0,0,1)`      | returns a transform behaving identically to `t` for every point (identity refinement) |

### 2.5 `scoreRadialProfile(profile, samplesPerMm, ringRadiiMm, windowSamples?)`

Ports the scoring inner loop of `refine_geom` (target_cv.py:219-227): for
each known ring radius, look at a small window of the profile around the
expected sample index and take its local max; average across all radii that
fit inside the profile. This is the pure-math half of the spike's alignment
objective — sampling `profile` (a 1-D array indexed by radius-in-samples) is
the native layer's job (`warpPolar` + high-pass, target_cv.py:240-249).

```
for rm of ringRadiiMm:
  r = round(rm * samplesPerMm)
  window = profile[max(0,r-windowSamples) .. r+windowSamples]  // inclusive both ends, matches spike's slice semantics (lo, hi=r+3 for windowSamples=2)
  if window's upper bound is within profile.length: v += max(window); n += 1
return n > 0 ? v/n : -Infinity   // -Infinity replaces the spike's -1e9 sentinel: "no ring radius fit inside this profile"
```

| #   | Given                                                                              | Then                                                                     |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| SP1 | profile with a spike exactly at each ring radius's sample index, `windowSamples=2` | score equals the peak value (every ring finds its window-local max)      |
| SP2 | profile too short for the outermost ring radius                                    | that radius is excluded from the average (`n` counts only fitting radii) |
| SP3 | profile too short for **every** radius                                             | returns `-Infinity`                                                      |
| SP4 | `windowSamples` default (not passed)                                               | behaves as `windowSamples=2`, matching the spike's `r-2, r+3` window     |
| SP5 | empty `ringRadiiMm`                                                                | returns `-Infinity` (n stays 0)                                          |

### 2.6 `coarseToFineRefine(evaluate, options?): CoarseToFineResult`

Ports the coarse-to-fine grid search driver in `refine_geom`
(target_cv.py:206-231) generically: the _caller_ supplies `evaluate(dx, dy,
scale): number` (which, in the native app, samples the image and calls
`scoreRadialProfile`); this function owns only the search structure — grid
bounds, the shrinking window, and picking the best candidate per iteration —
so "the native layer can drive the same coarse-to-fine search" (task wording)
over any evaluator.

```ts
interface CoarseToFineOptions {
  initialSearchMm?: number; // default 10, spike's search_mm
  initialStepMm?: number; // default 2, spike's step
  scaleWindow?: number; // default 0.12, spike's ±0.12
  iterations?: number; // default 3, spike's coarse-to-fine iters
}
interface CoarseToFineResult {
  dxMm: number;
  dyMm: number;
  scale: number;
  score: number;
}
```

Per iteration: grid dx, dy over `[best.dx − searchMm, best.dx + searchMm]`
step `stepMm`; scale over `[best.scale − scaleWindow, best.scale +
scaleWindow]` step `0.02 * stepMm / 2` (spike's literal step formula,
target_cv.py:218); keep the best-scoring candidate; then `searchMm = stepMm *
1.5`, `stepMm = max(0.5, stepMm / 3)` (spike's shrink rule, line 231).

| #   | Given                                                                                                                            | Then                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CF1 | `evaluate` = `-((dx-3)² + (dy-1)² + (scale-1.05)²)` (a smooth optimum at dx=3,dy=1,scale=1.05, inside the default search window) | result within one final grid step of the true optimum, and `score` matches `evaluate(result.dx,result.dy,result.scale)` exactly                                                                                                                |
| CF2 | `evaluate` returns a constant                                                                                                    | any grid point is "best" (first one found — deterministic iteration order asserted); no throw                                                                                                                                                  |
| CF3 | `iterations=1`                                                                                                                   | exactly one grid pass; result restricted to the first (coarsest) grid                                                                                                                                                                          |
| CF4 | default options omitted entirely                                                                                                 | same result as passing the documented defaults explicitly (property: options object is optional, not required)                                                                                                                                 |
| CF5 | `evaluate` is called                                                                                                             | never with a `scale<=0` argument (grid construction keeps `scale` positive: default window 1±0.12 keeps this true; a deliberately small `initialStepMm` still can't push scale to 0 — asserted by inspecting every call's arguments via a spy) |

### 2.7 Properties (fast-check)

- **GP1** Round-trip: for any `EllipseFit` satisfying GB4/GB5's preconditions
  and any `referenceDiameterMm > 0`, and any `Point`,
  `targetMmToImage(t, imageToTargetMm(t, p))` equals `p` to within 1e-6 px.
- **GP2** `refineRectification` composes: refining by `(dx1,dy1,s1)` then
  `(dx2,dy2,s2)` produces the same mm output (to float tolerance) as the
  closed-form combined refinement implied by §2.4's formula, for any point.
- **GP3** `scoreRadialProfile` is invariant to appending extra samples past
  every used window (padding the profile tail never changes the result).

### 2.8 Amendment — scenarios added during the mutation-testing gauntlet

> **Append-only amendment** (old-coder: the spec is never rewritten in
> place). The initial scenario tables (§2.2-§2.7) were not exhaustive enough
> to reach Stryker's 95% break threshold on `geometry.ts` alone (first run:
> 87.58%, then 92.81%, then 99.35% after the scenarios below were added — see
> `docs/specs/target-scoring-math-evidence.md`). Every scenario here closes a
> specific mutant Stryker reported as surviving; none changes §2.2-§2.7's
> behavior, only adds coverage of it.

- **`buildRectification`/`refineRectification` error messages.** GB4, GB5 and
  GR4 now assert the exact `RangeError` message text (`toThrow(/regex/)`
  rather than `toThrow(RangeError)`), closing string-literal mutants that a
  type-only assertion cannot see.
- **Offset sign in `targetMmToImage`.** A direct test with a non-zero
  `offset` (not producible by `buildRectification`, which always emits
  `{x:0,y:0}` — only `refineRectification` produces a non-zero one) asserts
  the offset is _subtracted_ before inverting, not added.
- **SP6/SP7 — the profile window's upper bound is a half-open interval.** SP6:
  a profile whose `length` exactly equals the window's exclusive upper bound
  is still included (closes a `hi > profile.length` → `hi >= profile.length`
  mutant, an off-by-one that would wrongly exclude the boundary case). SP7: a
  large value placed exactly one sample past the window is never picked up,
  even though the profile is long enough to hold it (closes a `for (i=lo;
i<hi...)` → `i<=hi` mutant).
- **`samplesPerMm` multiplies, not divides.** A test with `samplesPerMm=4`
  distinguishes `Math.round(radiusMm * samplesPerMm)` from the
  division-swapped mutant (both were indistinguishable at the tables' default
  `samplesPerMm=1`).
- **The window's lower bound clamps to 0.** A test with `r < windowSamples`
  (so the naive lower bound goes negative) proves `Math.max(0, ...)` is used,
  not `Math.min` — using a real array property at a negative-looking key
  (`arr[-1] = x`, valid JS: array elements accept any string/number
  property) so an unclamped mutant's extra read is actually observable
  rather than silently reading `undefined`.
- **CF6 — deterministic first-grid-point trace.** With a constant `evaluate`,
  every grid point ties, so a strict `>` comparator never moves off the
  _first_ point evaluated per iteration — which is always `center -
halfWidth` by `grid()`'s construction, independent of `stepMm`. This closes
  the `score > candScore` → `score >= candScore` tie-break mutant (which
  would instead converge on the _last_ tied point) and, because the assertion
  chains three iterations' worth of `searchMm` values, also closes the
  `searchMm = stepMm * 1.5` → `stepMm / 1.5` mutant (the two formulas diverge
  starting at iteration 2).
- **CF7 — `iterations: 0`.** Not previously specified: with zero iterations
  the grid search never runs, `evaluate` is never called, and the function
  returns the unrefined identity (`{dxMm:0, dyMm:0, scale:1}`) with `score:
-Infinity` — the same "nothing evaluated yet" sentinel `scoreRadialProfile`
  uses (§2.5), for the same reason (no evaluation happened, so no score
  exists). This is a genuine addition to the contract, not just a test: it
  closes the `bestScore = -Infinity` → `+Infinity` mutant, which is otherwise
  equivalent (the initial value is always overwritten before being read, for
  any `iterations >= 1`) and therefore unreachable without this behavior
  being real and specified.
- **CF8 — the `stepMm` shrink recurrence and the `scaleStep` formula.** A
  two-iteration run with `initialStepMm: 6` (chosen so `max(0.5, 6/3) = 2`,
  a value where `Math.max`/`Math.min` and `*`/`/` all disagree) inspects the
  actual grid spacing used in iteration 2 via a spy on `evaluate`, closing
  three arithmetic/method mutants at once: `Math.max(0.5, stepMm/3)` →
  `Math.min(...)`, and `scaleStep = (0.02*stepMm)/2` → `0.02*stepMm*2` /
  `(0.02/stepMm)/2`.

**One survivor remains, classified equivalent** (not closed by a test,
because none can exist): `if (v > localMax) localMax = v;` in
`scoreRadialProfile`'s window-max loop, mutated to `v >= localMax`. This
computes a maximum; `>` vs `>=` differ only in which _occurrence_ of a tied
maximum is kept, and the returned value (the max itself) is identical either
way. See the evidence report for the full argument.

## 3. `targets.ts` — target face data

Consumed by id from `shared/src/disciplines` (`Discipline.targetFace`):
`spsf-precision`'s targetFace is `"spsf-pistol-25m-precision"`,
`spsf-milsnabb`'s is `"spsf-snabbskjutning-25m"` (verified against the JSON
files at `shared/src/disciplines/definitions/*.json`). Ring diameters and the
reference (black-zone) diameter are transcribed from
`docs/reference/spsf-shb-2026.md` and cross-checked against
`target_cv.py`'s `PRECISION_RINGS`/`MILSNABB_RINGS`/`TARGETS` tables (both
sources agree on every value).

```ts
interface TargetRing {
  label: string;
  value: number;
  isInnerTen: boolean;
  diameterMm: number;
}
interface TargetFaceDefinition {
  id: string;
  rings: readonly TargetRing[]; // ascending diameter, X first
  referenceDiameterMm: number; // outer diameter of the printed black zone (fit anchor)
  referenceIsSolidBlack: boolean; // true = precision solid disc, false = milsnabb annulus
}
```

| #    | Given                                                                                                                                                          | Then                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TG1  | `SPSF_PISTOL_25M_PRECISION.rings`                                                                                                                              | 11 rings X,10..1 with diameters 25,50,100,150,200,250,300,350,400,450,500 mm (SHB F.7.1 p.182)                            |
| TG2  | `SPSF_PISTOL_25M_PRECISION.referenceDiameterMm`                                                                                                                | 200 (black covers rings 7-10, SHB F.7.1 p.182)                                                                            |
| TG3  | `SPSF_PISTOL_25M_PRECISION.referenceIsSolidBlack`                                                                                                              | true                                                                                                                      |
| TG4  | `SPSF_SNABBSKJUTNING_25M.rings`                                                                                                                                | 7 rings X,10..5 with diameters 50,100,180,260,340,420,500mm (SHB J.7.1 p.297)                                             |
| TG5  | `SPSF_SNABBSKJUTNING_25M.referenceDiameterMm`                                                                                                                  | 500 (black across 5-10)                                                                                                   |
| TG6  | `SPSF_SNABBSKJUTNING_25M.referenceIsSolidBlack`                                                                                                                | false                                                                                                                     |
| TG7  | only ring X has `isInnerTen: true` on both faces                                                                                                               | verified over the full ring list                                                                                          |
| TG8  | `getTargetFace('spsf-pistol-25m-precision')` / `('spsf-snabbskjutning-25m')`                                                                                   | returns the matching definition                                                                                           |
| TG9  | `getTargetFace('nonsense')`                                                                                                                                    | `undefined`                                                                                                               |
| TG10 | `requireTargetFace('nonsense')`                                                                                                                                | throws `Error`                                                                                                            |
| TG11 | every SPSF `Discipline` in `shared/src/disciplines` with `scoring: 'rings'` (`generic-rings`, federation `generic`, is out of scope — no fixed SHB dimensions) | `requireTargetFace(discipline.targetFace)` resolves without throwing — proves the data files and this module stay in sync |
| TG12 | each face's `rings` array                                                                                                                                      | strictly ascending `diameterMm`, no duplicate labels, no duplicate diameters                                              |

## 4. `score.ts` — SHB F.6.10.1 edge-touch scoring

### 4.1 The rule, precisely

`docs/reference/spsf-shb-2026.md:31-32` (SHB F.6.10.1 p.176): **"Kulhål
räknas till det högre värdet så snart ringens ytterkant är tangerad"** — "A
bullet hole counts to the higher value as soon as the ring's outer edge is
tangented [touched]." A ring's outer edge is the printed line at that ring's
diameter, the boundary between that ring's value and the next lower one. A
hole (a disc of diameter = caliber, centered at the point of impact) tangents
that line as soon as any part of the hole reaches it from outside — i.e. the
point of the hole _nearest_ the target center reaches the boundary. This is
exactly `target_cv.py`'s `score_hole` (line 444-460): `edge_mm = max(0,
r_mm − caliber/2)` (the hole's near edge) compared against each ring radius,
smallest (highest value) first, first match wins.

### 4.2 Types

```ts
interface Hole {
  centerMm: Point;
  caliberMm: number;
} // target-mm coords, origin at target center
interface ScoreResult {
  ringLabel: string; // ring label, or '0' for a miss
  value: number; // 0-10 (X counts as 10, same as target_cv.py's ring_value)
  isInnerTen: boolean;
  marginMm: number; // distance from the hole's near edge to the decisive ring boundary; for a miss, distance PAST the outermost ring
  edgeCall: boolean; // true iff scored (not a miss) and marginMm < 1mm
}
```

`EDGE_CALL_THRESHOLD_MM = 1.0`, ported verbatim from `score_hole`'s literal
`1.0` (target_cv.py:458), which the spike report calls "the surface-don't-
decide primitive" (§4.5) — not a scoring decision, a flag for the app to show
the user the call rather than silently resolve it.

### 4.3 `CALIBER_MM` preset table

Not an SHB table (the handbook does not tabulate bullet diameters); these are
standard ammunition bullet diameters, kept as data so the app offers a picker
instead of free-text mm entry.

| Key   | mm    | Source                                    |
| ----- | ----- | ----------------------------------------- |
| `.22` | 5.6   | `target_cv.py`'s `BULLET_MM` (".22 LR")   |
| `9mm` | 9.0   | 9×19mm Parabellum bullet diameter         |
| `.32` | 7.65  | .32 ACP / 7.65mm Browning bullet diameter |
| `.38` | 9.07  | .38 Special bullet diameter               |
| `.45` | 11.43 | .45 ACP bullet diameter                   |

### 4.4 Scenarios

Using `SPSF_PISTOL_25M_PRECISION` (X=25, 10=50, 9=100, 8=150, 7=200, 6=250,
5=300, 4=350, 3=400, 2=450, 1=500mm diameters) and caliber 5.6mm (`.22`)
unless stated. "Near edge" = `radiusMm − caliber/2`.

| #    | Given (center radius mm)                                                                                                                                                         | Then                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1  | radius 0 (dead center)                                                                                                                                                           | ringLabel `X`, value 10, isInnerTen true, marginMm = 12.5                                                                                                               |
| SC2  | radius exactly 15.3mm → near edge 15.3−2.8=12.5 = X radius exactly                                                                                                               | ringLabel `X` (tangent counts to the higher value — the spike's own worked example, cv-spike-report.md §4.5)                                                            |
| SC3  | radius 15.31mm → near edge 12.51mm, just past X's 12.5mm radius                                                                                                                  | ringLabel `10` (one hundredth of a mm the other way flips it — proves the boundary is a `<=`, not fuzzy)                                                                |
| SC4  | radius far outside ring 1 (e.g. 400mm)                                                                                                                                           | ringLabel `0`, value 0, isInnerTen false, edgeCall false, marginMm = distance past ring 1's 250mm radius                                                                |
| SC5  | near edge exactly on ring 1's outer boundary (250mm)                                                                                                                             | ringLabel `1` (last ring still applies the same tangent rule, not a special "miss the paper" case)                                                                      |
| SC6  | near edge 0.4mm inside a ring boundary (margin 0.4)                                                                                                                              | `edgeCall: true`                                                                                                                                                        |
| SC7  | near edge 1.0mm inside exactly (margin exactly 1.0)                                                                                                                              | `edgeCall: false` (threshold is `<`, not `<=` — ported verbatim from `margin_mm < 1.0`)                                                                                 |
| SC8  | near edge 1.01mm inside                                                                                                                                                          | `edgeCall: false`                                                                                                                                                       |
| SC9  | a scored `0` (miss) whose near edge is 0.3mm past ring 1                                                                                                                         | `edgeCall: false` regardless of margin — misses never raise an edge call (ported from `score_hole`'s `if h.score != "0"` gate, target_cv.py:458)                        |
| SC10 | **tangent flip points at every ring boundary** — for each of the 11 precision rings and the X ring, a hole whose near edge sits exactly on that ring's radius vs. 0.01mm past it | scores the higher ring exactly at the boundary, the lower ring 0.01mm past, for **every** boundary (X/10, 10/9, ..., 2/1, 1/miss) — table-driven over all 11 boundaries |
| SC11 | milsnabb face, same near-edge logic                                                                                                                                              | identical rule, different diameters (50,100,180,260,340,420,500) — one representative boundary (X/10) plus the outermost (5/miss)                                       |
| SC12 | `caliberMm <= 0`                                                                                                                                                                 | throws `RangeError`                                                                                                                                                     |
| SC13 | a `TargetFaceDefinition` with an empty `rings` array                                                                                                                             | throws `RangeError` (defensive; never reachable via the shipped data, covered for completeness against a malformed caller)                                              |

### 4.5 Properties (fast-check)

- **SP-P1 Monotonicity.** For a fixed caliber and target, `scoreHole`'s
  `value` is non-increasing as the hole's center radius increases from 0 to
  beyond the outermost ring. (Scoring never "improves" by moving the shot
  farther from center — the core sanity property of a ring target.)
- **SP-P2** `marginMm >= 0` always.
- **SP-P3** `edgeCall === true` implies the hole scored (not a miss) and
  `marginMm < 1`.

## 5. `session.ts` — bridge into the entry/score model

Bridges `Hole[]` (photo-marked holes) into `EntryShot[]`
(`shared/src/scoring/entry.ts`'s existing storage: `{valueTenths, isInnerTen}`,
range 0-109, integer arithmetic — CLAUDE.md N3). Photo scoring only ever
produces **integer-mode** shots (a ring value has no decimal component to
capture from a hole position), so `valueTenths = value * 10` exactly, no
tenths precision lost.

```ts
function scoreResultToEntryShot(result: ScoreResult): EntryShot;
function scoreSeries(holes: readonly Hole[], target: TargetFaceDefinition): readonly ScoreResult[];
function seriesToEntryShots(
  holes: readonly Hole[],
  target: TargetFaceDefinition,
): readonly EntryShot[];
function seriesNeedsReview(results: readonly ScoreResult[]): boolean; // any edgeCall — surfaces the spike's "don't silently decide" recommendation (§4.5/§5) to the app layer
```

| #   | Given                                                               | Then                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SE1 | a `ScoreResult` value 7, isInnerTen false                           | `{valueTenths: 70, isInnerTen: false}`                                                                                                                                                         |
| SE2 | a `ScoreResult` value 10, isInnerTen true (X)                       | `{valueTenths: 100, isInnerTen: true}` — matches `entry.ts`'s own `X` semantics (A2.1: `is_inner_ten` = centrumtia)                                                                            |
| SE3 | a miss (`value: 0`)                                                 | `{valueTenths: 0, isInnerTen: false}`                                                                                                                                                          |
| SE4 | `scoreSeries([5 holes], target)`                                    | 5 `ScoreResult`s, same order as input                                                                                                                                                          |
| SE5 | `seriesToEntryShots`                                                | every output satisfies `entry.ts`'s own constructor invariant (`0 <= valueTenths <= 109`, integer) — cross-module regression: seed a `createKeypadState` with the result and it does not throw |
| SE6 | `seriesNeedsReview([])`                                             | `false`                                                                                                                                                                                        |
| SE7 | `seriesNeedsReview` with one `edgeCall: true` among several `false` | `true`                                                                                                                                                                                         |
| SE8 | `seriesNeedsReview` with no edge calls                              | `false`                                                                                                                                                                                        |

## 6. Fixtures — what could and could not be ported numerically

- **Ported (derivable from SHB, not photo-dependent):** all ring diameters
  (§3), the exact SHB citation text and page numbers, the edge-touch
  worked example from cv-spike-report.md §4.5 ("hole center at 15.30mm scores
  X, at 15.31mm scores 10" — used verbatim as SC2/SC3), the 1.0mm edge-call
  threshold, the `BULLET_MM = 5.6` caliber constant.
- **Not extractable:** the spike's raw `EllipseFit` parameters (pixel
  coordinates from the 5 corpus photos) are not in `cv-spike-report.md` — only
  derived residuals are (§3's ring-residual table, ±0.6mm). The corpus photos
  themselves are explicitly kept out of the repo (personal photos, per the
  report's §1). GB1-GB3 and the geometry properties therefore use
  **constructed** ellipse fixtures (synthetic, round numbers) rather than
  extracted ones — this is stated here rather than left implicit, per
  old-coder's "no undisclosed deviation" rule. The ±0.6mm residual tolerance
  from the spike's real-photo measurement is carried forward qualitatively as
  the rationale for the 1mm `edgeCall` threshold being a conservative
  superset of the measured error, not as a numeric test input (there is
  nothing to assert it against without the photos).
- **Ported exactly:** `PRECISION_RINGS`/`MILSNABB_RINGS`/`TARGETS` (target_cv.py
  lines 24-40) cross-checked 1:1 against `targets.ts` (§3 table) and against
  `docs/reference/spsf-shb-2026.md`'s own ring table — all three agree.

## 7. Negative constraints

- **N1** `shared/` stays free of React Native and OpenCV imports (CLAUDE.md
  §"Hard rules" analog for this module — the whole point of the native/JS
  split in §1).
- **N2** No image-processing math (ellipse _fitting_ from pixels, blob
  detection, thresholding) is implemented here — only the math that consumes
  an already-fitted ellipse and already-marked hole coordinates, per the task
  boundary.
- **N3** `seriesToEntryShots`'s output never violates `entry.ts`'s own
  `valueTenths` range invariant (0-109) — cross-checked directly (SE5), not
  just asserted independently.
- **N4** The 312 pre-existing vitest tests (feat/score-x-semantics baseline)
  keep passing unmodified; no existing public export's behavior changes.
- **N5** Coverage and Stryker thresholds for the new directory match the
  existing `shared/src/scoring` / `shared/src/disciplines` bar (100%
  lines/branches/functions/statements; Stryker break ≥ 95%), never lowered
  project-wide.
- **N6** Every SHB citation (ring diameters, F.6.10.1 wording) is checked
  against `docs/reference/spsf-shb-2026.md` verbatim, not re-derived from
  memory or from the Python spike alone.
