"""Measure closeup_lock on close-ups cut from photos the disc lock handles.

For every photo whose disc lock passes the gate, that lock is the reference.
Crops of a few sizes around (and off) the centre stand in for a close-up; the
close-up lock runs on the crop alone and is scored by the error in *radius*
(mm from the centre), which is what decides a ring -- rotation is ignored.

A crop is upsampled from the photo, so it is blurrier than a real close-up
taken from nearer: the numbers here are on the pessimistic side.
"""
from __future__ import annotations

import argparse
import csv
import glob
import os
import sys
import time

import cv2
import numpy as np

import target_cv as T
from closeup_lock import lock_closeup

HALF_WIDTHS_MM = (55.0, 80.0, 110.0)


def reference(img):
    ellipse, partial, _ = T.find_face(img)
    kind = T.guess_kind(img, ellipse)
    if kind != "precision":
        return None
    rect, geom = T.build_geom(img, ellipse, kind, partial)
    geom = T.refine_geom(rect, geom, kind)
    if T.check_geometry_validity(T.gate_metrics(img, ellipse, rect, geom, kind)):
        return None
    k = 1.0 / geom.px_per_mm
    to_mm = np.array([[k, 0, -geom.center[0] * k], [0, k, -geom.center[1] * k], [0, 0, 1]]) @ geom.H
    return to_mm


def ring_offsets(gray, to_mm, radii=(25.0, 50.0, 75.0), win=3.0, step=0.1):
    """A yardstick any lock can be held to: per ring, the radial offset (mm)
    at which the thin-line response along that lock's circle peaks. Rings
    mostly out of frame are skipped. Max |offset| over the rings measured."""
    g = gray.astype(np.float32)
    ridge = np.abs(g - cv2.GaussianBlur(g, (0, 0), 4))
    inv = np.linalg.inv(to_mm)
    h, w = g.shape
    ang = np.linspace(0, 2 * np.pi, 360, endpoint=False)
    worst, n = 0.0, 0
    for R in radii:
        mm = np.stack([R * np.cos(ang), R * np.sin(ang)], 1)
        px = apply(inv, mm)
        ok = (px[:, 0] >= 0) & (px[:, 0] < w - 1) & (px[:, 1] >= 0) & (px[:, 1] < h - 1)
        if ok.mean() < 0.3:
            continue
        a = ang[ok]
        best, bo = -1.0, 0.0
        for o in np.arange(-win, win + 1e-9, step):
            pm = np.stack([(R + o) * np.cos(a), (R + o) * np.sin(a)], 1)
            pp = apply(inv, pm).astype(np.float32)
            v = float(cv2.remap(ridge, pp[:, :1].copy(), pp[:, 1:].copy(), cv2.INTER_LINEAR).mean())
            if v > best:
                best, bo = v, o
        worst = max(worst, abs(bo))
        n += 1
    return worst if n else None


def apply(M, pts):
    q = M @ np.vstack([pts.T, np.ones(len(pts))])
    return (q[:2] / q[2]).T


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--glob", action="append", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    paths = sorted(p for g in a.glob for p in glob.glob(os.path.expanduser(g)))
    if a.limit:
        paths = paths[: a.limit]
    rng = np.random.default_rng(7)
    rows = []
    for p in paths:
        try:
            img = T.load(p, 2048)
            ref = reference(img)
        except (SystemExit, cv2.error, ValueError):
            continue
        if ref is None:
            continue
        inv = np.linalg.inv(ref)
        c0 = apply(inv, np.array([[0.0, 0.0]]))[0]
        ppmm = 1.0 / np.sqrt(abs(np.linalg.det(ref[:2, :2])))
        h, w = img.shape[:2]
        specs = []
        for hw in HALF_WIDTHS_MM:
            for trial in range(2):
                off = rng.uniform(-0.3, 0.3, 2) * hw if trial else np.zeros(2)
                specs.append((hw, trial, off))
        # Negatives: the centre is out of frame (a photo of the outer rings),
        # so any lock is a false one and the gate has to refuse it.
        for d in ((170.0, 0.0), (0.0, 170.0), (-170.0, 0.0)):
            specs.append((80.0, "outer", np.array(d)))
        specs.append((0.0, "full", None))
        for hw, trial, off in specs:
            if True:
                if off is None:
                    x0, y0, x1, y1 = 0, 0, w, h
                else:
                    cx, cy = c0 + off * ppmm
                    x0, x1 = int(cx - hw * ppmm), int(cx + hw * ppmm)
                    y0, y1 = int(cy - 1.33 * hw * ppmm), int(cy + 1.33 * hw * ppmm)
                if x0 < 0 or y0 < 0 or x1 > w or y1 > h:
                    continue
                crop = img[y0:y1, x0:x1]
                up = 2048.0 / max(crop.shape[:2])
                crop = cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
                t = time.time()
                lock = lock_closeup(crop)
                ms = (time.time() - t) * 1000
                # crop px -> original px
                back = np.array([[1 / up, 0, x0], [0, 1 / up, y0], [0, 0, 1]])
                row = dict(photo=os.path.basename(p), half_mm=hw, trial=trial, ms=round(ms))
                if lock is None:
                    row.update(status="none")
                else:
                    ch, cw = crop.shape[:2]
                    gx, gy = np.meshgrid(np.linspace(0, cw - 1, 25), np.linspace(0, ch - 1, 33))
                    pts = np.stack([gx.ravel(), gy.ravel()], 1)
                    r_ref = np.hypot(*apply(ref @ back, pts).T)
                    r_est = np.hypot(*apply(lock.to_mm, pts).T)
                    near = r_ref <= 60.0
                    err = np.abs(r_est - r_ref)[near]
                    cerr = float(np.hypot(*apply(ref @ back, np.array([lock.center]) * 1.0)[0]))
                    gcrop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                    own = ring_offsets(gcrop, lock.to_mm)
                    theirs = ring_offsets(gcrop, ref @ back)
                    row.update(status="lock", center_mm=round(cerr, 2),
                               ring_off=None if own is None else round(own, 2),
                               ref_ring_off=None if theirs is None else round(theirs, 2),
                               r_err_med=round(float(np.median(err)), 2) if len(err) else "",
                               r_err_max=round(float(err.max()), 2) if len(err) else "",
                               scale=round(float(np.sqrt(abs(np.linalg.det((ref @ back)[:2, :2]) / np.linalg.det(lock.to_mm[:2, :2])))), 3),
                               self_off=None if lock.ring_offset_mm is None else round(lock.ring_offset_mm, 2),
                               rings=lock.rings, support=round(lock.support, 2), resid=round(lock.residual_mm, 2),
                               comb=round(lock.comb, 1), axis=round(lock.axis_ratio, 3))
                rows.append(row)
                print(row, flush=True)
    keys = sorted({k for r in rows for k in r}, key=lambda k: list(rows[0]).index(k) if k in rows[0] else 99)
    with open(a.out, "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=keys)
        wr.writeheader()
        wr.writerows(rows)


if __name__ == "__main__":
    sys.exit(main())
