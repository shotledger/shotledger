# CV spike — target detection and hole scoring

Throwaway Python/OpenCV prototype used to answer whether ShotLedger can
score a photographed Swedish 25 m pistol target on-device. Findings are in
[`docs/specs/cv-spike-report.md`](../../docs/specs/cv-spike-report.md).

**This is spike code.** It is not wired into the app, is not tested, and is
not the design for the production pipeline — read the report first.

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

## Pipeline (`target_cv.py`)

| Stage | What it does |
|---|---|
| `find_face` | Otsu on a heavily blurred grey copy → largest dark blob = the printed black zone; `fitEllipseDirect` on the contour, then `_refit_rays` re-fits from ray casts that ignore rays leaving the frame |
| `guess_kind` | solid black disc → 25 m precision target (black = 200 mm); black annulus round a lighter middle → milsnabb (black = 500 mm) |
| `build_geom` | maps the fitted ellipse back to a circle (rotation + anisotropic scale — weak perspective, *not* a full homography: one conic does not determine one) and warps to a fixed 4 px/mm canvas |
| `refine_geom` | coarse-to-fine grid search over (dx, dy, scale) maximising a radial edge profile against the known ring radii — this is what rescues geometry when the black zone was clipped |
| `find_holes` | over-sized top-hat (bright tears on black) and black-hat (dark holes on paper); candidates filtered by area, largest inscribed disc, structure size at a low threshold with the ring lines removed, and colour against the card's own paper colour |
| `score_hole` | radius in mm → ring, applying SHB F.6.10.1 (a hole counts to the higher value as soon as the ring's outer edge is tangented), so the hole's *inner* edge is compared to each ring |

Ring diameters come from `docs/reference/spsf-shb-2026.md` (F.7.1 p. 182,
J.7.1 p. 297) and are the only domain constants in the file.
