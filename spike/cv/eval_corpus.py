"""Corpus-v2 evaluation harness.

Runs the pipeline over every photo in --in and writes, per photo:

  * `<name>_panel.jpg`  -- plain rectified canvas beside the annotated one,
    which is what the visual hole ground truth was counted from
  * a row in `corpus_<long-side>.csv` with the geometry diagnostics the
    report tabulates: fitted-ellipse aspect (a proxy for camera tilt),
    px/mm, per-ring residuals, detections and scores

    python eval_corpus.py --in ~/tmp/shotledger-cv-spike/targets \
                          --out ~/tmp/shotledger-cv-spike/out

Photos live outside the repo on purpose (personal camera roll).
"""

from __future__ import annotations

import argparse
import csv
import glob
import math
import os
import time

import cv2
import numpy as np

import target_cv as T


def tilt_deg(ellipse) -> float:
    """Camera tilt implied by the fitted black-zone ellipse, assuming the
    zone is a circle: acos(minor/major). Only meaningful when the fit is
    good, so the report reads it together with the `partial` flag."""
    (_, _), (d1, d2), _ = ellipse
    lo, hi = min(d1, d2), max(d1, d2)
    return math.degrees(math.acos(max(0.0, min(1.0, lo / hi)))) if hi else 0.0


def panel(rect, annot, width=1100):
    pair = np.hstack([rect, annot])
    s = width / pair.shape[1]
    return cv2.resize(pair, (width, int(pair.shape[0] * s)), cv2.INTER_AREA)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--long-side", type=int, default=2048)
    ap.add_argument("--tag", default="")
    ap.add_argument("--variant", default="v1", choices=["v1", "v2"])
    a = ap.parse_args()
    dst = os.path.expanduser(a.dst)
    os.makedirs(dst, exist_ok=True)

    rows = []
    for p in sorted(glob.glob(os.path.join(os.path.expanduser(a.src), "*.jpg"))):
        name = os.path.splitext(os.path.basename(p))[0]
        t0 = time.time()
        try:
            img = T.load(p, a.long_side)
            ellipse, partial, _ = T.find_face(img)
            kind = T.guess_kind(img, ellipse)
            rect, geom = T.build_geom(img, ellipse, kind, partial)
            geom = T.refine_geom(rect, geom, kind)
            res = T.ring_residuals(rect, geom, kind)
            holes = [T.score_hole(h, geom, kind)
                     for h in T.find_holes(rect, geom, kind, a.variant)]
            holes.sort(key=lambda h: h.r_mm)
        except Exception as e:                                   # noqa: BLE001
            print(f"{name}: FAILED {e}")
            rows.append(dict(photo=name, kind="FAILED", aspect="", tilt_deg="",
                             partial="", px_per_mm="", res_inner="", res_max="",
                             n=0, scores=str(e), ms=0))
            continue

        annot = T.annotate(rect, geom, kind, holes)
        cv2.imwrite(os.path.join(dst, f"{name}_panel{a.tag}.jpg"),
                    panel(rect, annot), [cv2.IMWRITE_JPEG_QUALITY, 82])

        (_, _), (d1, d2), _ = ellipse
        inner = [v for lbl, v in res[:5] if v is not None]
        rows.append(dict(
            photo=name, kind=kind,
            aspect=round(max(d1, d2) / max(1e-6, min(d1, d2)), 3),
            tilt_deg=round(tilt_deg(ellipse), 1),
            partial=partial, px_per_mm=round(geom.px_per_mm, 3),
            res_inner=" ".join(f"{v:+.2f}" for v in inner),
            res_max=round(max(abs(v) for v in inner), 2) if inner else "",
            n=len(holes), scores=" ".join(h.score for h in holes),
            ms=round((time.time() - t0) * 1000)))
        r = rows[-1]
        print(f"{name:20s} {kind:9s} asp={r['aspect']:.2f} tilt={r['tilt_deg']:4.1f} "
              f"part={int(partial)} res<={r['res_max']} n={len(holes):2d} "
              f"{r['ms']:5d}ms  {r['scores']}")

    with open(os.path.join(dst, f"corpus_{a.long_side}{a.tag}.csv"), "w",
              newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
