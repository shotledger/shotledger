# CV spike — target detection and hole scoring

Throwaway Python/OpenCV prototype used to answer whether ShotLedger can
score a photographed Swedish 25 m pistol target on-device. Findings are in
[`docs/specs/cv-spike-report.md`](../../docs/specs/cv-spike-report.md).

**This is spike code.** None of it runs in the app and none of it is tested —
read the report first. Two things have since been ported _from_ it and are the
exception to "not the design for the production pipeline": the geometry stage
(`app/src/features/photo-scoring/opencv.ts`) and the hole/patch filter's
arithmetic and constants (see the last section). Both are kept in lock-step
deliberately; the rest is throwaway.

## Photos are not in the repo

The evaluation photos are personal camera-roll images and live **outside**
the working tree, as do the annotated outputs. Nothing here reads or writes
anything inside the repo.

## Run

```bash
python -m venv ~/tmp/shotledger-cv-spike/venv
~/tmp/shotledger-cv-spike/venv/bin/pip install -r requirements.txt

# photos in --in, annotated images + results_<N>.csv into --out
~/tmp/shotledger-cv-spike/venv/bin/python run_spike.py \
    --in  ~/tmp/shotledger-cv-spike/targets \
    --out ~/tmp/shotledger-cv-spike/out \
    --long-side 2048            # input downscale; 1024 / 2048 / 4000 compared
    # --kind precision|milsnabb  # skip target-type auto-detection
```

Per photo it prints target type, hole count, summed score, how many holes
landed within 1 mm of a ring line ("edge calls"), whether the black zone was
clipped by the frame, and wall time.

`eval_corpus.py` is what produced the Corpus v2 numbers. Same arguments, plus
`--variant v1|v2`, `--tag`, `--only <file>` (a list of photo names to restrict
to) and `--prior on|off` (`off` restores pre-#266 "largest dark blob" face
finding, so a run can be compared against the disc-like prior — see the
2026-09-16 section of `docs/specs/contributed-corpus-2026-09-15.md`). Each row
carries the production validity gate's verdict in a `gate` column, so a run
answers "would the app have accepted this photo". It writes a `<name>_panel<tag>.jpg` per photo
(plain rectified canvas beside the annotated one — the visual hole ground
truth was counted from these) and a `corpus_<long-side><tag>.csv` carrying the
fitted-ellipse aspect, the `partial` flag, px/mm and the per-ring residuals.

```bash
~/tmp/shotledger-cv-spike/venv/bin/python eval_corpus.py \
    --in ~/tmp/shotledger-cv-spike/targets \
    --out ~/tmp/shotledger-cv-spike/out --tag _base
```

## Pipeline (`target_cv.py`)

| Stage            | What it does                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find_face`      | Otsu on a heavily blurred grey copy → the largest **disc-like** dark blob is the printed black zone; `fitEllipseDirect` on the contour, then `_refit_rays` re-fits from ray casts that ignore rays leaving the frame                               |
| `guess_kind`     | solid black disc → 25 m precision target (black = 200 mm); black annulus round a lighter middle → milsnabb (black = 500 mm)                                                                                                                        |
| `build_geom`     | maps the fitted ellipse back to a circle (rotation + anisotropic scale — weak perspective, _not_ a full homography: one conic does not determine one) and warps to a fixed 4 px/mm canvas                                                          |
| `refine_geom`    | coarse-to-fine grid search over (dx, dy, scale) maximising a radial edge profile against the known ring radii — this is what rescues geometry when the black zone was clipped                                                                      |
| `ring_residuals` | per-ring distance from the drawn ring to the printed line it should sit on — the geometry accuracy number the report quotes                                                                                                                        |
| `find_holes`     | over-sized top-hat (bright tears on black) and black-hat (dark holes on paper); candidates filtered by area, largest inscribed disc, structure size at a low threshold with the ring lines removed, and colour against the card's own paper colour |
| `score_hole`     | radius in mm → ring, applying SHB F.6.10.1 (a hole counts to the higher value as soon as the ring's outer edge is tangented), so the hole's _inner_ edge is compared to each ring                                                                  |

Ring diameters come from `docs/reference/spsf-shb-2026.md` (F.7.1 p. 182,
J.7.1 p. 297) and are the only domain constants in the file.

## Hole/patch filter (`hole_filter.py`)

The texture filter that tells a bullet hole from a repair patch or a printed
digit, and the loosened proposal stage that was measured against it and
**rejected**. Numbers: [`docs/specs/cv-corpus-validation-2026-09.md`](../../docs/specs/cv-corpus-validation-2026-09.md)
§5; the port and its contract:
[`docs/specs/cv-assisted-detection-spec.md`](../../docs/specs/cv-assisted-detection-spec.md).

This file is the **reference** for the feature arithmetic. The app runs
`shared/src/target-scoring/hole-features.ts`, which re-implements it without
OpenCV; `hole-features.fixtures.json` (written by
`gen_hole_feature_fixtures.py`, synthetic crops only) pins the two together.
Change one and you change both.

The measurement pipeline, end to end — photos, grids and marks all stay
outside the working tree:

```bash
# 1. render coordinate grids and read the hole centres off them by eye
python mark_holes.py --in <photos> --out <grids> --only names.txt

# 2. score every proposal stage against those marks, dumping features
python score_stages.py --marks marks.txt --in <photos> --out candidates.csv

# 3. fit the filter, cross-validated by photo; --test corpora are never fitted on
python fit_hole_filter.py pooled.csv --stage tight
python fit_hole_filter.py corpusA.csv --test corpusB.csv --stage tight

# 4. regenerate the TypeScript lock-step fixture after any change to step 3
python gen_hole_feature_fixtures.py > \
    ../../shared/src/target-scoring/hole-features.fixtures.json
```

Ground truth is **hole centres, not candidate labels**: labelling the
candidates a detector proposes cannot measure the holes it misses.

## Hole proposals (`hole_proposals.py`)

The "suggested holes" stage: Laplacian-of-Gaussian peaks on a half-resolution
canvas, thirty features per candidate, a logistic regression, a merge of
peaks closer than one hole diameter and a centroid refinement. Numbers and
the decisions behind them:
[`docs/specs/cv-hole-proposals-2026-09.md`](../../docs/specs/cv-hole-proposals-2026-09.md).

This file is the **reference** for the arithmetic; the app runs
`app/src/features/photo-scoring/hole-proposals.ts`, a port without OpenCV.
`synthetic_canvas.py` draws integer-only synthetic canvases that the
TypeScript twin reproduces pixel for pixel, and
`gen_hole_proposal_fixtures.py` writes the lock-step fixture from them — no
pixel from any real photo. Change one side and you change both, then
regenerate the fixture.

```bash
# 1. candidates with features, against hand marks (rectifies onto the
#    app-sized canvas; --cache keeps the canvases between runs)
python eval_hole_proposals.py --marks marks.txt --in <photos> \
    --out candidates.csv --cache <dir>
python eval_hole_proposals.py --marks marks.txt --in <photos> --cache <dir> --report

# 2. fit, cross-validated by photo; paste the constants into hole_proposals.py
#    and hole-proposals.ts
python fit_hole_proposals.py candidates.csv --marks marks.txt
python fit_hole_proposals.py a.csv --test b.csv --marks marks.txt

# 3. regenerate the lock-step fixture after any change to the arithmetic
python gen_hole_proposal_fixtures.py > \
    ../../app/src/features/photo-scoring/hole-proposals.fixtures.json
```

The marks are read off the spike's 1040 px canvas (see `mark_holes.py`);
`eval_hole_proposals.py` shifts them onto the 2100 px one.

## Close-up lock (`closeup_lock.py`)

Locks onto a photo of the 7–10 rings, or only 9–10, where the black disc's
edge is out of frame. It finds the centre by voting along edge normals, takes
the 25 mm ring step from the radial profile's period, and fits a homography to
the ring points. The module docstring has the details. Findings are in
[`docs/specs/cv-closeup-lock-2026-09.md`](../../docs/specs/cv-closeup-lock-2026-09.md).

```bash
# close-ups cut from every photo the disc lock handles, plus crops whose
# centre is out of frame, which the gate must refuse
python eval_closeup.py --glob '<photos>/*.jpg' --out closeup.csv
```
