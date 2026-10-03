"""The Python close-up lock on the same PGMs as closeup.parity.ts, then the diff.

    python parity_closeup.py prep <out-dir> <photo>...      # photos -> 2048 px greyscale PGMs
    python parity_closeup.py run  <pgm-dir> <out.jsonl>     # the reference lock on each
    python parity_closeup.py diff <python.jsonl> <ts.jsonl>  # where the two disagree

`prep` uses ImageMagick, so both implementations read identical pixels. Run
`run` with the reference to measure on PYTHONPATH (e.g. spike/cv).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

import numpy as np

# Agreement: mm of radius on the yardstick rings, and the gate's own numbers.
TOL_MM = 0.05


def prep(out, photos):
    os.makedirs(out, exist_ok=True)
    for p in photos:
        name = os.path.splitext(os.path.basename(p))[0]
        dst = os.path.join(out, name + ".pgm")
        if not os.path.exists(dst):
            subprocess.run(["magick", p + "[0]", "-auto-orient", "-resize", "2048x2048>", "-colorspace", "Gray",
                            "-depth", "8", dst], check=True)


def run(src, out):
    import cv2
    import closeup_lock as CL

    with open(out, "w") as f:
        for name in sorted(n for n in os.listdir(src) if n.endswith(".pgm")):
            g = cv2.imread(os.path.join(src, name), cv2.IMREAD_GRAYSCALE)
            t0 = time.time()
            lock = CL.lock_closeup(g)
            row: dict = dict(photo=name[:-4], ms=round((time.time() - t0) * 1000), lock=None)
            if lock is not None:
                row["lock"] = dict(toMm=[float(v) for v in lock.to_mm.ravel()], residualMm=lock.residual_mm,
                                   comb=float(lock.comb), ringOffsetMm=lock.ring_offset_mm, rings=lock.rings,
                                   passes=CL.passes_gate(lock))
            f.write(json.dumps(row) + "\n")


def radius_gap(a, b):
    """Worst disagreement in mm, over points the two locks put on the 25, 50
    and 75 mm rings (mapped back through the other lock)."""
    A, B = np.array(a).reshape(3, 3), np.array(b).reshape(3, 3)
    ang = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    worst = 0.0
    for R in (25.0, 50.0, 75.0):
        mm = np.stack([R * np.cos(ang), R * np.sin(ang), np.ones_like(ang)])
        px = np.linalg.inv(A) @ mm
        q = B @ (px / px[2])
        worst = max(worst, float(np.max(np.abs(np.hypot(q[0] / q[2], q[1] / q[2]) - R))))
    return worst


def diff(py_path, ts_path):
    py = {r["photo"]: r for r in map(json.loads, open(py_path))}
    ts = {r["photo"]: r for r in map(json.loads, open(ts_path))}
    both = sorted(set(py) & set(ts))
    agree, gate_diff, lock_diff, off = 0, [], [], []
    for k in both:
        a, b = py[k]["lock"], ts[k]["lock"]
        if (a is None) != (b is None):
            lock_diff.append(k)
            continue
        if a is None:
            agree += 1
            continue
        if a["passes"] != b["passes"]:
            gate_diff.append((k, a["passes"], b["passes"]))
        g = radius_gap(a["toMm"], b["toMm"])
        if g > TOL_MM:
            off.append((k, round(g, 3)))
        else:
            agree += 1
    ms_py = sum(py[k]["ms"] for k in both) / max(1, len(both))
    ms_ts = sum(ts[k]["ms"] for k in both) / max(1, len(both))
    print(f"{len(both)} photos; {agree} agree within {TOL_MM} mm; mean ms python {ms_py:.0f}, ts {ms_ts:.0f}")
    print(f"only one side locked: {len(lock_diff)} {lock_diff[:10]}")
    print(f"gate verdict differs: {len(gate_diff)} {gate_diff[:10]}")
    print(f"rings differ > {TOL_MM} mm: {len(off)} {sorted(off, key=lambda t: -t[1])[:10]}")
    only = sorted(set(py) ^ set(ts))
    if only:
        print(f"in one file only: {len(only)} {only[:10]}")
    return 0 if not (lock_diff or gate_diff or off or only) else 1


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "prep":
        prep(sys.argv[2], sys.argv[3:])
    elif cmd == "run":
        run(sys.argv[2], sys.argv[3])
    elif cmd == "diff":
        sys.exit(diff(sys.argv[2], sys.argv[3]))
    else:
        print(__doc__)
        sys.exit(2)
