"""Write the lock-step fixture for the TypeScript port of `hole_proposals`.

    python gen_hole_proposal_fixtures.py > \
        ../../app/src/features/photo-scoring/hole-proposals.fixtures.json

Synthetic canvases only (`synthetic_canvas.py`), regenerated in the test from
the same parameters, so the fixture carries no pixels: per scenario, every
candidate the stage finds with its features and probability, and the
proposals after the threshold, merge and refinement.
"""
from __future__ import annotations

import json
import sys

import hole_proposals as HP
from synthetic_canvas import BLACK_R, PAD, RINGS, SCENARIOS, synthetic_canvas

PX_PER_MM = 4.0
CALIBER_MM = 5.6


def main() -> None:
    out = []
    for sc in SCENARIOS:
        size = sc["size"]
        gray = synthetic_canvas(sc["seed"], size, sc["holes"], sc["patches"], BLACK_R, RINGS, PAD)
        c = size // 2
        ring_mm = tuple(r / PX_PER_MM for r in RINGS)
        face = HP.Face(c, c, PX_PER_MM, CALIBER_MM, BLACK_R / PX_PER_MM, ring_mm[-1], ring_mm)
        cands = HP.candidates(gray, face)
        props = HP.propose(gray, face)
        out.append(dict(
            seed=sc["seed"], size=size, holes=sc["holes"], patches=sc["patches"],
            checksum=int(gray.astype("uint64").sum()),
            candidates=[dict(x=cd["x"], y=cd["y"], resp=cd["resp"],
                             probability=HP.probability(cd["features"]),
                             features={k: cd["features"][k] for k in HP.FEATURE_NAMES}) for cd in cands],
            proposals=[dict(x=p.x, y=p.y, probability=p.probability, peakX=p.peak_x, peakY=p.peak_y)
                       for p in props],
        ))
    json.dump(dict(pxPerMm=PX_PER_MM, caliberMm=CALIBER_MM, blackRadiusPx=BLACK_R, ringsPx=list(RINGS), pad=PAD,
                   featureNames=list(HP.FEATURE_NAMES), weights=HP.WEIGHTS, bias=HP.BIAS,
                   threshold=HP.THRESHOLD, scenarios=out), sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
