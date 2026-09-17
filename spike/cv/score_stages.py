"""Score proposal stages against hand-marked hole centres, and dump features.

Takes the marks read off `mark_holes.py`'s grids — one line per photo,
`<name> x,y x,y ...` in rectified-canvas pixels — and runs each proposal stage
over the same photos. A candidate is a true positive when it lands within
0.9 hole diameters of an unclaimed mark; everything else is a false positive;
every unclaimed mark is a miss.

Writes one row per candidate with its label and its `hole_filter.features`, so
`fit_hole_filter.py` can fit the filter on exactly the candidates a stage
proposes, and so recall can be measured against holes rather than against
whatever the detector already liked.

    python score_stages.py --marks marks.txt --in <photos> --out candidates.csv

Stages scored: `tight` (the shipped phase-1 stage, `target_cv.find_holes`),
`loose` (`hole_filter.LOOSE`), and `open` (LOOSE with the glyph mask off, a
lower threshold and a larger cap — the most generous setting tried).

Marks name real photos, so they live outside the working tree with them.
"""

from __future__ import annotations

import argparse
import csv
import math
import os

import cv2

import hole_filter as HF
import target_cv as T

# `open` is LOOSE with every brake off: no glyph suppression, a threshold two
# MADs above the noise floor instead of twelve, and a cap high enough not to
# bind. It is the setting that answers "can this stage find the holes at all",
# separately from "can anything downstream survive what it proposes".
STAGES = {
    "tight": None,
    "loose": dict(HF.LOOSE),
    "open": dict(HF.LOOSE, glyph_scale=1e9, k_mad=6.0, max_candidates=200),
}

MATCH_DIAMETERS = 0.9


def read_marks(path: str) -> dict[str, list[tuple[float, float]]]:
    marks: dict[str, list[tuple[float, float]]] = {}
    for line in open(os.path.expanduser(path)):
        parts = line.split()
        if not parts:
            continue
        marks[parts[0]] = [tuple(float(v) for v in p.split(",")) for p in parts[1:]]
    return marks


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--marks", required=True)
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--long-side", type=int, default=2048)
    ap.add_argument("--kind", default="precision", choices=list(T.TARGETS))
    a = ap.parse_args()

    rows = []
    for name, holes in read_marks(a.marks).items():
        img = T.load(os.path.join(os.path.expanduser(a.src), name + ".jpg"), a.long_side)
        ellipse, partial, _ = T.find_face(img)
        rect, geom = T.build_geom(img, ellipse, a.kind, partial)
        geom = T.refine_geom(rect, geom, a.kind)
        d = T.BULLET_MM * geom.px_per_mm
        gray = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)

        for stage, params in STAGES.items():
            cands = (T.find_holes(rect, geom, a.kind, "v1") if params is None
                     else HF.propose(rect, geom, a.kind, params))
            claimed: set[int] = set()
            for i, c in enumerate(cands):
                best, best_dist = -1, MATCH_DIAMETERS * d
                for j, (hx, hy) in enumerate(holes):
                    if j in claimed:
                        continue
                    dist = math.hypot(c.x - hx, c.y - hy)
                    if dist < best_dist:
                        best, best_dist = j, dist
                if best >= 0:
                    claimed.add(best)
                crop = HF.crop_at(gray, c.x, c.y)
                row = dict(photo=name, stage=stage, cand=i,
                           label=1 if best >= 0 else 0, edge=int(crop is None),
                           r_mm=round(math.hypot(c.x - geom.center[0],
                                                 c.y - geom.center[1]) / geom.px_per_mm, 1))
                if crop is not None:
                    row.update({k: round(v, 6) for k, v in HF.features(crop).items()})
                rows.append(row)
            # cand = -1 carries the miss count for this photo and stage, so the
            # denominator of recall travels with the candidates.
            rows.append(dict(photo=name, stage=stage, cand=-1, label=-1, edge=0,
                             r_mm=len(holes) - len(claimed)))
        print(f"{name} holes={len(holes)}", flush=True)

    keys = ["photo", "stage", "cand", "label", "edge", "r_mm", *HF.FEATURE_NAMES]
    with open(os.path.expanduser(a.dst), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print("wrote", a.dst, len(rows))


if __name__ == "__main__":
    main()
