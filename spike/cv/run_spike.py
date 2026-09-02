"""Batch-run the pipeline over a directory of target photos.

    python run_spike.py --in ~/tmp/shotledger-cv-spike/targets \
                        --out ~/tmp/shotledger-cv-spike/out [--long-side 2048]

Writes <name>_annot.jpg per photo plus results.csv, and prints a table.
Photos live outside the repo on purpose (personal camera roll).
"""

from __future__ import annotations

import argparse
import csv
import glob
import os
import time

import cv2

import target_cv as T


def process(path: str, long_side: int, kind: str | None = None):
    t0 = time.time()
    img = T.load(path, long_side)
    ellipse, partial, _ = T.find_face(img)
    k = kind or T.guess_kind(img, ellipse)
    rect, geom = T.build_geom(img, ellipse, k, partial)
    geom = T.refine_geom(rect, geom, k)
    holes = [T.score_hole(h, geom, k) for h in T.find_holes(rect, geom, k)]
    holes.sort(key=lambda h: h.r_mm)
    return dict(img=img, rect=rect, geom=geom, kind=k, holes=holes,
                partial=partial, ms=(time.time() - t0) * 1000)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--long-side", type=int, default=2048)
    ap.add_argument("--kind", default=None, choices=list(T.TARGETS))
    a = ap.parse_args()
    os.makedirs(a.dst, exist_ok=True)

    rows = []
    for p in sorted(glob.glob(os.path.join(os.path.expanduser(a.src), "*.jpg"))):
        name = os.path.splitext(os.path.basename(p))[0]
        try:
            r = process(p, a.long_side, a.kind)
        except Exception as e:                                   # noqa: BLE001
            print(f"{name}: FAILED {e}")
            rows.append(dict(photo=name, kind="-", holes=0, total=0,
                             scores="FAILED: " + str(e), ms=0))
            continue
        out = T.annotate(r["rect"], r["geom"], r["kind"], r["holes"])
        cv2.imwrite(os.path.join(os.path.expanduser(a.dst),
                                 f"{name}_annot_{a.long_side}.jpg"), out,
                    [cv2.IMWRITE_JPEG_QUALITY, 88])
        scores = [h.score for h in r["holes"]]
        total = sum(T.ring_value(s) for s in scores if s != "0")
        edge = sum(1 for h in r["holes"] if h.notes)
        rows.append(dict(photo=name, kind=r["kind"], holes=len(scores),
                         total=total, scores=" ".join(scores), edge_calls=edge,
                         partial=r["partial"], ms=round(r["ms"])))
        print(f"{name:22s} {r['kind']:9s} n={len(scores):2d} sum={total:3d} "
              f"edge={edge} partial={r['partial']} {r['ms']:.0f}ms  {' '.join(scores)}")

    with open(os.path.join(os.path.expanduser(a.dst), f"results_{a.long_side}.csv"),
              "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
