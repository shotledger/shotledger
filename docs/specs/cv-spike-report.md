# CV spike — photo target scoring (v2)

> **2026-10-03:** the Python in `spike/cv/` is retired; the CV tools are TypeScript in [`tools/cv/`](../../tools/cv/README.md) ([ADR 0018](../adr/0018-cv-tools-in-typescript.md)). The record below is as written.

**Branch:** `spike/cv-target-scoring` · **Prototype:** `spike/cv/` (retired)
· **Date:** 2026-09-01 · **Status:** spike complete, findings only — nothing
merged into the app.

**Question:** can we reliably detect a Swedish precision target in a real
phone photo, deskew it, and find the bullet holes well enough to score a
series — with drag-to-correct as the safety net?

**Answer:** geometry yes, holes no. Target location and ring geometry came
out better than the bar (sub-millimeter ring alignment on both usable
precision photos). Hole detection did not: **5 of 21 visible holes found,
with 16 false positives**, and classical CV kept confusing a printed ring
digit with a bullet hole. A small learned hole detector is the missing
piece; the classical stage should be kept for everything around it.

> **Sections 1–5 are the 5-photo run.** [§6](#6-corpus-v2--38-photos) re-runs
> the same pipeline over 38 photos and supersedes every number below. The
> conclusion is unchanged; the evidence for it is much stronger.

---

## 1. Photo corpus

23 camera-roll candidates were matched by range-session date and reviewed
one by one.

| Class                                              | Count |
| -------------------------------------------------- | ----- |
| Shooting targets, usable for the spike             | 5     |
| Not a target (ignored — not copied, not processed) | 18    |

The 5 targets are two different SHB target faces, which was not planned for
and turned out to matter:

| Photo                 | Face                   | Framing                               |
| --------------------- | ---------------------- | ------------------------------------- |
| `20251025_105532.jpg` | 25 m precision (F.7.1) | whole card, slight tilt, indoor       |
| `20260816_114337.jpg` | 25 m precision (F.7.1) | close crop, black zone cut left+right |
| `20260726_145316.jpg` | milsnabb (J.7.1)       | whole face, outdoors, heavily pasted  |
| `20260726_150229.jpg` | milsnabb (J.7.1)       | extreme close crop, center off-frame  |
| `20260726_153751.jpg` | milsnabb (J.7.1)       | whole face, outdoors, heavily pasted  |

Two things about this corpus are worth stating up front, because they set a
ceiling on what the numbers below can mean:

- **Only two photos are of the target this feature is for.** Three are the
  milsnabb face, shot with large caliber, and all three are club targets
  carrying _hundreds_ of repair patches. Those patches are the dominant
  visual feature and are individually the size and shape of a hole.
- **Most shots on the precision photos are already pasted over**, so
  "visually countable holes" means _fresh, unpasted_ holes only. That is
  4–5 per photo, not a full 5-shot series ×5.

Annotated outputs and the raw CSVs stay in `~/tmp/shotledger-cv-spike/out/`
(`<name>_annot_<longside>.jpg`, `results_<longside>.csv`). Photos are
personal and are deliberately not in the repo.

---

## 2. Pipeline

Python + OpenCV, five separable stages so a failure can be attributed to
one of them. Full description in `spike/cv/README.md` (retired).

1. **Find the face.** Otsu on a heavily blurred gray copy; largest dark blob
   is the printed black zone. `fitEllipseDirect` on its contour (much better
   than `fitEllipse` on partial arcs), then an iterative re-fit from ray
   casts that discard any ray leaving the frame — so a cropped card does not
   drag the fit.
2. **Identify the face.** Solid black disc → precision (black = 200 mm);
   black annulus round a lighter middle → milsnabb (black = 500 mm).
3. **Deskew.** The fitted ellipse is mapped back to a circle. A single conic
   does _not_ determine a homography, so this undoes rotation and
   anisotropic scale only — weak perspective. Output is a fixed 4 px/mm
   canvas, i.e. the working resolution is decoupled from the input photo.
4. **Refine geometry.** Coarse-to-fine grid search over (dx, dy, scale)
   maximizing a radial edge profile against the known ring radii. This is
   the load-bearing stage: it is what produces the sub-millimeter result,
   and it rescues geometry when stage 1 was clipped.
5. **Find and score holes.** Over-sized top-hat for bright tears on black,
   black-hat for dark holes on paper, then a filter cascade. Scoring applies
   SHB F.6.10.1 by comparing the hole's _inner_ edge (center radius minus
   2.8 mm) to each ring, so a hole tangenting a ring takes the higher value.

---

## 3. Results

At the planned 2048 px input downscale, auto target-type detection:

| Photo             | Face      | Fresh holes visible | Detected | True pos. | False pos. | Pipeline score       | My visual score       |
| ----------------- | --------- | ------------------- | -------- | --------- | ---------- | -------------------- | --------------------- |
| `20251025_105532` | precision | 5                   | 3        | 3         | 0          | `X X X` = 30         | `X X 10 10 10` = 50   |
| `20260816_114337` | precision | 5                   | 4        | 2         | 2          | `10 10 8 6` = 34     | `10 10 10 10 10` = 50 |
| `20260726_145316` | milsnabb  | 5                   | 7        | 0         | 7          | `8 8 7 7 7 6 5` = 48 | —                     |
| `20260726_150229` | milsnabb  | 3                   | 6        | 0         | 6          | `6 5 5 5 5 5` = 31   | —                     |
| `20260726_153751` | milsnabb  | 3                   | 1        | 0         | 1          | `8` = 8              | —                     |
| **Total**         |           | **21**              | **21**   | **5**     | **16**     |                      |                       |

- **Recall 24 %** overall; **50 %** (5/10) on the two precision photos.
- **Precision 24 %** overall; **71 %** (5/7) on the two precision photos.
- No photo produced a correct series score. The best case
  (`20251025_105532`) found 3 of 5 holes and mis-scored one of them.
- Runtime is ~0.9–1.7 s per photo on a laptop, dominated by stage 4's grid
  search. Not optimized; not a concern at this stage.

### Geometry, measured separately

Geometry is the good news and deserves its own number. After stage 4, I
measured the residual between each drawn ring and the printed ring line it
should sit on (peak of the angular-mean radial edge profile):

| Photo                   | px/mm | Ring residuals (X, 10, 9, 8, 7)      |
| ----------------------- | ----- | ------------------------------------ |
| `20251025_105532` @2048 | 4.09  | −0.49, −0.49, −0.49, 0.00, +1.71 mm  |
| `20260816_114337` @2048 | 3.65  | −0.27, +0.55, +0.55, +0.55, 0.00 mm  |
| `20251025_105532` @4000 | 4.09  | −0.49, −0.49, −0.49, −0.24, +1.47 mm |
| `20260816_114337` @4000 | 3.65  | 0.00, −1.37, +0.55, 0.00, −0.55 mm   |

Inner rings land within **±0.6 mm**, which is inside the ±0.2–2.0 mm print
tolerance the SHB itself allows for the card. The ring-7 outlier on
`20251025_105532` (+1.7 mm) is the black zone's own printed edge, which is
softer than a ring line.

Two caveats, stated because they are easy to over-read:

- This residual is computed on the **angular mean**, so it proves the radial
  scale is right; it does not prove the deskew removed all ellipticity.
  Visual overlay inspection agrees at all angles on both photos, but that is
  eyeballing, not a measurement.
- On `20260816_114337` the black-zone fit itself was badly wrong (fitted
  axes 1101 × 1641 px — aspect 1.49 — because the card is cut off left and
  right). Stage 4 recovered it anyway. That is encouraging for robustness
  and alarming for how much weight one stage is carrying.

### Where it breaks — honestly

**Printed ring digits are the single worst false-positive source.** On the
precision face the ring numbers are knocked out of the black in the card's
own paper color, ~12–15 mm tall against a 5.6 mm hole. Everything obvious
failed:

- _Size_: only ~2.2× a hole. Too close to separate reliably.
- _Aspect / fill_: a top-hat with a kernel smaller than a glyph keeps only
  its strokes, which fragment into compact, hole-shaped blobs.
- _Solidity_: **backwards.** A bullet hole is a jagged star with low
  solidity; a printed glyph is smooth. Testing for compactness rejected the
  real holes and kept the digits.
- _Dark-core test_ ("a hole is a pit, a glyph is solid"): also backwards on
  these photos — the holes show bright backing board, no dark core at all.

What finally worked was **color**: a knocked-out digit is exactly the
card's own paper color (measured chroma R−B ≈ +15, saturation 24–31),
whereas a hole shows whatever is behind the card (here neutral white,
R−B ≈ 0, saturation 7). That is a real signal but it is **contingent on the
backing** — a target stapled to a cream board would break it, and I have no
photo to test that against. It is a fragile rule to ship.

Other confirmed failure modes:

- **Overlapping holes are counted as one.** The center cluster on
  `20251025_105532` is five shots in a ~30 mm group with tears running into
  each other; the detector returns three blobs. This is why its score came
  out `X X X` = 30 against a visual 50.
- **Holes clipping a ring line** merged with the line. Switching the size
  test from bounding box to largest-inscribed-disc (distance transform)
  fixed most of it, but a hole sitting _on_ a line is still recentered
  approximately — exactly the case where the edge-touch rule matters.
- **Repair patches are indistinguishable from holes** by any classical
  feature I tried. This alone sinks the three milsnabb photos: 14 of the 16
  false positives are patch edges. **Superseded 2026-09-11**: true of the
  _shape_ features tried here, not of classical features in general — local
  variance separates hole from patch at AUC 0.94 on a 147-photo corpus. See
  [`cv-corpus-validation-2026-09.md`](cv-corpus-validation-2026-09.md) §2.
- **Target-type detection is unreliable on cropped photos** — two of the
  three milsnabb photos were typed as `precision`, which makes the entire
  ring scale 2.5× wrong. Every hole then scores wrong even if found.
- **Extreme crops fail outright.** On `20260726_150229` the center is off
  frame and stage 1 has only one short arc; the fit put the center outside
  the target.
- **Holes in the light zone** were barely exercised (all fresh holes in the
  corpus are in the black). The black-hat path is effectively untested and
  its two firings were both false positives on printed black digits.
- Shadows and the card/background step produced false positives until an
  eroded card mask was added; that fix is a workaround, not a solution.

### Resolution

Input downscale of 1024 / 2048 / 4000 px long side, same pipeline:

| Photo             | 1024                | 2048            | 4000           |
| ----------------- | ------------------- | --------------- | -------------- |
| `20251025_105532` | `10 9 9 4` (4)      | `X X X` (3)     | `X X 10 5` (4) |
| `20260816_114337` | `10 9` (2)          | `10 10 8 6` (4) | `10 8 6` (3)   |
| `20260726_145316` | 19 detections       | 7               | 10             |
| `20260726_150229` | 3 (typed precision) | 6               | 2              |
| `20260726_153751` | 2 (typed milsnabb)  | 1               | 7              |

Runtime was **flat across all three** (~1 s), because stages 3–5 work on a
fixed 4 px/mm canvas — only the warp's input sampling changes.

Read this as noise, not a trend: the differences are single detections
flipping either side of a threshold, and target-type detection flips too.
The honest conclusions are narrower:

- **1024 px is too low.** At 1024 the black zone is ~500 px, giving ~2.5
  px/mm, so a 5.6 mm hole is ~14 px and the ring line is sub-pixel. Both
  precision photos lost holes and `20260726_145316` produced 19 false
  positives.
- **2048 px is enough for geometry** — the ring residuals are the same at
  2048 and 4000, so the deskew does not benefit from more pixels. **The
  2048 px resize plan is validated for geometry.**
- **2048 px is probably not enough for holes**, and this spike cannot prove
  it either way because the detector is the bottleneck, not the pixels. At
  2048 a hole is ~20 px across — thin for distinguishing a torn edge from a
  patch edge, and thin for a learned detector's input crop. I would keep
  2048 as the geometry input and **re-crop the hole regions from the full-
  resolution image** once geometry is known; that costs one extra decode and
  removes the question entirely.

---

## 4. Answers

### 4.1 Detection rate achieved

24 % recall / 24 % precision overall; 50 % recall / 71 % precision on the
two 25 m precision photos. Zero photos scored correctly end-to-end. Geometry
succeeded on 2 of 5 (both precision photos), failed on 3 of 5 (all
milsnabb, two from target-type misdetection and one from extreme crop).

This is well below the v1 bar of "scoring right except for genuine
edge-touch judgement calls". Drag-to-correct cannot rescue it: a user
correcting 16 false positives and adding 16 missed holes is doing the work
by hand with extra steps.

### 4.2 Where it breaks

In priority order: overlapping holes in a tight group (the normal case for a
good shooter, and the case where scoring matters most); printed ring digits;
repair patches; target-type identification on cropped photos; extreme crops
where the center is off-frame. Section 3 has the detail.

### 4.3 Classical CV, or a learned detector?

**Split the pipeline.** Classical CV is the right tool for stages 1–4 and
should be kept — locating the face, identifying it, deskewing, and locking
ring geometry to sub-millimeter all worked, on the harder-than-expected
photos, with no training data. That is the part I expected to be hard and it
is essentially solved.

**Stage 5 needs a learned detector.** The evidence is not "classical CV
scored poorly"; it is _why_ it scored poorly. Every classical discriminator
I tried was either too weak (size), actively inverted (solidity, dark core)
or contingent on something outside the target (backing color). A bullet
hole is defined by texture — torn fibers, a raised lip, a shadow — which is
what a small CNN learns easily and what morphology cannot express. The
distinction that must be learned is _hole vs. repair patch vs. printed
glyph_, and all three are the same size, shape class and often color.

Scope: a single-class detector on 64–96 px crops, or a small heatmap/center
regressor over the rectified canvas (which is why the fixed 4 px/mm canvas
is worth keeping — the model then sees holes at a _constant_ pixel size,
removing scale as a variable). Overlapping holes argue for a heatmap +
peak-finding formulation over box detection, since the useful output is a
count and centers, not boxes.

Training data is the real cost, and it is cheap here: a session's targets
photograph 20+ holes each, and the app can collect labelled examples from
drag-to-correct in normal use. **Recommend shipping the classical geometry
with fully manual hole marking first**, and using the corrections as the
training set for the detector. That also means v1 is honest about what it
does rather than shipping a 24 % detector behind a correction UI.

### 4.4 Resolution

2048 px validated for geometry (identical ring residuals at 2048 and 4000);
1024 px is definitively too low. For holes, prefer re-cropping from full
resolution after geometry is known, rather than raising the global resize.
The fixed 4 px/mm rectified canvas should stay — it makes runtime
independent of input resolution and gives a learned detector a constant
object scale.

### 4.5 Accuracy against the SHB edge-touch rule

Not meaningfully measurable from this spike, and I would rather say that
than quote a number. The rule (F.6.10.1) turns on whether a 5.6 mm hole
tangents a 0.2–0.5 mm ring line, so the error budget is roughly
**hole-center error + ring-radius error < ~0.5 mm**.

What can be said:

- The **rule itself is implemented correctly.** Fed synthetic centers, the
  scorer flips exactly at the tangent: a hole center at 15.30 mm (inner edge
  exactly on the 12.5 mm X-ring) scores X, at 15.31 mm it scores 10; same at
  every ring boundary out to ring 1. That logic is ~10 lines and belongs in
  `shared/` as pure TypeScript regardless of what happens to the CV.
- The **ring-radius half** of that budget is met: ±0.6 mm on inner rings,
  inside the card's own print tolerance, and stable across resolutions.
- The **hole-center half** is unmeasured, because with 5 true positives
  across 5 photos there is no sample. Centroids of merged or line-clipped
  blobs were visibly off by several millimeters, so the current detector is
  certainly outside budget.
- The pipeline already flags holes within 1 mm of the scoring ring as "edge
  calls" (one on `20251025_105532`). That flag is the right product
  primitive regardless of detector: **surface the judgement call to the user
  rather than deciding it**, since even a correct pipeline cannot beat
  TargetScan's claimed 0.2–0.5 mm gauge accuracy without a calibrated scale
  reference in frame.
- TargetScan's 0.2–0.5 mm claim is not comparable to anything measured here
  and should not be treated as a benchmark this spike moved toward.

### 4.6 Recommended v2 architecture

**All on-device, and it is feasible.** The shape:

1. **All on-device.** Nothing about this pipeline needs a server, and the
   photos are of a user's own range sessions. Consistent with the
   local-first stance in ADR 0001.
2. **Classical geometry stage** (find face → identify → deskew → refine to
   a 4 px/mm canvas), ported from this prototype.
3. **Learned hole stage** on the rectified canvas, trained on corrections
   collected from users who opt in.
4. **Scoring** in `shared/` as pure TypeScript over (x_mm, y_mm) hole
   centers — no CV dependency, unit-testable, and subject to the
   `old-coder` evidence loop like the rest of `shared/scoring/`.
5. **Drag-to-correct over every hole**, with edge-call holes visually
   flagged. The scoring stage never silently resolves a tangent case.

Splitting (2)/(3) from (4) matters: the SHB rule then lives in tested
TypeScript, and the CV layer only has to produce coordinates.

#### react-native-fast-opencv — feasible, with three gaps

`react-native-fast-opencv` v1.0.1 (MIT, new-architecture only, RN 0.85+,
prebuilt OpenCV binaries for both platforms, no Expo config plugin needed —
works under prebuild/dev-client/EAS, not Expo Go). It exposes ~148 ops.
Against the 24 this prototype uses, **21 are available**:

`cvtColor`, `GaussianBlur`, `threshold` (incl. `THRESH_OTSU |
THRESH_BINARY_INV`), `morphologyEx` (OPEN/CLOSE/TOPHAT/BLACKHAT),
`getStructuringElement`, `findContours`, `contourArea`, `fitEllipse`,
`drawContours`, `connectedComponentsWithStats`, `distanceTransform`,
`warpPerspective`, `resize`, `circle`, `drawMarker`, `mean` with mask,
`bitwise_and`/`bitwise_not`, `convexHull`, `HoughCircles`.

Missing, and what each costs us:

| Gap                | Impact                                                                                                                                                   | Way round                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fitEllipseDirect` | **Real.** Plain `fitEllipse` is what performed badly on the clipped cards; switching to `fitEllipseDirect` was one of the fixes that made stage 1 usable | Patch a `case` into the fork (below), or lean harder on stage 4, which already rescues a bad stage-1 fit                                               |
| `remap`            | Used for the radial profile in stage 4                                                                                                                   | **`warpPolar` is exposed** and is the better primitive anyway — it turns the radial profile into a row reduction instead of a hand-built sampling grid |
| `putText`          | Debug annotation only                                                                                                                                    | Irrelevant in the app; overlays are drawn in RN, not into the Mat                                                                                      |

Two partial gaps that do not bite this pipeline: `threshold` returns `void`
so the Otsu-computed value cannot be read back (we never use it), and
`HoughCircles` omits `minRadius`/`maxRadius` (we do not use it). Also absent:
`moments`, `minEnclosingCircle`.

Patching is cheap: dispatch is dynamic — any unknown property on `OpenCV` is
forwarded to `FOCV_Function::invoke` with the name as the first argument — so
adding `fitEllipseDirect` is one `case` block in `cpp/FOCV_Function.cpp` plus
a TypeScript declaration, with no per-platform work. Given the package is a
single-maintainer project (0 open issues, active, but bursty), **budget for
carrying a fork.**

Two integration facts that change the design:

- **There is no `imread` from a file path.** Pixels come in as
  `Mat.createFromBase64()` or `Mat.createFromBuffer()`. So the photo is
  decoded to base64 in JS first — which means the **2048 px resize happens in
  `expo-image-manipulator` before OpenCV ever sees it**, and the resize plan
  is now load-bearing for memory, not just speed. A 4000 px JPEG as base64 is
  a ~5.5 MB string on the JS heap.
- **No per-pixel accessor.** `mat.toBuffer()` copies the whole Mat into a
  TypedArray. A JS loop over a full-resolution photo is seconds; over a small
  polar-warped ROI it is a few milliseconds. Rule: do everything with native
  ops, `warpPolar` for anything radial, and only pull small reduced arrays
  into JS — on a worklet thread so the UI does not block.
- iOS ships OpenCV 4.9.0 and Android 4.12.0. **Different versions per
  platform**, so per the CLAUDE.md iOS-compatibility rule this must be tested
  on both, not just Android.

**Verdict:** `react-native-fast-opencv` is the right vehicle for stages 1–4.
Writing our own native module would be rebuilding this library for one
missing `case` statement; the only argument for it is a slimmed custom
OpenCV build to cut binary size, which is a later optimization.

#### For the learned hole stage

`react-native-fast-tflite` (v3.0.1, JSI, zero-copy typed arrays, and unlike
fast-opencv it ships a **real Expo config plugin** with CoreML and Android
GPU delegate flags). More widely used than fast-opencv and by the same author
as VisionCamera, so the frame-processor story is coherent.
`onnxruntime-react-native` is the fallback if a model only exports to ONNX;
Microsoft-maintained, heavier, less polished RN ergonomics.

Sizing, for the record (not measured here): a YOLO-nano-class detector is
~6 MB fp16 / ~3.2 MB int8 TFLite, ~20–50 ms per inference at 320 px with a
GPU/NNAPI delegate. Full-integer quantization is known to hurt box-coordinate
precision — which is precisely what we need — so **plan on fp16**. NMS and
box decoding are ours to write in JS either way.

But per §4.3 our detector should probably not be a box detector at all: on a
fixed 4 px/mm canvas the holes are a constant size, so a small center-heatmap
model with peak-finding is a better fit for overlapping shots, smaller than a
YOLO, and avoids the NMS-merges-two-holes-into-one failure that caused the
worst error in this spike.

#### Privacy

Ship-photos-to-nothing, as intended. Nothing in the above needs a server:
OpenCV runs in-process, the model file is bundled, and inference is local.
Consistent with ADR 0001. The one thing to be deliberate about is the
opt-in corrections corpus in §4.3 — that _is_ photo upload, and it must be
explicit, off by default, and separable from the scoring feature itself.

---

## 5. Recommendation

Do **not** build v2 photo scoring on this pipeline as it stands.

- **Keep** the geometry work — it exceeded the bar and is the reusable half.
- **Do not ship** classical hole detection. 24 % recall with 16 false
  positives is worse than useless behind a correction UI.
- **Next step, if this feature is pursued:** collect a labelled corpus.
  Roughly 50–100 photos of the 25 m precision face across lighting, crop and
  backing conditions, with fresh (unpasted) holes, hand-labelled. That
  corpus is the prerequisite for both training a detector and for _any_
  honest accuracy claim — this spike's 5 photos cannot support one.
- **Cheap interim win:** the geometry stage alone enables "photograph the
  target, tap each hole" with correct ring geometry and correct SHB
  edge-rule scoring. That is shippable now and generates the training data.

Nothing here changes any accepted ADR or the M0–M5 plan; photo scoring is
v2 (§ "Deferred" in `docs/implementation-plan.md`) and stays there.

---

## 6. Corpus v2 — 38 photos

**Date:** 2026-09-01 · same pipeline, 7.6× the photos.

Sections 1–5 were written from 5 photos, 2 of which were the target this
feature is actually for. The maintainer then hand-picked 38 more. Everything
below re-runs the _unchanged_ pipeline over the full corpus, adds one
improvement round, and asks whether §5 still holds.

**It does, and more firmly.** Geometry got _better_ on the bigger sample —
sub-millimeter on every photo it locks, and it locks on two thirds of
precision-face photos. Hole detection did not: 36 % recall / 43 % precision
overall, and one focused round of classical improvement moved recall by
exactly zero.

### 6.1 Corpus

All 38 candidates were reviewed one by one. All 38 are genuine target
photos; nothing was discarded as a non-target. Five of the 38 are the
phase-1 photos re-supplied, so the corpus is 33 new + 5 known.

| Class                       | Count |
| --------------------------- | ----- |
| 25 m precision face (F.7.1) | 28    |
| Milsnabb face (J.7.1)       | 10    |
| Not a target                | 0     |

Camera angle matters enough to be its own axis, so photos are classified by
how far off frontal the card is (judged visually, cross-checked against the
fitted black-zone ellipse's axis ratio):

| Angle class                       | Count | Geometry locked | Partial | Failed |
| --------------------------------- | ----- | --------------- | ------- | ------ |
| Straight-on (≲15°)                | 22    | 15              | 3       | 4      |
| Moderate (~20–45°)                | 14    | 3               | 2       | 9      |
| **Excluded: extreme perspective** | **2** | —               | —       | 2      |

The two excluded photos are `20250906_135537` (card receding almost
edge-on, plus a hand and marking rod across the center) and
`20250918_181552` (near-grazing angle, face occupying a small part of the
frame, mounted on a stand). They are excluded from the hole metrics only —
they stay in this table so the report says what the app will and will not
handle rather than quietly improving its own numbers. Moderate angle is
_not_ excluded: it is the realistic case and the geometry stage exists to
handle it.

Photos remain outside the repo. Annotated outputs are
`~/tmp/shotledger-cv-spike/out/<name>_panel_base.jpg` — rectified canvas
beside the annotated one, which is what the visual hole counts were taken
from — plus `corpus_2048_base.csv` / `corpus_2048_v2.csv`. Reproduce with
`spike/cv/eval_corpus.py`.

### 6.2 Target-type detection

|           | Photos | Typed correctly |
| --------- | ------ | --------------- |
| Precision | 28     | 26 (93 %)       |
| Milsnabb  | 10     | 2 (20 %)        |
| **All**   | **38** | **28 (74 %)**   |

The milsnabb number is the headline failure. `guess_kind` compares the
middle of the face against an annulus, and on a heavily pasted club
milsnabb target the middle is dark with black repair patches — so it reads
as a solid disc and is typed `precision`. That makes the ring scale 2.5×
wrong, which invalidates geometry _and_ every score on those photos before
hole detection is even reached. This is now the single largest source of
whole-photo failure, and it is a two-class decision on a 200 mm-vs-500 mm
black zone: it should be a _classifier_, not a hand-written intensity test.

### 6.3 Geometry

Geometry is the good news again, on a much better sample.

|                                                 | Count | Share |
| ----------------------------------------------- | ----- | ----- |
| Full lock (rings visually on the printed lines) | 18    | 47 %  |
| Partial (locked but visibly offset ≥1 mm)       | 5     | 13 %  |
| Failed                                          | 15    | 39 %  |

Restricted to the face this feature is for, excluding extreme perspective
(27 photos): **18 full locks (67 %), 5 partial (85 % cumulative), 4
failures**. On the milsnabb face: **0 of 10**, eight of them downstream of
the type misdetection above.

Ring residuals, measured on the X / 10 / 9 rings of the 18 locked photos
(`ring_residuals()`, peak of the angular-mean radial edge profile against
each nominal radius):

- **median 0.51 mm**
- **17 of 18 within 0.92 mm**; worst 1.88 mm
- §3's ±0.6 mm on two photos is confirmed, not contradicted, at 9× the
  sample. The geometry stage is the part of this spike that is _done_.

One caveat that the bigger corpus makes unmissable: **the residual is not a
validity check.** On `20250906_104730` the pipeline locked onto the sky and
gravel behind the target and still reports a 2.3 mm residual, because the
profile search finds _some_ edge near each nominal radius. Residual is only
meaningful once geometry is known to be on the target. A shipped pipeline
needs a separate "is this actually a target face" confidence signal.

The four geometry failures on the precision face each have a nameable
cause, and none of them is perspective:

| Photo             | Cause                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| `20250831_125338` | Center off-frame; one short arc of the black zone                               |
| `20260609_181957` | Black zone fills the whole frame — Otsu has no paper/black boundary to find     |
| `20250906_104730` | Dark treeline + gravel outweigh the target; largest dark blob is the background |
| `20250906_150442` | Same, gravel bank                                                               |

The last two are new and cheap to fix: "largest dark blob" is the wrong
prior outdoors. A concentricity or circularity prior would pick the target
over a treeline in one pass.

### 6.4 Holes — the numbers

165 fresh (unpasted) holes counted by eye across the 36 non-excluded
photos, against the phase-1 detector unchanged, at the planned 2048 px
input:

| Subset                          | Photos | Holes | Detections | TP  | FP  | Recall   | Precision |
| ------------------------------- | ------ | ----- | ---------- | --- | --- | -------- | --------- |
| Whole corpus                    | 36     | 165   | 140        | 60  | 80  | **36 %** | **43 %**  |
| Precision face, geometry locked | 18     | 90    | 87         | 53  | 34  | **59 %** | **61 %**  |
| Milsnabb face                   | 9      | 47    | 33         | 2   | 31  | **4 %**  | **6 %**   |

Against §3's 5-photo run (24 % / 24 %) this is better, and the improvement
is almost entirely composition: the bigger corpus contains many more
straight-on, well-lit precision photos, which is the easy case. The
milsnabb row is the same disaster at 2× the size.

**No photo in the corpus produced a correct series score.** The best cases
(`20250921_130706`, `20260613_104716`) found 5 of 5 holes, and
`20260613_104716` returned 6 false positives alongside them.

Failure-mode tally (counted by eye; a photo can appear in several rows):

| Mode                                                       | Photos               | Note                                                                                 |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| Repair patches on the face                                 | ~17                  | Superseded 2026-09-11 — separable classically, see `cv-corpus-validation-2026-09.md` |
| Nested faces — a card stapled over a larger printed target | ~10                  | **New.** The outer face's rings compete with the inner card's in the refine stage    |
| Moderate camera angle                                      | 14                   | Geometry, not holes, is what it breaks — see 6.3                                     |
| Dark holes on black (no bright backing)                    | ~5                   | **New**, and structurally undetectable by the phase-1 detector — see 6.5             |
| Overlapping / touching holes                               | ~8                   | Unchanged: merged into one blob                                                      |
| Occlusion (hand, marking rod, pencil)                      | 3                    | Two are false positives on the rod's own tip                                         |
| Large dark background winning Otsu                         | 3                    | Outdoor photos only                                                                  |
| Center off-frame / black zone filling the frame            | 3                    | Geometry fails outright                                                              |
| Printed ring digits                                        | all precision photos | The color cue from §3 held up; it remains contingent on the backing                  |
| Target types beyond precision/milsnabb                     | 0                    | The corpus is entirely F.7.1 and J.7.1                                               |

Two things the bigger corpus settles that §3 could only guess at:

- **Holes in the light zone are still untested.** Every fresh hole in all 38
  photos is in or on the edge of the black. The black-hat-on-paper path has
  now gone 38 photos without a single true positive.
- **The backing is not reliably bright.** §3's color discriminator assumed
  a hole shows neutral-white board behind the card. On this corpus the
  backing is white on some photos, orange on one, and _nothing_ on several —
  the hole is a dark tear. A rule contingent on the backing is now measured
  as fragile, not merely suspected to be.

### 6.5 Improvement round — one iteration, honest result

The bigger sample pointed at one obvious gap, so that is what the round
attacked: **holes that read dark on the black zone.** Phase 1 only ran a
top-hat (bright tears) inside the black and a black-hat on the paper, so a
dark pit in the black could not be found at all — not "was missed", but had
no code path. Three coupled changes (`variant="v2"` in `find_holes`):

1. A **dark-on-black channel** — black-hat inside the black zone, with the
   low-threshold structure gate made relative to that zone's own robust
   spread. The fixed ±35 gray offset lands below every pixel in a zone whose
   level is ~65 with a floor near 50, which is why the channel returns
   nothing without this.
2. A **local-contrast gate**, without which the new channel returns paper
   texture.
3. An explicit **scoring-area cut** — a candidate outside the outermost ring
   cannot be a shot.

Before/after, same 36 photos, same 165 holes:

|                       | Detections | TP  | FP  | Recall     | Precision  |
| --------------------- | ---------- | --- | --- | ---------- | ---------- |
| v1 (phase-1 detector) | 140        | 60  | 80  | 36.4 %     | 42.9 %     |
| v2 (this round)       | 145        | 60  | 85  | **36.4 %** | **41.4 %** |

**No improvement.** The new channel found one hole that v1 missed
(`20250831_125338`), lost one that v1 had (`20260426_105819`), and added six
false positives. The scoring-area cut removed nothing, because no false
positive was ever outside ring 1. v2 is kept in the code and is _not_ the
default; `variant="v1"` is.

An earlier composition of the same round applied the relative threshold to
all three channels and scored 53 TP / 73 FP — worse still, because a
zone-relative threshold costs true positives in the paper zone. That is
recorded because it is the kind of change that looks obviously right and
measures wrong.

Why it failed is more useful than that it failed. Measured on the photos
this was aimed at: a dark .22 hole in the black zone sits about **16 gray
levels** below a zone whose own median absolute deviation is **4–8** levels.
The signal is real and it is roughly 2–3 MAD — nowhere near enough margin
for a threshold. A spot check at 4000 px input recovered one hole on
`20260809_104014` (0 → 1 detection) and none on the other two, so
re-cropping from full resolution helps at the margin and does not change the
conclusion.

That is the same shape of finding as §3's: every classical discriminator
tried is either too weak, inverted, or contingent on something outside the
target. Two independent rounds, on 5 and then 38 photos, have now produced
that answer.

### 6.6 Does the recommendation change?

**No. Phase 1 (auto-geometry + tap-to-mark) / phase 2 (learned heatmap
detector trained on opt-in corrections) stands, with three amendments.**

What got stronger:

- **Geometry is more clearly shippable than §3 could claim.** 0.51 mm median
  residual over 18 photos, 67 % full lock on the precision face, and every
  failure attributable to a named, fixable cause. Tap-to-mark on an
  auto-rectified canvas with correct SHB edge-rule scoring is a real feature
  today.
- **The case for a learned stage 5 is now evidence, not inference.** A second
  detector round on 7.6× the data moved recall by 0.0 points. 36 % recall
  with 80 false positives across 36 photos is still worse than useless behind
  a correction UI.

What changes:

1. **Target-type identification must be learned too, or at least be a
   trained two-class decision.** At 20 % on the milsnabb face it is now the
   largest single cause of whole-photo failure, and it poisons geometry
   rather than merely degrading holes. §4.6's architecture put "identify"
   inside the classical block; move it out, or make it a confidence-scored
   decision the user can override with one tap.
2. **Geometry needs a validity signal, not just a residual.** Two photos
   locked confidently onto background scenery. The app must be able to say
   "I did not find a target" instead of drawing rings on gravel — and that
   is also a prerequisite for tap-to-mark being trustworthy.
3. **The training corpus target in §5 is now met on quantity and short on
   variety.** 38 photos with 165 counted holes exist. What is missing for
   training is per-hole _labels_ and the conditions this corpus lacks:
   holes in the light zone (0 examples), unpasted faces (most club targets
   here carry hundreds of patches), and a clean precision face shot at
   moderate angle. The opt-in corrections corpus from normal app use is
   still the right way to get them.

Unchanged: all on-device, `react-native-fast-opencv` for stages 1–4,
scoring as pure TypeScript in `shared/`, drag-to-correct over every hole,
2048 px for geometry with full-resolution re-crops for holes. Nothing here
touches an accepted ADR or the M0–M5 plan.
