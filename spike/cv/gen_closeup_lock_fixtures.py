"""Write the lock-step fixture for the TypeScript port of `closeup_lock`.

    python gen_closeup_lock_fixtures.py > \
        ../../app/src/features/photo-scoring/closeup-lock.fixtures.json
    python gen_closeup_lock_fixtures.py milsnabb   # the milsnabb model's, unported

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
                              CLOSEUP_SCENARIOS, CLOSEUP_WORK_LONG_SIDE, MILSNABB_CLOSEUP_BLACK_R,
                              MILSNABB_CLOSEUP_RINGS, MILSNABB_CLOSEUP_SCENARIOS, synthetic_closeup)

DRAWINGS = {"precision": (CLOSEUP_RINGS, CLOSEUP_BLACK_R), "milsnabb": (MILSNABB_CLOSEUP_RINGS, MILSNABB_CLOSEUP_BLACK_R)}
MODELS = {"precision": CL.PRECISION, "milsnabb": CL.MILSNABB}

LIMIT = 2 ** 53


def truth_to_mm(H):
    """Image px -> mm of the drawing: a px centre is quarter-px 4x+2."""
    Q = np.array([[4.0, 0, 2.0], [0, 4.0, 2.0], [0, 0, 1.0]])
    return np.diag([1 / 8, 1 / 8, 1.0]) @ np.array(H, float).reshape(3, 3) @ Q


def model_json(m):
    return dict(stepMm=m.step_mm, offsetMm=m.offset_mm, innerMm=m.inner_mm, yardstickMm=list(m.yardstick_mm),
                minLines=m.min_lines, maxK=m.max_k, needCentre=m.need_centre)


def main() -> None:
    milsnabb = sys.argv[1:] == ["milsnabb"]
    out = []
    for sc in MILSNABB_CLOSEUP_SCENARIOS if milsnabb else CLOSEUP_SCENARIOS:
        w, h, H = sc["width"], sc["height"], sc["H"]
        rings, black_r = DRAWINGS[sc.get("face", "precision")]
        model = MODELS[sc.get("model", "precision")]
        # the drawing's integers must stay exact in a JS double
        for x in (0, 4 * w + 3):
            for y in (0, 4 * h + 3):
                U = H[0] * x + H[1] * y + H[2]
                V = H[3] * x + H[4] * y + H[5]
                W = H[6] * x + H[7] * y + H[8]
                assert U * U + V * V < LIMIT and (max(max(rings), black_r) * W) ** 2 < LIMIT, sc["name"]
        if milsnabb:
            gray = synthetic_closeup(sc["seed"], w, h, H, sc["holes"], rings, black_r)
            lock = CL.lock_closeup(gray, work_long_side=CLOSEUP_WORK_LONG_SIDE, model=model)
        else:
            gray = synthetic_closeup(sc["seed"], w, h, H, sc["holes"])
            lock = CL.lock_closeup(gray, work_long_side=CLOSEUP_WORK_LONG_SIDE)
        row = dict(name=sc["name"], seed=sc["seed"], width=w, height=h, H=H, holes=sc["holes"],
                   checksum=int(gray.astype(np.uint64).sum()), passes=bool(CL.passes_gate(lock)))
        if milsnabb:
            row = dict(name=sc["name"], face=sc["face"], model=sc["model"], **{k: v for k, v in row.items()
                                                                                 if k != "name"})
        if lock is None:
            row["lock"] = None
        else:
            row["lock"] = dict(
                toMm=[float(v) for v in (lock.to_mm / lock.to_mm[2, 2]).ravel()],
                residualMm=float(lock.residual_mm), comb=float(lock.comb),
                ringOffsetMm=None if lock.ring_offset_mm is None else float(lock.ring_offset_mm),
                rings=int(lock.rings), voteCenter=[float(v) for v in lock.vote_center],
                period=float(lock.period),
                faceContrast=None if lock.face_contrast is None else float(lock.face_contrast))
            if milsnabb:
                row["lock"].update(ringLines=int(lock.ring_lines), inFrame=bool(lock.in_frame))
            T = truth_to_mm(H)
            c = np.linalg.inv(lock.to_mm) @ np.array([0.0, 0.0, 1.0])
            tc = T @ c
            print(f"{sc['name']}: passes {row['passes']} centre off truth "
                  f"{np.hypot(tc[0] / tc[2], tc[1] / tc[2]):.3f} mm, resid {lock.residual_mm:.3f}, "
                  f"comb {lock.comb:.1f}, offset {lock.ring_offset_mm}, P {lock.period}", file=sys.stderr)
        out.append(row)
    head = dict(workLongSide=CLOSEUP_WORK_LONG_SIDE, blackR=CLOSEUP_BLACK_R, rings=list(CLOSEUP_RINGS),
                lineHalf=CLOSEUP_LINE_HALF, holeR=CLOSEUP_HOLE_R, gate=dict(
                    residualMm=CL.GATE_RESIDUAL_MM, comb=CL.GATE_COMB, ringOffsetMm=CL.GATE_RING_OFFSET_MM,
                    faceContrast=CL.GATE_FACE_CONTRAST))
    if milsnabb:
        head.update(milsnabbBlackR=MILSNABB_CLOSEUP_BLACK_R, milsnabbRings=list(MILSNABB_CLOSEUP_RINGS),
                    models={k: model_json(m) for k, m in MODELS.items()},
                    trimMm=CL.TRIM_MM, guideHalf=CL.GUIDE_HALF, combLines=CL.COMB_LINES)
    json.dump(dict(**head, scenarios=out), sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
