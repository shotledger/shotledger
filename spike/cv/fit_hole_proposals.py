"""Fit the logistic regression behind the proposal stage — the script that
produced `hole_proposals.WEIGHTS`.

    python fit_hole_proposals.py candidates.csv            # 5-fold by photo, then the fit
    python fit_hole_proposals.py a.csv --test b.csv        # generalisation across corpora

Input is `eval_hole_proposals.py`'s candidates file. Same estimator as
`fit_hole_filter.py` (Newton, small ridge, standardised then folded back to
raw scale) so the constants apply to raw features. Unlike that script the
report here merges accepted peaks closer than one hole diameter, as the stage
does, so a hole that produced two peaks is not a false positive.
"""
from __future__ import annotations

import argparse
import csv
import math
import os
import re

import numpy as np

from fit_hole_filter import auc, fit
import hole_proposals as HP
import target_cv as T


def load(path):
    rows = list(csv.DictReader(open(os.path.expanduser(path))))
    x = np.array([[float(r[k]) for k in HP.FEATURE_NAMES] for r in rows])
    y = np.array([float(r["label"]) for r in rows])
    photos = np.array([r["photo"] for r in rows])
    xy = np.array([[float(r["x"]), float(r["y"])] for r in rows])
    return dict(name=os.path.basename(path), x=x, y=y, photos=photos, xy=xy)


def report(label, c, scores, holes_per_photo, d):
    photos = sorted(set(c["photos"]))
    holes = sum(holes_per_photo.values())
    print(f"\n{label}: {len(c['y'])} candidates, {int(c['y'].sum())} on holes, {holes} holes, "
          f"{len(photos)} photos, AUC {auc(scores, c['y']):.3f}")
    print("  thr   recall  precision  FP/photo  exact")
    for thr in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
        tp = fp = exact = 0
        for p in photos:
            idx = np.nonzero((c["photos"] == p) & (scores >= thr))[0]
            idx = idx[np.argsort(-scores[idx])]
            kept = []
            for i in idx:
                if any(math.hypot(c["xy"][i][0] - c["xy"][j][0], c["xy"][i][1] - c["xy"][j][1]) < HP.MERGE_RADIUS_D * d
                       for j in kept):
                    continue
                kept.append(i)
            t_ = int(sum(c["y"][i] for i in kept))
            f_ = len(kept) - t_
            tp += t_
            fp += f_
            if f_ == 0 and t_ == holes_per_photo[p] and t_:
                exact += 1
        print(f"  {thr:4.2f}  {tp / holes:6.1%}  {tp / max(1, tp + fp):8.1%}  {fp / len(photos):8.2f}  {exact:4d}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("train", nargs="+")
    ap.add_argument("--test", action="append", default=[])
    ap.add_argument("--marks", required=True, help="the marks file, for the per-photo hole counts")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--px-per-mm", type=float, default=4.0)
    a = ap.parse_args()
    d = T.BULLET_MM * a.px_per_mm
    holes_per_photo = {}
    for line in open(os.path.expanduser(a.marks)):
        parts = line.split()
        if parts:
            holes_per_photo[parts[0]] = len(parts) - 1

    parts = [load(p) for p in a.train]
    train = dict(name="+".join(p["name"] for p in parts),
                 x=np.vstack([p["x"] for p in parts]), y=np.concatenate([p["y"] for p in parts]),
                 photos=np.concatenate([p["photos"] for p in parts]), xy=np.vstack([p["xy"] for p in parts]))
    photos = sorted(set(train["photos"]))
    rng = np.random.default_rng(a.seed)
    rng.shuffle(photos)
    folds = [set(photos[i::a.folds]) for i in range(a.folds)]
    cv = np.zeros(len(train["y"]))
    for fold in folds:
        held = np.array([p in fold for p in train["photos"]])
        w, b = fit(train["x"][~held], train["y"][~held])
        cv[held] = 1 / (1 + np.exp(-(train["x"][held] @ w + b)))
    report(f"{train['name']} {a.folds}-fold by photo", train, cv,
           {p: holes_per_photo[p] for p in set(train["photos"])}, d)

    w, b = fit(train["x"], train["y"])
    print("\nfitted constants (raw feature scale):")
    print("WEIGHTS = {")
    for k, v in zip(HP.FEATURE_NAMES, w):
        print(f'    "{k}": {v:.6f},')
    print("}")
    print(f"BIAS = {b:.6f}")

    for path in a.test:
        held = load(path)
        report(f"{held['name']} HELD OUT", held, 1 / (1 + np.exp(-(held["x"] @ w + b))),
               {p: holes_per_photo[p] for p in set(held["photos"])}, d)


if __name__ == "__main__":
    main()
