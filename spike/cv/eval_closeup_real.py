"""Run both locks on real photos, with no reference to score them against.

`eval_closeup.py` cuts close-ups out of photos the disc lock handles and uses
that lock as the truth. A real close-up has no such truth, so here each photo
gets both locks, the app's choice between them (`chooseLock` in
closeup-lock.ts), both held to the same ring-offset yardstick, and an overlay
of each lock's rings numbered by value. Whether a lock is right is then read
off the overlay: a ring drawn on the wrong printed line, or between two, is a
false lock that the yardstick alone cannot see.
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
from closeup_lock import circle_ridge, lock_closeup, passes_gate, ring_offsets, work_image
from eval_closeup import apply, reference

RINGS = {10: 25.0, 9: 50.0, 8: 75.0, 7: 100.0, 6: 125.0, 5: 150.0, 4: 175.0}
DISC_COLOUR = (255, 0, 255)
CLOSEUP_COLOUR = (255, 255, 0)


# A close-up lock at a whole-number multiple of the ring step reads 1/2, 1/3
# or 1/4 of the disc lock's mm per px; the disc lock is never off by such a
# factor, so when both pass, that ratio vetoes the close-up (chooseLock).
SCALE_VETO = (1 / 2, 1 / 3, 1 / 4)
SCALE_VETO_TOL = 0.06


def scale_vetoed(disc, closeup) -> bool:
    r = local_scale(closeup.to_mm, closeup.center) / local_scale(disc, closeup.center)
    return any(abs(r / f - 1) <= SCALE_VETO_TOL for f in SCALE_VETO)


def choose(disc, disc_off: float | None, closeup) -> str | None:
    """`chooseLock` in closeup-lock.ts. `disc` is the disc lock's image px ->
    mm when it passed its gate, else None."""
    closeup_passes = passes_gate(closeup)
    if disc is None:
        return "closeup" if closeup_passes else None
    if not closeup_passes or scale_vetoed(disc, closeup):
        return "disc"
    d = np.inf if disc_off is None else disc_off
    c = np.inf if closeup.ring_offset_mm is None else closeup.ring_offset_mm
    return "closeup" if c < d else "disc"


def local_scale(to_mm, at) -> float:
    """mm per image px near `at`, from the Jacobian of the homography."""
    p = np.array([at, (at[0] + 1.0, at[1]), (at[0], at[1] + 1.0)])
    q = apply(to_mm, p)
    return float(np.sqrt(abs(np.linalg.det(np.stack([q[1] - q[0], q[2] - q[0]])))))


def in_frame(to_mm, R, shape) -> float:
    """Share of the mm circle of radius R that lies inside the photo."""
    ang = np.linspace(0, 2 * np.pi, 360, endpoint=False)
    px = apply(np.linalg.inv(to_mm), np.stack([R * np.cos(ang), R * np.sin(ang)], 1))
    h, w = shape[:2]
    return float(((px[:, 0] >= 0) & (px[:, 0] < w) & (px[:, 1] >= 0) & (px[:, 1] < h)).mean())


def draw(img, to_mm, colour, tag, y_text):
    inv = np.linalg.inv(to_mm)
    ang = np.linspace(0, 2 * np.pi, 361)
    h, w = img.shape[:2]
    for value, R in RINGS.items():
        pts = apply(inv, np.stack([R * np.cos(ang), R * np.sin(ang)], 1))
        cv2.polylines(img, [pts.astype(np.int32)], False, colour, 2, cv2.LINE_AA)
        # the ring's value just inside its line, at 45 degrees, where the
        # printed numbers (on the axes) are not
        for a in (np.pi / 4, 5 * np.pi / 4):
            x, y = apply(inv, np.array([[(R - 12.5) * np.cos(a), (R - 12.5) * np.sin(a)]]))[0]
            if 0 <= x < w and 0 <= y < h:
                cv2.putText(img, str(value), (int(x) - 12, int(y) + 12), cv2.FONT_HERSHEY_SIMPLEX,
                            1.1, colour, 3, cv2.LINE_AA)
    cv2.putText(img, tag, (20, y_text), cv2.FONT_HERSHEY_SIMPLEX, 1.4, colour, 3, cv2.LINE_AA)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--glob", action="append", required=True)
    ap.add_argument("--out", required=True, help="directory: results.csv and overlays/")
    a = ap.parse_args()
    paths = sorted(p for g in a.glob for p in glob.glob(os.path.expanduser(g)))
    os.makedirs(os.path.join(a.out, "overlays"), exist_ok=True)
    os.makedirs(os.path.join(a.out, "locks"), exist_ok=True)
    rows = []
    for p in paths:
        name = os.path.splitext(os.path.basename(p))[0]
        row = dict(photo=name, source=os.path.basename(os.path.dirname(os.path.dirname(p))))
        try:
            img = T.load(p, 2048)
        except SystemExit:
            row.update(status="unreadable")
            rows.append(row)
            continue
        try:
            disc = reference(img)
        except (cv2.error, ValueError):
            disc = None
        t = time.time()
        closeup = lock_closeup(img)
        ms = (time.time() - t) * 1000
        g, S = work_image(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
        lines = circle_ridge(g)
        disc_off = None if disc is None else ring_offsets(lines, disc @ np.linalg.inv(S))
        chosen = choose(disc, disc_off, closeup)
        row.update(
            disc="pass" if disc is not None else "fail",
            disc_off=None if disc_off is None else round(disc_off, 2),
            closeup="none" if closeup is None else ("pass" if passes_gate(closeup) else "fail"),
            closeup_off=None if closeup is None or closeup.ring_offset_mm is None else round(closeup.ring_offset_mm, 2),
            resid=None if closeup is None else round(closeup.residual_mm, 2),
            comb=None if closeup is None else round(float(closeup.comb), 1),
            rings=None if closeup is None else closeup.rings,
            ms=round(ms),
            chosen=chosen,
            vetoed=bool(disc is not None and passes_gate(closeup) and scale_vetoed(disc, closeup)),
        )
        if disc is not None and closeup is not None:
            # where the two locks put the centre and the 10 ring, compared in
            # the disc lock's mm
            c = apply(disc, np.array([closeup.center]))[0]
            row["centre_gap_mm"] = round(float(np.hypot(*c)), 2)
            # mm per px of each, at the close-up's centre: ~1 when they agree,
            # ~2 or ~3 when the close-up locked onto every second or third line
            row["scale_ratio"] = round(local_scale(closeup.to_mm, closeup.center)
                                       / local_scale(disc, closeup.center), 3)
        chosen_to_mm = disc if chosen == "disc" else closeup.to_mm if chosen and closeup else None
        if chosen_to_mm is not None:
            # a close-up is a photo without most of the black's edge (the 7 ring)
            row["ring7_in_frame"] = round(in_frame(chosen_to_mm, RINGS[7], img.shape), 2)
        over = img.copy()
        if disc is not None:
            draw(over, disc, DISC_COLOUR, f"disc {row['disc']} off={row['disc_off']}", 50)
        if closeup is not None:
            draw(over, closeup.to_mm, CLOSEUP_COLOUR,
                 f"closeup {row['closeup']} off={row['closeup_off']} res={row['resid']} comb={row['comb']}", 100)
        cv2.putText(over, f"chosen: {chosen}", (20, 150), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 255, 0), 3, cv2.LINE_AA)
        cv2.imwrite(os.path.join(a.out, "overlays", f"{row['source']}__{name}.jpg"), over,
                    [cv2.IMWRITE_JPEG_QUALITY, 85])
        np.savez(os.path.join(a.out, "locks", f"{row['source']}__{name}.npz"),
                 disc=disc if disc is not None else np.zeros(0),
                 closeup=closeup.to_mm if closeup is not None else np.zeros(0))
        rows.append(row)
        print(row, flush=True)
    keys = list(dict.fromkeys(k for r in rows for k in r))
    with open(os.path.join(a.out, "results.csv"), "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=keys)
        wr.writeheader()
        wr.writerows(rows)


if __name__ == "__main__":
    sys.exit(main())
