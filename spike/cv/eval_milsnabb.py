"""Measure closeup_lock's milsnabb model, and both models on the other face.

Photos are named in list files outside the repo (one path per line), and the
per-crop CSV is written outside it too: both carry photo names.

- milsnabb photos: the full photo under the milsnabb model is the reference
  when it passes its gate. Crops of the 9-10, 8-10 and 7-10 views (centred
  and off-centre) and of the 10 alone are cut around that centre, upsampled
  to 2048 px, and locked on their own. Crops with the centre out of frame are
  negatives, and so is every crop and the full photo under the precision
  model.
- precision photos: the disc lock is the reference, as in eval_closeup.py.
  Its crops, plus crops the size of the milsnabb views, run under the
  milsnabb model as negatives. With --identity they also run under the
  precision model and under a copy of the module from before the ring model
  (`--v0`), which must agree to the last bit.

docs/specs/cv-milsnabb-closeup-lock-2026-10.md reports the numbers.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import os
import sys
import time

import cv2
import numpy as np

import dataclasses

import closeup_lock as CL
import target_cv as T
from eval_closeup import apply, reference

# Half-widths in mm; a crop is 1.33 times as tall. The milsnabb photos are
# close-ups already (about +-125 mm across), so the widest view is +-120 mm.
MIL_VIEWS = (("10", 55.0), ("9-10", 100.0), ("9-10 wide", 120.0))
PRE_VIEWS = (("9-10", 55.0), ("8-10", 80.0), ("7-10", 110.0))
# (half-width, centre offset x, y) in mm: none of these has the centre in frame
MIL_OUTER = ((60.0, 0.0, 150.0), (60.0, 0.0, -150.0), (60.0, 70.0, 0.0), (60.0, -70.0, 0.0),
             (40.0, 0.0, 210.0), (40.0, 0.0, -210.0), (40.0, 55.0, 120.0), (40.0, -55.0, -120.0))
PRE_OUTER = ((80.0, 170.0, 0.0), (80.0, 0.0, 170.0), (80.0, -170.0, 0.0))


# The reference for the milsnabb crops: the lock on the full photo, held to
# the whole-circle yardstick on the 10 to 8 rings only. Its 50 and 90 mm
# rings were checked by eye (the spec says how); the gate's per-arc reading
# of the outer rings refuses it on most photos, because a stapled centre
# card sits up to ~2 mm off the face's own rings.
REFERENCE = dataclasses.replace(CL.MILSNABB, yardstick_mm=(25.0, 50.0, 90.0, 130.0), arcs=1)
REF_RADIUS_MM = 90.0


def crops(img, to_mm, views, outer, rng, trials):
    """(view, trial, crop, crop px -> original px) around to_mm's centre."""
    inv = np.linalg.inv(to_mm)
    c0 = apply(inv, np.array([[0.0, 0.0]]))[0]
    ppmm = 1.0 / np.sqrt(abs(np.linalg.det(to_mm[:2, :2])))
    h, w = img.shape[:2]
    specs = []
    for name, hw in views:
        for trial in range(trials):
            off = rng.uniform(-0.3, 0.3, 2) * hw if trial else np.zeros(2)
            specs.append((name, hw, trial, off))
    for hw, dx, dy in outer:
        specs.append(("outer", hw, "outer", np.array([dx, dy])))
    for name, hw, trial, off in specs:
        cx, cy = c0 + off * ppmm
        x0, x1 = int(cx - hw * ppmm), int(cx + hw * ppmm)
        y0, y1 = int(cy - 1.33 * hw * ppmm), int(cy + 1.33 * hw * ppmm)
        if x0 < 0 or y0 < 0 or x1 > w or y1 > h:
            continue
        crop = img[y0:y1, x0:x1]
        up = 2048.0 / max(crop.shape[:2])
        crop = cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
        yield name, trial, crop, np.array([[1 / up, 0, x0], [0, 1 / up, y0], [0, 0, 1]])
    yield "full", "full", img, np.eye(3)


def timed(mod, crop, model=None):
    t = time.time()
    lock = mod.lock_closeup(crop) if model is None else mod.lock_closeup(crop, model=model)
    return lock, round((time.time() - t) * 1000)


def describe(lock, gray, ref_crop, model):
    """The lock against the crop's printed lines and against the reference."""
    row = dict(passes=CL.passes_gate(lock), resid=round(lock.residual_mm, 2), comb=round(lock.comb, 1),
               self_off=None if lock.ring_offset_mm is None else round(lock.ring_offset_mm, 2),
               lines=lock.ring_lines, rings=lock.rings)
    lines = CL.circle_ridge(gray.astype(np.float64))
    # the precision report's whole-circle reading, for comparison
    circle, _ = CL.ring_offsets_n(lines, lock.to_mm, model.yardstick_mm)
    row["circle_off"] = None if circle is None else round(circle, 2)
    if ref_crop is not None:
        ref_off, _ = CL.ring_offsets_n(lines, ref_crop, model.yardstick_mm)
        row["ref_off"] = None if ref_off is None else round(ref_off, 2)
        row["center_mm"] = round(float(np.hypot(*apply(ref_crop, np.array([lock.center]))[0])), 2)
        ch, cw = gray.shape
        gx, gy = np.meshgrid(np.linspace(0, cw - 1, 25), np.linspace(0, ch - 1, 33))
        pts = np.stack([gx.ravel(), gy.ravel()], 1)
        r_ref = np.hypot(*apply(ref_crop, pts).T)
        r_est = np.hypot(*apply(lock.to_mm, pts).T)
        near = r_ref <= REF_RADIUS_MM
        row["r_err_med"] = round(float(np.median(np.abs(r_est - r_ref)[near])), 2) if near.any() else None
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--milsnabb", required=True, help="file listing milsnabb photo paths")
    ap.add_argument("--precision", help="file listing other target photo paths")
    ap.add_argument("--out", required=True)
    ap.add_argument("--identity", action="store_true")
    ap.add_argument("--v0", help="closeup_lock.py from before the ring model")
    ap.add_argument("--trials", type=int, default=3)
    a = ap.parse_args()
    v0 = None
    if a.v0:
        spec = importlib.util.spec_from_file_location("closeup_lock_v0", a.v0)
        v0 = importlib.util.module_from_spec(spec)
        sys.modules["closeup_lock_v0"] = v0
        spec.loader.exec_module(v0)
    rng = np.random.default_rng(7)
    rows = []

    def emit(row):
        rows.append(row)
        print(row, flush=True)

    for p in [s.strip() for s in open(a.milsnabb) if s.strip()]:
        img = T.load(p, 2048)
        full, _ = timed(CL, img, REFERENCE)
        ref = full.to_mm if CL.passes_gate(full) else None
        name = os.path.basename(p)
        if ref is None:
            emit(dict(set="milsnabb", photo=name, view="full", trial="full", model="milsnabb",
                      status="none" if full is None else "lock",
                      **({} if full is None else describe(full, cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), None,
                                                          CL.MILSNABB))))
            for model, mname in ((CL.PRECISION, "precision"),):
                lock, ms = timed(CL, img, model)
                emit(dict(set="milsnabb", photo=name, view="full", trial="full", model=mname, ms=ms,
                          status="none" if lock is None else "lock",
                          **({} if lock is None else describe(lock, cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),
                                                              None, model))))
            continue
        for view, trial, crop, back in crops(img, ref, MIL_VIEWS, MIL_OUTER, rng, a.trials):
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            for model, mname in ((CL.MILSNABB, "milsnabb"), (CL.PRECISION, "precision")):
                lock, ms = timed(CL, crop, model)
                row = dict(set="milsnabb", photo=name, view=view, trial=trial, model=mname, ms=ms,
                           status="none" if lock is None else "lock")
                if lock is not None:
                    row.update(describe(lock, gray, ref @ back if mname == "milsnabb" else None, model))
                emit(row)

    if a.precision:
        for p in [s.strip() for s in open(a.precision) if s.strip()]:
            name = os.path.basename(p)
            try:
                img = T.load(p, 2048)
                ref = reference(img)
            except (SystemExit, cv2.error, ValueError):
                ref = None
            if ref is None:
                lock, ms = timed(CL, img, CL.MILSNABB)
                emit(dict(set="other", photo=name, view="full", trial="full", model="milsnabb", ms=ms,
                          status="none" if lock is None else "lock",
                          passes=bool(lock is not None and CL.passes_gate(lock))))
                continue
            seen = set()
            for views, outer in ((PRE_VIEWS, PRE_OUTER), (MIL_VIEWS[1:], ())):
                for view, trial, crop, back in crops(img, ref, views, outer, rng, 2):
                    key = (view, trial, crop.shape)
                    if view == "full" and "full" in seen:
                        continue
                    seen.add(view if view == "full" else key)
                    lock, ms = timed(CL, crop, CL.MILSNABB)
                    row = dict(set="precision", photo=name, view=view if outer else "mil-" + view,
                               trial=trial, model="milsnabb", ms=ms, status="none" if lock is None else "lock",
                               passes=bool(lock is not None and CL.passes_gate(lock)))
                    if a.identity and outer:
                        new = CL.lock_closeup(crop)
                        old = v0.lock_closeup(crop)
                        same = (new is None and old is None) or (
                            new is not None and old is not None and np.array_equal(new.to_mm, old.to_mm)
                            and new.residual_mm == old.residual_mm and new.comb == old.comb
                            and new.ring_offset_mm == old.ring_offset_mm
                            and CL.passes_gate(new) == v0.passes_gate(old))
                        row["identical"] = same
                        row["pre_passes"] = bool(new is not None and CL.passes_gate(new))
                    emit(row)

    keys = []
    for r in rows:
        keys += [k for k in r if k not in keys]
    with open(a.out, "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=keys)
        wr.writeheader()
        wr.writerows(rows)


if __name__ == "__main__":
    main()
