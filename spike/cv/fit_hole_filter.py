"""Fit and evaluate the hole/patch filter — the script that produced the
constants in `hole_filter.WEIGHTS`.

Input is one or more `candidates.csv` from `score_stages.py`, which already
carries each candidate's label (does it sit on a hand-marked hole), its
features, and one `cand = -1` row per photo holding that photo's miss count.
Recall is therefore against **holes**, not against candidates the detector
happened to propose.

Logistic regression is fitted with plain numpy — Newton's method, small L2
ridge, on standardised features — and the standardisation is then folded back
into the weights, so the constants apply to raw features, which is the form
`hole_filter.probability` and the TypeScript port both use.

    # cross-validated, pooled: what the shipped constants are fitted on
    python fit_hole_filter.py --stage tight pooled.csv

    # generalisation: fit on the first, report on the second, never seen
    python fit_hole_filter.py --stage tight contributed.csv --test maintainer.csv

`--stage` picks which proposal stage's candidates to fit behind; `tight` is
the shipped one. Results for every stage are in
docs/specs/cv-corpus-validation-2026-09.md section 5.
"""

from __future__ import annotations

import argparse
import csv
import os

import numpy as np

from hole_filter import FEATURE_NAMES


def load(path: str, stage: str):
    """Candidates for one stage, plus the per-photo miss counts."""
    rows = [r for r in csv.DictReader(open(os.path.expanduser(path)))
            if r["stage"] == stage]
    missed = {r["photo"]: int(float(r["r_mm"])) for r in rows if r["cand"] == "-1"}
    # A candidate at the canvas edge has no crop, so it has no features and
    # never reaches the filter; it stays out of both fit and report.
    cands = [r for r in rows if r["cand"] != "-1" and r["edge"] == "0"]
    x = np.array([[float(r[k]) for k in FEATURE_NAMES] for r in cands])
    y = np.array([float(r["label"]) for r in cands])
    photos = np.array([r["photo"] for r in cands])
    return dict(name=os.path.basename(path), x=x, y=y, photos=photos, missed=missed)


def auc(scores, y) -> float:
    order = np.argsort(scores)
    ranks = np.empty(len(scores), float)
    ranks[order] = np.arange(1, len(scores) + 1)
    s = np.asarray(scores)
    for v in np.unique(s):
        m = s == v
        if m.sum() > 1:
            ranks[m] = ranks[m].mean()
    npos, nneg = int(y.sum()), int((1 - y).sum())
    if npos == 0 or nneg == 0:
        return float("nan")
    return float((ranks[y == 1].sum() - npos * (npos + 1) / 2) / (npos * nneg))


def fit(x, y, ridge=1e-2, iters=50):
    """Newton's method on standardised features; returns raw-scale (w, b)."""
    mu, sd = x.mean(axis=0), x.std(axis=0) + 1e-9
    z = (x - mu) / sd
    a = np.hstack([z, np.ones((len(z), 1))])
    w = np.zeros(a.shape[1])
    reg = np.eye(a.shape[1]) * ridge
    reg[-1, -1] = 0.0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(a @ w)))
        grad = a.T @ (p - y) + reg @ w
        hess = (a * (p * (1 - p))[:, None]).T @ a + reg
        step = np.linalg.solve(hess, grad)
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return w[:-1] / sd, w[-1] - (w[:-1] * mu / sd).sum()


def report(label: str, corpus: dict, scores) -> None:
    photos = sorted(set(corpus["photos"]) | set(corpus["missed"]))
    holes = int(corpus["y"].sum()) + sum(corpus["missed"].values())
    print(f"\n{label}: {len(corpus['y'])} candidates, {int(corpus['y'].sum())} on holes, "
          f"{holes} holes, {len(photos)} photos, AUC {auc(scores, corpus['y']):.3f}")
    print("  thr   recall  precision  FP/photo  exact")
    for thr in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        keep = scores >= thr
        tp = int((keep & (corpus["y"] == 1)).sum())
        fp = int((keep & (corpus["y"] == 0)).sum())
        exact = 0
        for p in photos:
            m = corpus["photos"] == p
            t = int((keep & m & (corpus["y"] == 1)).sum())
            f = int((keep & m & (corpus["y"] == 0)).sum())
            if f == 0 and corpus["missed"].get(p, 0) == 0 and t == int(corpus["y"][m].sum()) and t:
                exact += 1
        print(f"  {thr:4.2f}  {tp / holes:6.1%}  {tp / max(1, tp + fp):8.1%}  "
              f"{fp / len(photos):8.2f}  {exact:4d}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("train", nargs="+", help="candidates.csv from score_stages.py")
    ap.add_argument("--test", action="append", default=[],
                    help="held out: reported, never fitted on")
    ap.add_argument("--stage", default="tight", help="which proposal stage to fit behind")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    parts = [load(p, a.stage) for p in a.train]
    train = dict(
        name="+".join(p["name"] for p in parts),
        x=np.vstack([p["x"] for p in parts]),
        y=np.concatenate([p["y"] for p in parts]),
        photos=np.concatenate([p["photos"] for p in parts]),
        missed={k: v for p in parts for k, v in p["missed"].items()},
    )

    # Folds split BY PHOTO: crops from one photo share lighting, paper and
    # patches, so splitting by candidate would leak and flatter the score.
    photos = sorted(set(train["photos"]))
    rng = np.random.default_rng(a.seed)
    rng.shuffle(photos)
    folds = [set(photos[i::a.folds]) for i in range(a.folds)]
    cv = np.zeros(len(train["y"]))
    for fold in folds:
        held = np.array([p in fold for p in train["photos"]])
        w, b = fit(train["x"][~held], train["y"][~held])
        cv[held] = 1 / (1 + np.exp(-(train["x"][held] @ w + b)))
    report(f"{train['name']} [{a.stage}] {a.folds}-fold by photo", train, cv)

    w, b = fit(train["x"], train["y"])
    print("\nfitted constants (raw feature scale):")
    for k, v in zip(FEATURE_NAMES, w):
        print(f"  {k:18s} {v:+.4f}")
    print(f"  {'bias':18s} {b:+.4f}")

    for path in a.test:
        held = load(path, a.stage)
        report(f"{held['name']} [{a.stage}] HELD OUT", held,
               1 / (1 + np.exp(-(held["x"] @ w + b))))


if __name__ == "__main__":
    main()
