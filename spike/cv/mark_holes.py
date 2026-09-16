"""Render the rectified canvas under a labelled grid, for marking holes by eye.

Ground truth for the hole stage is where the *holes* are, not which candidates
a detector liked — labelling candidates biases the measurement towards
whatever the detector already proposes, and cannot measure recall at all.

So: rectify the photo exactly as the pipeline does, draw a 50 px grid over it
with the coordinate of every 100 px intersection, and read the hole centres off
by eye. `score_stages.py` then takes those marks and scores any proposal stage
against them.

Coordinates are printed in tens of pixels ("45,32" means x=450, y=320) purely
so the labels fit between the lines.

    python mark_holes.py --in <photos> --out <dir> --only names.txt

Photos and the rendered grids are personal data and stay outside the working
tree (hard rule 7); so do the marks, which name the photo they came from.
"""

from __future__ import annotations

import argparse
import glob
import os

import cv2

import target_cv as T

GRID_PX = 50


def render(path: str, long_side: int, kind: str):
    img = T.load(path, long_side)
    ellipse, partial, _ = T.find_face(img)
    rect, geom = T.build_geom(img, ellipse, kind, partial)
    geom = T.refine_geom(rect, geom, kind)
    out = rect.copy()
    h, w = out.shape[:2]
    for x in range(0, w, GRID_PX):
        cv2.line(out, (x, 0), (x, h), (0, 255, 255) if x % 100 else (0, 0, 255), 1)
    for y in range(0, h, GRID_PX):
        cv2.line(out, (0, y), (w, y), (0, 255, 255) if y % 100 else (0, 0, 255), 1)
    for x in range(0, w, 100):
        for y in range(0, h, 100):
            cv2.putText(out, f"{x // 10},{y // 10}", (x + 3, y + 14),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1, cv2.LINE_AA)
    return out, geom


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--long-side", type=int, default=2048)
    ap.add_argument("--kind", default="precision", choices=list(T.TARGETS))
    ap.add_argument("--only", default=None, help="file listing photo names to include")
    a = ap.parse_args()

    dst = os.path.expanduser(a.dst)
    os.makedirs(dst, exist_ok=True)
    only = None
    if a.only:
        only = {ln.strip() for ln in open(os.path.expanduser(a.only)) if ln.strip()}

    for p in sorted(glob.glob(os.path.join(os.path.expanduser(a.src), "*.jpg"))):
        name = os.path.splitext(os.path.basename(p))[0]
        if only is not None and name not in only:
            continue
        out, geom = render(p, a.long_side, a.kind)
        cv2.imwrite(os.path.join(dst, f"{name}_grid.jpg"), out,
                    [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f"{name} {out.shape[1]}x{out.shape[0]} px_per_mm={geom.px_per_mm:.2f}",
              flush=True)


if __name__ == "__main__":
    main()
