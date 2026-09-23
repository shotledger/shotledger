"""Measure the proposal stage against hand-marked hole centres, and dump every
candidate's features for `fit_hole_proposals.py`.

    python eval_hole_proposals.py --marks marks.txt --in <photos> --out candidates.csv

Each photo is rectified as the app does it (face prior on, refined geometry),
onto the app-sized canvas — 2 x 262.5 mm at 4 px/mm — so the outer white zone
the app will search (stamps, handwriting, patches) is measured too. The marks
were read off the spike's 1040 px canvas and are shifted onto this one.

A candidate is a true positive within 0.9 hole diameters of an unclaimed mark,
nearest first. With `--report` the fitted constants in `hole_proposals` are
applied and recall / precision / false positives per photo / exact series are
printed at several thresholds, after the merge step. Marks and photos stay
outside the working tree.
"""
from __future__ import annotations

import argparse
import csv
import math
import os
import pickle

import cv2
import numpy as np

import hole_proposals as HP
import target_cv as T

CANVAS_PX = 2100
SPIKE_CANVAS_PX = 1040
MATCH_DIAMETERS = 0.9
PRECISION_RINGS_MM = tuple(d / 2 for _, d in T.PRECISION_RINGS)


def read_marks(path):
    marks = {}
    for line in open(os.path.expanduser(path)):
        parts = line.split()
        if parts:
            marks[parts[0]] = [tuple(float(v) for v in p.split(",")) for p in parts[1:]]
    return marks


def rectify(path, long_side, cache_dir=None):
    """The app-sized canvas, its centre and scale; cached because the geometry
    stage costs a second per photo and the fit iterates."""
    name = os.path.basename(path)
    cached = os.path.join(cache_dir, name + ".pkl") if cache_dir else None
    if cached and os.path.exists(cached):
        return pickle.load(open(cached, "rb"))
    img = T.load(path, long_side)
    ellipse, partial, _ = T.find_face(img)
    rect, geom = T.build_geom(img, ellipse, "precision", partial)
    geom = T.refine_geom(rect, geom, "precision")
    shift = (CANVAS_PX - rect.shape[0]) / 2
    H = geom.H.copy()
    H[0, 2] += shift
    H[1, 2] += shift
    big = cv2.warpPerspective(img, H, (CANVAS_PX, CANVAS_PX), flags=cv2.INTER_CUBIC,
                              borderValue=(255, 255, 255))
    out = dict(gray=cv2.cvtColor(big, cv2.COLOR_BGR2GRAY),
               center=(geom.center[0] + shift, geom.center[1] + shift),
               px_per_mm=geom.px_per_mm, shift=shift)
    if cached:
        os.makedirs(cache_dir, exist_ok=True)
        pickle.dump(out, open(cached, "wb"))
    return out


def match(cands, holes, d):
    """Greedy nearest-first matching; returns labels per candidate and the
    number of unclaimed holes."""
    pairs = []
    for i, c in enumerate(cands):
        for j, (hx, hy) in enumerate(holes):
            dist = math.hypot(c["x"] - hx, c["y"] - hy)
            if dist < MATCH_DIAMETERS * d:
                pairs.append((dist, i, j))
    pairs.sort()
    used_c, used_h = set(), set()
    labels = [0] * len(cands)
    for _, i, j in pairs:
        if i in used_c or j in used_h:
            continue
        used_c.add(i)
        used_h.add(j)
        labels[i] = 1
    return labels, len(holes) - len(used_h)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--marks", required=True)
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", default=None)
    ap.add_argument("--cache", default=None, help="directory for rectified canvases")
    ap.add_argument("--long-side", type=int, default=2048)
    ap.add_argument("--caliber", type=float, default=T.BULLET_MM)
    ap.add_argument("--report", action="store_true", help="apply the fitted constants")
    a = ap.parse_args()

    rows = []
    per_photo = {}
    for name, holes in read_marks(a.marks).items():
        rec = rectify(os.path.join(os.path.expanduser(a.src), name + ".jpg"), a.long_side, a.cache)
        face = HP.Face(rec["center"][0], rec["center"][1], rec["px_per_mm"], a.caliber,
                       T.TARGETS["precision"]["black_mm"] / 2, PRECISION_RINGS_MM[-1], PRECISION_RINGS_MM)
        holes_here = [(x + rec["shift"], y + rec["shift"]) for x, y in holes]
        cands = HP.candidates(rec["gray"], face)
        labels, missed = match(cands, holes_here, face.d)
        for c, lab in zip(cands, labels):
            rows.append(dict(photo=name, label=lab, x=c["x"], y=c["y"], resp=round(c["resp"], 4),
                             **{k: round(v, 6) for k, v in c["features"].items()}))
        per_photo[name] = dict(holes=len(holes_here), missed=missed, cands=cands, labels=labels, face=face)
        print(f"{name} holes={len(holes_here)} cands={len(cands)} missed-by-stage={missed}", flush=True)

    if a.dst:
        keys = ["photo", "label", "x", "y", "resp", *HP.FEATURE_NAMES]
        with open(os.path.expanduser(a.dst), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        print("wrote", a.dst, len(rows), "candidates")

    if a.report:
        holes = sum(p["holes"] for p in per_photo.values())
        print(f"\n{len(per_photo)} photos, {holes} holes, stage misses {sum(p['missed'] for p in per_photo.values())}")
        print("  thr   recall  precision  FP/photo  exact")
        for thr in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
            tp = fp = exact = 0
            for p in per_photo.values():
                acc = [(HP.probability(c["features"]), c, lab) for c, lab in zip(p["cands"], p["labels"])]
                acc = sorted([t for t in acc if t[0] >= thr], key=lambda t: -t[0])
                kept = []
                for prob, c, lab in acc:
                    if any(math.hypot(c["x"] - k["x"], c["y"] - k["y"]) < HP.MERGE_RADIUS_D * p["face"].d for k, _ in kept):
                        continue
                    kept.append((c, lab))
                t_ = sum(1 for _, lab in kept if lab)
                f_ = len(kept) - t_
                tp += t_
                fp += f_
                if f_ == 0 and p["missed"] == 0 and t_ == p["holes"] and t_:
                    exact += 1
            print(f"  {thr:4.2f}  {tp / holes:6.1%}  {tp / max(1, tp + fp):8.1%}  {fp / len(per_photo):8.2f}  {exact:4d}")


if __name__ == "__main__":
    main()
