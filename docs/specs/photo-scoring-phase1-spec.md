# Photo scoring phase 1 — auto-geometry + tap-to-mark

> Executable specification for the v2 flagship feature.
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/photo-scoring-phase1-spec.md`
> Evidence report: `docs/specs/photo-scoring-phase1-evidence.md`.
> Branch: `feat/photo-scoring-phase1` (based on `feat/m7-release`, with
> `feat/target-scoring-math` merged in).
>
> **Approval status: NOT OBTAINED (autonomous run).** The maintainer set the
> scope but did not review this spec before implementation. EVIDENCE claims
> confidence accordingly.

## 0. Why this shape

The CV spike (`docs/specs/cv-spike-report.md`) answered the feasibility
question in two halves, and phase 1 is defined by that split:

- **Geometry works.** On the 38-photo corpus: 67 % full lock on the precision
  face, median ring residual **0.51 mm**, 17 of 18 locked photos within
  0.92 mm — inside the card's own ±0.2–2.0 mm print tolerance (§6.3).
- **Classical hole detection is a proven dead end.** Two independent rounds,
  on 5 and then 38 photos, moved recall by 0.0 points (36 % recall, 80 false
  positives). Every classical discriminator tried was too weak, inverted, or
  contingent on the backing (§6.4, §6.5).

So phase 1 ships the half that works and asks the user for the half that does
not: **auto-rectify the photo, draw the rings, let the user tap each hole**,
and score with the SHB edge rule. Phase 2 (a learned heatmap detector trained
on corrections) is out of scope here, as is the score-analysis heatmap screen.

Two further constraints come straight from the spike:

- **Precision face only** (`spsf-pistol-25m-precision`). `guess_kind` types
  the milsnabb face correctly on 2 of 10 photos (§6.2), and a misdetection
  makes the ring scale 2.5× wrong — worse than not offering the feature. The
  milsnabb face gets an explicit "not yet supported" message, not a silent
  wrong answer.
- **A validity gate is mandatory.** §6.3 records two photos that locked
  confidently onto sky and gravel behind the target and still reported
  plausible residuals. "The residual is not a validity check." §2 below is
  the separate signal that requirement demands.

## 1. Setup plan (what approving this authorizes)

### New runtime dependencies

| Package                      | Why                                                                                                                                                                                                                            | Notes                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-fast-opencv`   | Stages 1–3 of the geometry pipeline. Named in `docs/implementation-plan.md` §2 for this feature.                                                                                                                               | MIT, new-architecture only, prebuilt OpenCV binaries both platforms, **no Expo config plugin** — works under prebuild/dev-client/EAS, not Expo Go. iOS ships OpenCV 4.9.0, Android 4.12.0 (different versions per platform — the CLAUDE.md iOS rule means both need testing).                                    |
| `expo-image-manipulator`     | The 2048 px resize, and the full-resolution re-crop for the mark loupe. Load-bearing for memory, not just speed: fast-opencv has no `imread`, pixels arrive as base64, and a 4000 px JPEG is a ~5.5 MB JS string (spike §4.6). | Expo-managed, config plugin not required.                                                                                                                                                                                                                                                                        |
| `react-native-vision-camera` | The camera capture path, per implementation-plan §2.                                                                                                                                                                           | **Companion deps flagged**: needs `react-native-worklets-core` for frame processors (NOT needed here — we only take stills, so it is omitted) and a config plugin entry with camera permission strings. Already-present `react-native-reanimated` 4.5.1 + `react-native-worklets` 0.10.1 cover the worklet side. |

No new dev dependency. `fast-check`, `vitest` and `@stryker-mutator/*` are
already in the root `devDependencies`.

### Files added, by path

```
shared/src/scoring/group.ts                     (+ .test.ts, + .property.test.ts)
app/src/db/migrations/0002_*.sql                (+ journal + snapshot + migrations.js entry)
app/src/db/queries/shot-marks.ts                (+ .test.ts)
app/src/features/photo-scoring/caliber.ts       (+ .test.ts)
app/src/features/photo-scoring/marks.ts         (+ .test.ts)
app/src/features/photo-scoring/validity.ts      (+ .test.ts)
app/src/features/photo-scoring/corners.ts       (+ .test.ts)
app/src/features/photo-scoring/capture.ts
app/src/features/photo-scoring/opencv.ts
app/src/features/photo-scoring/detect.ts
app/src/components/target-face.tsx
app/src/components/group-plot.tsx
app/src/app/session/[id]/scan.tsx
docs/specs/photo-scoring-phase1-spec.md         (this file)
docs/specs/photo-scoring-phase1-evidence.md
spike/cv/validity_gate.py                       (gate calibration harness)
```

Modified: `app/src/db/schema.ts` (one new table), `app/src/app/_layout.tsx`
(one `Stack.Screen`), `app/src/app/session/[id]/index.tsx` (Group view +
Scan entry point), `app/src/i18n/{en,sv}.json` (new `photoScoring`
namespace, appended at end of file to minimise collision with the vault
agent's concurrent edit), `app/package.json`, `app/app.json`,
`docs/implementation-plan.md`.

### Git

Conventional Commits, every commit `-s` (DCO), explicit paths staged, branch
pushed, **no PR opened**, `main` never touched. Photos are personal and are
**never** committed.

## 2. The validity gate — the load-bearing new decision

### 2.1 Why a gate, and what it is not

Stage 3's refinement objective maximises a radial edge profile against the
known ring radii. It finds _some_ edge near each nominal radius on almost any
textured surface, so a high objective value is not evidence that the rings
were found — this is exactly how `20250906_104730` came to draw a target on a
treeline. The gate is therefore **four independent checks, all of which must
pass**, of which only one is the profile score.

### 2.2 The metrics

Computed by `app/src/features/photo-scoring/validity.ts`, a pure function
over numbers the native layer supplies (so it is unit-testable with no
OpenCV):

| Metric             | Definition                                                                            | Rejects                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axisRatio`        | fitted black-zone ellipse `majorAxis / minorAxis`                                     | a "black zone" that is a treeline or a frame-edge sliver, and perspective beyond what weak-perspective rectification can undo                                   |
| `zoneFraction`     | ellipse `majorAxis / max(imageWidth, imageHeight)`                                    | a blob far too small to be the subject, and a black zone filling the frame (Otsu then had no paper/black boundary — spike §6.3 failure 2)                       |
| `centerInFrame`    | ellipse centre inside the image bounds                                                | extreme crops where the fit put the centre outside the target                                                                                                   |
| `zoneContrastGrey` | mean grey of the **annulus at 1.15–1.40 r** minus mean grey of the **disc at 0.70 r** | the decisive one. A precision face is a solid black disc on light card, so this is a large positive step. Gravel, sky and a milsnabb annulus have no such step. |
| `profileScore`     | stage-3 objective **normalised by the profile's own median absolute deviation**       | a flat, structureless radial profile. Normalisation matters: the raw objective tracks photo contrast and is useless as an absolute threshold.                   |

### 2.3 Thresholds, and where they come from

```
axisRatio      <= 2.0
0.10 <= zoneFraction <= 0.95
centerInFrame == true
zoneContrastGrey >= 50
profileScore     >= 20
```

These are **measured, not chosen by taste**. `spike/cv/validity_gate.py`
computes all five on the real 38-photo corpus at the shipped 2048 px input;
the numbers and the resulting accept/reject split are in the evidence report.
`zoneContrastGrey` separates the corpus with a wide empty gap (17.7 → 84.2),
and 50 sits inside it.

### 2.4 Acceptance criteria

| #   | Given                                                 | Then                                                                                                                                                                  |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | all five metrics inside their thresholds              | `{ valid: true, reasons: [] }`                                                                                                                                        |
| V2  | `axisRatio` 2.01                                      | invalid, reasons include `'axisRatio'`                                                                                                                                |
| V3  | `zoneFraction` 0.09, and separately 0.96              | invalid, reasons include `'zoneFraction'` (both ends of the band are enforced)                                                                                        |
| V4  | `centerInFrame` false                                 | invalid, reasons include `'centerInFrame'`                                                                                                                            |
| V5  | `zoneContrastGrey` 49.9                               | invalid, reasons include `'zoneContrast'`                                                                                                                             |
| V6  | `profileScore` 19.9                                   | invalid, reasons include `'profileScore'`                                                                                                                             |
| V7  | several metrics out of range at once                  | `reasons` lists **every** failing metric, in a stable declared order — the UI explains what went wrong, so a gate that stops at the first failure would hide the rest |
| V8  | exactly-on-threshold values (2.0, 0.10, 0.95, 50, 20) | valid — thresholds are inclusive bounds                                                                                                                               |
| V9  | a NaN in any metric                                   | invalid, reason for that metric (a NaN must never compare its way to `valid`)                                                                                         |

### 2.5 What happens on failure

No silent degradation and no rings drawn on gravel. The scan screen shows
"couldn't lock the target" with two ways forward:

1. **Retake** — back to capture.
2. **Adjust corners** — the manual fallback: four draggable corner handles
   over the photo, mapped to the four extreme points of the outermost ring
   (ring 1, 500 mm). `corners.ts` solves the 4-point homography, and the flow
   proceeds to marking with that transform instead of the fitted one. This is
   a full projective mapping, so it also covers the moderate-perspective
   photos the weak-perspective conic rectification cannot.

## 3. `shared/src/scoring/group.ts` — group analytics (old-coder, Tier 2)

New shared logic, so it runs the evidence-first loop. Tier 2: it is
_analytics_, not scoring — a wrong mean radius misinforms, it does not corrupt
märke/standardmedalj/compliance data the way a wrong ring value would. Full
loop plus property tests; no failure-model section.

### 3.1 API

```ts
interface GroupPoint {
  readonly xMm: number;
  readonly yMm: number;
}

interface GroupAnalysis {
  readonly shotCount: number;
  readonly mpiMm: GroupPoint; // mean point of impact, input convention
  readonly windageMm: number; // mpi.x; positive = right of centre
  readonly elevationMm: number; // -mpi.y; positive = above centre
  readonly meanRadiusMm: number; // mean distance from the MPI
  readonly extremeSpreadMm: number; // largest distance between any two shots
}

function analyzeGroup(points: readonly GroupPoint[]): GroupAnalysis | null;
```

**Coordinate convention.** Input is target-mm in the same convention as
`imageToTargetMm` and `scoreHole`: origin at the target centre, **y
increasing downward** (image convention). `windageMm` passes `x` through;
`elevationMm` **negates `y`** so that positive means "above centre", which is
what the shooter reads as elevation. This sign flip is the one trap in the
module and is asserted directly (GR6).

### 3.2 Acceptance criteria

| #    | Given                                                 | Then                                                                                                                     |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GR1  | `[]`                                                  | returns `null` (no group exists; the caller hides the view)                                                              |
| GR2  | one shot at `(3, -4)`                                 | `mpi = (3,-4)`, `windage = 3`, `elevation = 4`, `meanRadius = 0`, `extremeSpread = 0`, `shotCount = 1`                   |
| GR3  | four shots symmetric about the origin                 | `mpi = (0,0)`, `windage = 0`, `elevation = 0`                                                                            |
| GR4  | four shots at distance 10 on the axes from the origin | `meanRadius = 10`, `extremeSpread = 20`                                                                                  |
| GR5  | three collinear shots at x = 0, 10, 30                | `extremeSpread = 30` (max **pairwise**, not max-from-MPI); `mpi.x = 40/3`; `meanRadius = (40/3 + 10/3 + 50/3)/3 = 100/9` |
| GR6  | one shot at `(0, -5)` (above centre in y-down)        | `elevationMm = +5` — the sign flip, asserted alone                                                                       |
| GR7  | one shot at `(7, 0)`                                  | `windageMm = +7`                                                                                                         |
| GR8  | five identical shots                                  | `meanRadius = 0`, `extremeSpread = 0`, `shotCount = 5` (degenerate group is legal, not an error)                         |
| GR9  | any input                                             | `shotCount === points.length`                                                                                            |
| GR10 | a non-finite coordinate                               | throws `RangeError` — a NaN silently poisoning every statistic is the failure mode worth a guard                         |

### 3.3 Properties (fast-check)

| #   | Property                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GP1 | **Translation**: translating every shot by `(dx, dy)` shifts `mpi` by `(dx, dy)` and leaves `meanRadius` and `extremeSpread` unchanged                              |
| GP2 | **Rotation**: rotating every shot about the origin leaves `meanRadius` and `extremeSpread` unchanged                                                                |
| GP3 | **Scale**: scaling every shot by `k > 0` scales `meanRadius` and `extremeSpread` by `k`                                                                             |
| GP4 | **Ordering**: the result is invariant under permutation of the input                                                                                                |
| GP5 | **Bound**: `meanRadiusMm <= extremeSpreadMm` for any non-empty input (the MPI lies in the convex hull, so no shot is further from it than the group's own diameter) |

### 3.4 Negative constraints

- No new dependency.
- No change to any existing exported signature in `shared/`.
- `shared/src/index.ts` gains exactly one barrel line.
- Existing `shared/` tests keep passing unchanged; `shared/src/scoring/**`
  is already inside the 100 %-coverage and Stryker `mutate` globs, so
  `group.ts` is automatically subject to both — no config change, and no
  opportunity to quietly exclude it.

## 4. Persistence — `shot_marks`

A mark is _where the user tapped_, in target-mm. The score derived from it
already has a home (`shots.value_tenths`), so the table stores the geometry,
not the score — re-scoring an existing photo must never need the photo again.

```
shot_marks   shot_id TEXT NOT NULL,      -- FK shots.id, one mark per shot
             x_mm REAL NOT NULL,         -- target-mm, origin = target centre
             y_mm REAL NOT NULL,         -- y increases DOWNWARD (image convention)
             caliber_mm REAL NOT NULL    -- the disc diameter used to score it
             + the standard id / created_at / updated_at / deleted_at columns
```

- Migration `0002_*.sql`, generated by drizzle-kit. **Prior migrations are
  never edited**; `meta/_journal.json` and `migrations.js` gain one entry each.
- Soft-delete like every other table; all reads filter `deleted_at IS NULL`.
- `caliber_mm` is denormalised on purpose: the firearm's caliber can be edited
  later, and that must not silently re-score a shot recorded months ago.
- **Shots are still written through the existing entry model** —
  `saveSeriesShots` from `app/src/db/queries/round-count.ts`, so the firearm
  round counters stay correct. Photo scoring produces integer-mode shots only
  (`valueTenths = value * 10`), via `seriesToEntryShots`.
- **`is_inner_ten` is NOT inferred from the tap.** A tap cannot know
  centrumtia: X is a _called_ distinction the shooter makes, and the X ring on
  the precision face is 25 mm — the same order as the gate's own error budget.
  X stays a per-shot toggle in the mark UI, defaulting off, exactly as
  `ScoreKeypad` treats it.
- `series.photo_uri` keeps its current meaning and write path
  (`updateSeries`), unchanged.

## 5. Capture and the geometry pipeline

### 5.1 Capture

Camera (`react-native-vision-camera`) or library (the existing
`pickSeriesPhoto`). Both paths then:

1. Keep the **full-resolution** URI in memory for the mark loupe. The spike's
   recommendation is explicit: re-crop the loupe from full resolution rather
   than raising the global resize (§4.4).
2. Produce a **2048 px long-side** copy via `expo-image-manipulator` for
   geometry. 2048 is validated for geometry — identical ring residuals at 2048
   and 4000 (§3, §4.4) — and 1024 is definitively too low.
3. Base64-encode the 2048 px copy for `Mat.createFromBase64()`. There is no
   `imread` from a path in fast-opencv.

### 5.2 Stages (ported from `spike/cv/target_cv.py`)

| Stage           | Ops                                                                                                                                                                                                                                  | Where                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1 Find the face | `cvtColor` → `GaussianBlur(7)` → `GaussianBlur(31)` → `threshold(OTSU\|BINARY_INV)` → `morphologyEx` OPEN+CLOSE (9×9) → `findContours` → largest by `contourArea` → `fitEllipse`                                                     | native                                                                 |
| 1b Ray re-fit   | 360 rays from the fitted centre over the filled mask, dropping any ray that leaves the frame; re-`fitEllipse` on the surviving boundary points                                                                                       | mask pulled once via `toBuffer()`, ray walk in JS, `fitEllipse` native |
| 2 Rectify       | `buildRectification(ellipse, 200)` from `shared/target-scoring`, composed with the 4 px/mm canvas offset into a 3×3 `H`; `warpPerspective` to a ~1040 px canvas                                                                      | shared math + native warp                                              |
| 3 Refine        | `coarseToFineRefine` drives the search; each `(dx, dy)` gets one `warpPolar` on the **small rectified canvas**, reduced to a 1-D profile and high-passed in JS; `scoreRadialProfile(profile, 4 * scale, ringRadii)` is the objective | shared math driving native sampling                                    |
| 4 Gate          | §2                                                                                                                                                                                                                                   | pure TS                                                                |

`fitEllipseDirect` is **missing upstream** in `react-native-fast-opencv` and
is not patched in for phase 1 (that would mean carrying a fork). Plain
`fitEllipse` plus the stage-3 refinement is the maintainer-set approach; the
spike's own §3 note is that stage 3 rescued a badly clipped stage-1 fit
(fitted aspect 1.49) to a 0.55 mm residual, and the gate now catches the cases
where it does not.

**Cost control**: the profile depends only on `(dx, dy)`, and `scale` only
rescales the radius lookup — so the profile is memoised per `(dx, dy)`,
exactly as the spike's loop nesting does. That is ~150 `warpPolar` calls on a
1040 px canvas, not on the 2048 px photo.

## 6. Tap-to-mark screen

TargetScan Preview parity, minus auto-detect.

- The photo, with the **rectified ring overlay** drawn on it via the inverse
  transform (`targetMmToImage`), so the rings sit where the geometry says they
  are and the user can see whether the lock is good before trusting it.
- **Tap places a marker** sized to the caliber: `caliberMm` resolved from the
  session's firearm, else its ammo lot, else a picker over `CALIBER_MM`
  (`.22` 5.6, `9mm` 9.0, `.32` 7.65, `.38` 9.07, `.45` 11.43). `.22` is the
  fallback default — it is `BULLET_MM` in the spike and the only caliber the
  corpus contains.
- **Tap a marker** → Move / Delete. Move opens a **magnifier loupe** re-cropped
  from the full-resolution image, with fine drag; the marker follows the drag,
  and the score line updates live.
- **Live score line**: `total-Nx (decimal)` shape from the benchmark, plus
  per-shot values sorted descending. Decimal in parentheses only when the
  session is in decimal mode — photo scoring itself is integer-only (§4), so
  in practice it is omitted.
- **Edge calls**: `scoreHole` already returns `edgeCall` when the near edge is
  within 1 mm of the deciding ring. Such a marker renders distinctly (a ring
  around it) and exposes a tappable **"your call"** toggle between the two
  candidate values. The scoring layer never silently resolves a tangent case —
  spike §4.5: _surface the judgement call to the user rather than deciding it_.
- **Series length cap** from the program (`shotsPerSeries ?? defaultSeriesLength
?? 5`); further taps are refused with a message rather than silently ignored.
- **Retake** / **Scan next** (next series in the same session).

`marks.ts` holds this as a pure reducer over `{ marks, selectedId,
edgeCallOverrides }` so the interaction rules are unit-testable without a
renderer.

## 7. Session plot + group view

TargetScan screen 2 parity, on a **clean vector target** — not the photo.

- `app/src/components/target-face.tsx` renders any `TargetFaceDefinition` as
  `react-native-svg` from its ring diameters (no bitmap asset, so it is
  correct by construction for whichever face it is given).
- `app/src/components/group-plot.tsx` overlays the marks, the MPI, and the
  **mean-radius circle** (the red circle in the benchmark).
- Windage / elevation / mean radius / max spread come from `analyzeGroup`.
- The **per-ring histogram** reuses the existing M5
  `distribution-bar-chart.tsx` rather than a second implementation.
- The Group view is shown **only for sessions/series that have marks**, and is
  hidden otherwise — no empty chrome for the 100 % of existing sessions that
  predate the feature.

## 8. Out of scope, explicitly

- The Score-Analysis heatmap (benchmark screenshot 3) — phase 2.
- Any hole _detection_. Every mark in phase 1 is a user tap.
- The milsnabb face and every non-precision face: friendly
  "not yet supported yet" message, never a guess.
- The opt-in corrections corpus / photo upload (spike §4.6 privacy note) —
  that is a separate, explicit, off-by-default feature and is not built here.
- iOS verification. Both platforms are _supported_ (no Android-only module),
  but this branch is verified on the Android emulator only; the per-platform
  OpenCV version difference (4.9.0 vs 4.12.0) is recorded as an untested risk.

## 9. "Points lost" card (`feat/polish-1` mini-spec, old-coder Tier 2)

Left out of phase 1 (§8 didn't call it out by name, but §7 only shipped
windage/elevation/mean-radius/max-spread). TargetScan's "points lost"
breaks a group's total shortfall from a perfect score into the part a
shooter can fix by correcting their aim (**position**) and the part that is
just how tight the group is (**size**). Same tier as `analyzeGroup` — it is
diagnostic, not the shot-of-record score in `shots.value_tenths` — so no
failure-model section, but full unit + property coverage since it is new
shared logic.

### 9.1 Definitions

For a scored group of _n_ marks against target face `T`:

- **actual** = Σ `scoreHole(mark, T).value` over the marks, at their real
  positions.
- **recentered** = Σ `scoreHole(mark shifted by −MPI, T).value` — the same
  group shape, translated so its own mean point of impact sits on the
  target center. This is the group's _potential_ score: the best this
  particular pattern of holes can score, simply by centering it (not a
  search over every possible translation — see 9.4).
- **max** = _n_ × (target's highest ring value) — the score if every shot
  had landed dead center.
- **points lost to position** = `recentered − actual` (recoverable, in
  principle, by aiming at a corrected point of aim). **Can be negative** —
  recentering shifts every mark by the same vector, so a called flier far
  from an otherwise-tight cluster drags the MPI toward itself and can pull
  the _other_ marks off their rings more than it gains back on itself (a
  worked counterexample lives in the test suite: two marks dead center and
  one 300mm out scores 20 actual but only 17 recentered on the precision
  face). This is a real property of "recenter on the MPI", not a bug — see
  9.4 — so the UI clamps the displayed figure at 0 rather than showing a
  negative "points lost".
- **points lost to size** = `max − recentered` (inherent to the group's own
  spread; always ≥ 0, since no individual mark's score exceeds the target's
  highest ring value regardless of where the group is centered).

### 9.2 API

```ts
interface PointsLostMark {
  readonly xMm: number;
  readonly yMm: number;
  readonly caliberMm: number;
}

interface PointsLostAnalysis {
  readonly actualScore: number;
  readonly recenteredScore: number;
  readonly maxScore: number;
  readonly pointsLostToPosition: number;
  readonly pointsLostToSize: number;
}

function analyzePointsLost(
  marks: readonly PointsLostMark[],
  target: TargetFaceDefinition,
): PointsLostAnalysis | null;
```

Lives in `shared/src/scoring/group.ts` next to `analyzeGroup` (reuses its
MPI math) and calls `scoreHole` from `shared/src/target-scoring/score.ts` —
no new dependency, no schema/persistence change; it is derived purely from
`shot_marks` rows already on disk.

### 9.3 Acceptance criteria

| #   | Given                                                                 | Then                                                                                                                                                                        |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PL1 | `[]`                                                                  | returns `null` (mirrors `analyzeGroup`'s empty-group handling)                                                                                                              |
| PL2 | one mark dead center (X ring)                                         | `actual = recentered = max = 10`, both points-lost = 0                                                                                                                      |
| PL3 | one mark anywhere (single-shot group)                                 | recentering a 1-point group always puts it exactly on center, so `recentered = max`; points-lost-to-size = 0, all shortfall is points-lost-to-position                      |
| PL4 | a group whose MPI is already at target center                         | `recentered = actual`; points-lost-to-position = 0                                                                                                                          |
| PL5 | a tight group (small spread) placed off-center                        | most of the loss is points-lost-to-position, little to size                                                                                                                 |
| PL6 | a loose group (large spread) placed exactly on center                 | points-lost-to-position = 0, all loss is points-lost-to-size                                                                                                                |
| PL7 | any group                                                             | `pointsLostToSize >= 0` (9.1); `pointsLostToPosition` is signed — see PL9                                                                                                   |
| PL8 | any group                                                             | `actualScore + pointsLostToPosition + pointsLostToSize === maxScore` (holds by construction: it's `actual + (recentered - actual) + (max - recentered)`)                    |
| PL9 | two marks dead center, one 300 mm out (precision face, `.22` caliber) | `actualScore = 20`, `recenteredScore = 17`, `pointsLostToPosition = -3` — the called-flier counterexample from 9.1, confirming the function reports it rather than clamping |

### 9.4 Simplification called out explicitly

"Centered optimally" in the product framing (potential score) is
implemented here as "centered on this group's own MPI", **not** as a
search over every possible translation for the true score-maximizing
center. The MPI minimizes the sum of _squared_ distances to the group
(the standard mean-minimizes-variance result), but ring scoring is a
decreasing step function of plain distance, not squared distance, and
PL9 (9.3) is a concrete case where MPI-recentering is not even better
than doing nothing: a called flier pulls the MPI toward itself and away
from a tight cluster, dragging the cluster's marks down more than the
flier itself gains. So `recenteredScore` is a reasonable, cheap
approximation of "potential", not a proven maximum, and
`pointsLostToPosition` can legitimately be negative — 9.1 documents the
UI's response (clamp the display at 0). A true optimum would need a
search over candidate centers (e.g. the MPI of the group with its worst
outlier dropped, or a local search) — out of scope here; flag as a
follow-up if a maintainer wants the tighter definition.

### 9.5 UI

`app/src/app/session/[id]/index.tsx`'s Group view (§7) gains a "points
lost" card, shown alongside the existing windage/elevation/mean-radius/
max-spread tiles whenever `analyzePointsLost` returns non-null (i.e.
whenever the Group view itself is shown, since both derive from the same
marks + target). Three values: points lost to position, points lost to
size, and the potential (recentered) score — all reusing `StatTile`.
