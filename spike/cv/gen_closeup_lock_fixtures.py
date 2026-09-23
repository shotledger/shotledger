"""Write the lock-step fixture for the TypeScript port of `closeup_lock`.

    python gen_closeup_lock_fixtures.py > \
        ../../app/src/features/photo-scoring/closeup-lock.fixtures.json

Synthetic close-ups only (`synthetic_canvas.synthetic_closeup`), regenerated
in the test from the same integers, so the fixture carries no pixels: per
scenario, the lock and the numbers its gate reads. How far each lock sits
from the drawn truth goes to stderr.
"""
from __future__ import annotations

import json
import sys

import numpy as np

import closeup_lock as CL
from synthetic_canvas import (CLOSEUP_BLACK_R, CLOSEUP_HOLE_R, CLOSEUP_LINE_HALF, CLOSEUP_RINGS,
                              CLOSEUP_SCENARIOS, CLOSEUP_WORK_LONG_SIDE, synthetic_closeup)

LIMIT = 2 ** 53


def truth_to_mm(H):
    """Image px -> mm of the drawing: a px centre is quarter-px 4x+2."""
    Q = np.array([[4.0, 0, 2.0], [0, 4.0, 2.0], [0, 0, 1.0]])
    return np.diag([1 / 8, 1 / 8, 1.0]) @ np.array(H, float).reshape(3, 3) @ Q


def main() -> None:
    out = []
    for sc in CLOSEUP_SCENARIOS:
        w, h, H = sc["width"], sc["height"], sc["H"]
        # the drawing's integers must stay exact in a JS double
        for x in (0, 4 * w + 3):
            for y in (0, 4 * h + 3):
                U = H[0] * x + H[1] * y + H[2]
                V = H[3] * x + H[4] * y + H[5]
                W = H[6] * x + H[7] * y + H[8]
                assert U * U + V * V < LIMIT and (max(CLOSEUP_RINGS) * W) ** 2 < LIMIT, sc["name"]
        gray = synthetic_closeup(sc["seed"], w, h, H, sc["holes"])
        lock = CL.lock_closeup(gray, work_long_side=CLOSEUP_WORK_LONG_SIDE)
        row = dict(name=sc["name"], seed=sc["seed"], width=w, height=h, H=H, holes=sc["holes"],
                   checksum=int(gray.astype(np.uint64).sum()), passes=bool(CL.passes_gate(lock)))
        if lock is None:
            row["lock"] = None
        else:
            row["lock"] = dict(
                toMm=[float(v) for v in (lock.to_mm / lock.to_mm[2, 2]).ravel()],
                residualMm=float(lock.residual_mm), comb=float(lock.comb),
                ringOffsetMm=None if lock.ring_offset_mm is None else float(lock.ring_offset_mm),
                rings=int(lock.rings), voteCenter=[float(v) for v in lock.vote_center],
                period=float(lock.period))
            T = truth_to_mm(H)
            c = np.linalg.inv(lock.to_mm) @ np.array([0.0, 0.0, 1.0])
            tc = T @ c
            print(f"{sc['name']}: passes {row['passes']} centre off truth "
                  f"{np.hypot(tc[0] / tc[2], tc[1] / tc[2]):.3f} mm, resid {lock.residual_mm:.3f}, "
                  f"comb {lock.comb:.1f}, offset {lock.ring_offset_mm}, P {lock.period}", file=sys.stderr)
        out.append(row)
    json.dump(dict(workLongSide=CLOSEUP_WORK_LONG_SIDE, blackR=CLOSEUP_BLACK_R, rings=list(CLOSEUP_RINGS),
                   lineHalf=CLOSEUP_LINE_HALF, holeR=CLOSEUP_HOLE_R, gate=dict(
                       residualMm=CL.GATE_RESIDUAL_MM, comb=CL.GATE_COMB, ringOffsetMm=CL.GATE_RING_OFFSET_MM),
                   scenarios=out), sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
