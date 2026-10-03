"""The Python disc lock (target_cv) on the same PGMs as disc.parity.ts, then the diff.

    python parity_closeup.py prep <out-dir> <photo>...   # photos -> 2048 px greyscale PGMs
    python parity_disc.py run  <pgm-dir> <out.jsonl>     # target_cv's disc lock on each
    python parity_disc.py diff <python.jsonl> <ts.jsonl> [canvasToMm]  # where the two disagree

`run` needs spike/cv on PYTHONPATH. `find_face` reads BGR, so each grey PGM is
widened to three equal channels, which its BGR -> grey turns back into the
same grey. The face is taken as precision, as the app does for a precision
session; `guess_kind`'s verdict is recorded but not used.

The TypeScript is a port, not a transcription: it fits with `fitEllipse`
(`fitEllipseDirect` is missing on the device), skips the 7 px pre-blur, and
samples the radial profile with `warpPolar` and a box high-pass. So this
measures how far the app's lock sits from the reference the corpus numbers
were taken with, not a bit-for-bit port.
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np

from parity_closeup import TOL_MM, radius_gap

# validity.ts's metric names, from gate_metrics' keys
METRICS = dict(axis_ratio="axisRatio", zone_fraction="zoneFraction", center_in="centerInFrame",
               zone_contrast="zoneContrastGray", profile_score="profileScore")


def run(src, out):
    import cv2
    import target_cv as T

    with open(out, "w") as f:
        for name in sorted(n for n in os.listdir(src) if n.endswith(".pgm")):
            g = cv2.imread(os.path.join(src, name), cv2.IMREAD_GRAYSCALE)
            img = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
            row: dict = dict(photo=name[:-4], error=None, toMm=None, metrics=None, valid=False, reasons=None)
            t0 = time.time()
            try:
                ellipse, partial, _ = T.find_face(img)
                row["kind"] = T.guess_kind(img, ellipse)
                rect, geom = T.build_geom(img, ellipse, "precision", partial)
                geom = T.refine_geom(rect, geom, "precision")
                m = T.gate_metrics(img, ellipse, rect, geom, "precision")
                reasons = T.check_geometry_validity(m)
                k = 1.0 / geom.px_per_mm
                to_mm = np.array([[k, 0, -geom.center[0] * k], [0, k, -geom.center[1] * k], [0, 0, 1]]) @ geom.H
                to_mm = to_mm / to_mm[2, 2]
                (cx, cy), (d1, d2), ang = ellipse
                row.update(toMm=[float(v) for v in to_mm.ravel()],
                           ellipse=dict(x=cx, y=cy, minor=min(d1, d2), major=max(d1, d2), angle=ang),
                           metrics={METRICS[k]: v for k, v in m.items()}, valid=not reasons, reasons=reasons)
            except (SystemExit, cv2.error, ValueError) as e:
                row["error"] = str(e)
            row["ms"] = round((time.time() - t0) * 1000)
            f.write(json.dumps(row) + "\n")


def diff(py_path, ts_path, key="toMm"):
    """`key` picks the TypeScript mapping: `toMm`, the transform the overlay
    and chooseLock use, or `canvasToMm`, the canvas tap-snap and the hole
    proposals read."""
    py = {r["photo"]: r for r in map(json.loads, open(py_path))}
    ts = {r["photo"]: dict(r, toMm=r[key]) for r in map(json.loads, open(ts_path))}
    both = sorted(set(py) & set(ts))
    agree, gate_diff, lock_diff, off, gaps = 0, [], [], [], []
    print(f"TypeScript mapping: {key}")
    print(f"{'photo':16} {'py':>5} {'ts':>5} {'gap mm':>7}  metric deltas (ts - py)")
    for k in both:
        a, b = py[k], ts[k]
        if (a["toMm"] is None) != (b["toMm"] is None):
            lock_diff.append(k)
            print(f"{k[:16]:16} {'-' if a['toMm'] is None else 'lock':>5} {'-' if b['toMm'] is None else 'lock':>5}")
            continue
        if a["valid"] != b["valid"]:
            gate_diff.append((k, a["reasons"], b["reasons"]))
        if a["toMm"] is None:
            agree += 1
            continue
        g = radius_gap(a["toMm"], b["toMm"])
        gaps.append(g)
        if g > TOL_MM:
            off.append((k, round(g, 3)))
        else:
            agree += 1
        ma, mb = a["metrics"], b["metrics"]
        deltas = " ".join(f"{n}={mb[n] - ma[n]:+.2f}" for n in ("axisRatio", "zoneFraction", "zoneContrastGray",
                                                                  "profileScore"))
        flag = lambda r: "pass" if r["valid"] else "FAIL"
        print(f"{k[:16]:16} {flag(a):>5} {flag(b):>5} {g:7.3f}  {deltas}")
    ms_py = sum(py[k]["ms"] for k in both) / max(1, len(both))
    ms_ts = sum(ts[k]["ms"] for k in both) / max(1, len(both))
    print(f"\n{len(both)} photos; {agree} agree within {TOL_MM} mm; mean ms python {ms_py:.0f}, ts {ms_ts:.0f}")
    if gaps:
        q = np.percentile(gaps, [50, 90, 100])
        print(f"radius gap mm over {len(gaps)} pairs: median {q[0]:.3f}, p90 {q[1]:.3f}, max {q[2]:.3f}")
    print(f"only one side locked: {len(lock_diff)} {lock_diff[:10]}")
    print(f"gate verdict differs: {len(gate_diff)} {gate_diff[:10]}")
    print(f"rings differ > {TOL_MM} mm: {len(off)} {sorted(off, key=lambda t: -t[1])[:10]}")
    only = sorted(set(py) ^ set(ts))
    if only:
        print(f"in one file only: {len(only)} {only[:10]}")
    return 0 if not (lock_diff or gate_diff or off or only) else 1


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "run":
        run(sys.argv[2], sys.argv[3])
    elif cmd == "diff":
        sys.exit(diff(*sys.argv[2:5]))
    else:
        print(__doc__)
        sys.exit(2)
