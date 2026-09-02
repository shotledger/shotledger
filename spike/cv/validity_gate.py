"""Calibration harness for the phase-1 geometry VALIDITY GATE.

The CV spike (docs/specs/cv-spike-report.md §6.3) found that the ring
residual is *not* a validity check: two photos locked confidently onto sky
and gravel behind the target and still reported plausible residuals. Phase 1
therefore needs a separate "is this actually a target face" signal before
tap-to-mark is allowed to trust the rings.

This script computes the four candidate gate metrics on the real corpus so
the thresholds shipped in
`app/src/features/photo-scoring/geometry/validity.ts` are chosen from
measurement rather than taste. Depends on `target_cv.py` from branch
spike/cv-target-scoring.

    python validity_gate.py --in ~/tmp/shotledger-cv-spike/targets
"""

from __future__ import annotations

import argparse
import csv
import glob
import math
import os

import cv2
import numpy as np

import target_cv as T

PRECISION_BLACK_MM = 200.0


def norm_profile_score(rect, geom, radii, scale):
    """refine_geom's objective, normalised by the profile's own robust spread.

    The raw objective is a mean of profile peaks, so its magnitude tracks the
    photo's contrast and is useless as an absolute threshold. Dividing by the
    profile's median absolute deviation asks the scale-free question the gate
    actually cares about: are the ring lines *peaks*, or is this the flat
    edge response of gravel?
    """
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY).astype(np.float32)
    cx, cy = geom.center
    rmax = int(radii[-1] * 1.05 * geom.px_per_mm)
    prof = T._radial_profile(g, cx, cy, rmax)
    if len(prof) < 8:
        return 0.0
    mad = float(np.median(np.abs(prof - np.median(prof))))
    if mad <= 1e-6:
        return 0.0
    vals = []
    for rm in radii:
        r = int(rm * geom.px_per_mm * scale)
        lo, hi = max(0, r - 2), r + 3
        if hi < len(prof):
            vals.append(float(prof[lo:hi].max()))
    if not vals:
        return 0.0
    return float(np.mean(vals)) / mad


def zone_contrast(img, ellipse):
    """Grey step between the printed black zone and the paper just outside it.

    A precision face is a solid black disc on light card, so this is large and
    positive. A treeline or a gravel bank that won Otsu has no such step.
    """
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    (cx, cy), (d1, d2), _ = ellipse
    r = min(d1, d2) / 2
    inner = T._disc_mean(g, cx, cy, 0.70 * r)
    outer = T._annulus_mean(g, cx, cy, 1.15 * r, 1.40 * r)
    return float(outer - inner)


def metrics(path, long_side=2048):
    img = T.load(path, long_side)
    h, w = img.shape[:2]
    ellipse, partial, _mask = T.find_face(img)
    (cx, cy), (d1, d2), _ang = ellipse
    lo, hi = min(d1, d2), max(d1, d2)

    row = {
        "photo": os.path.splitext(os.path.basename(path))[0],
        "kind": T.guess_kind(img, ellipse),
        "aspect": round(hi / lo, 3) if lo else 999.0,
        # black-zone extent relative to the frame: too small = not the subject,
        # too large = Otsu had no paper/black boundary to find (§6.3 failure 2)
        "zone_frac": round(hi / max(h, w), 3),
        "center_in": bool(0 <= cx < w and 0 <= cy < h),
        "contrast": round(zone_contrast(img, ellipse), 1),
        "partial": partial,
    }

    # Phase 1 is precision-face only, so score the geometry as a precision
    # face regardless of guess_kind -- the gate, not guess_kind, decides.
    rect, geom = T.build_geom(img, ellipse, "precision", partial)
    radii = [d / 2 for _, d in T.PRECISION_RINGS]
    geom = T.refine_geom(rect, geom, "precision")
    # refine_geom mutates geom in place and folds `sc` into px_per_mm, so the
    # profile is re-scored at scale 1 against the already-refined geometry.
    row["profile"] = round(norm_profile_score(rect, geom, radii, 1.0), 2)
    row["px_per_mm"] = round(geom.px_per_mm, 3)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", default="")
    ap.add_argument("--long-side", type=int, default=2048)
    a = ap.parse_args()

    rows = []
    for p in sorted(glob.glob(os.path.join(os.path.expanduser(a.src), "*.jpg"))):
        try:
            rows.append(metrics(p, a.long_side))
        except SystemExit as exc:  # find_face raises SystemExit on no dark region
            rows.append({"photo": os.path.splitext(os.path.basename(p))[0],
                         "kind": "?", "aspect": 999, "zone_frac": 0,
                         "center_in": False, "contrast": 0, "partial": True,
                         "profile": 0, "px_per_mm": 0, "error": str(exc)})
        print(rows[-1], flush=True)

    if a.dst:
        cols = ["photo", "kind", "aspect", "zone_frac", "center_in", "contrast",
                "partial", "profile", "px_per_mm"]
        with open(os.path.expanduser(a.dst), "w", newline="") as fh:
            wtr = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
            wtr.writeheader()
            wtr.writerows(rows)


if __name__ == "__main__":
    main()
