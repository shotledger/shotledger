// SHB F.6.10.1 edge-touch scoring, ported from spike/cv/target_cv.py's
// score_hole (spike/cv-target-scoring branch, lines 444-460). Executable
// spec: docs/specs/target-scoring-math-spec.md §4.
//
// SHB F.6.10.1 p.176 (docs/reference/spsf-shb-2026.md:31-32): "Kulhål
// räknas till det högre värdet så snart ringens ytterkant är tangerad" —
// a bullet hole counts to the higher value as soon as the ring's outer
// edge is touched. The hole is a disc (diameter = caliber); it touches a
// ring's boundary as soon as its near edge (the point closest to the
// target center) reaches that boundary.

import type { Point } from './geometry';
import type { TargetFaceDefinition } from './targets';

/** Standard ammunition bullet diameters — not an SHB table (see spec §4.3). */
export const CALIBER_MM: Readonly<Record<string, number>> = {
  '.22': 5.6, // .22 LR — target_cv.py's BULLET_MM
  '9mm': 9.0, // 9x19mm Parabellum
  '.32': 7.65, // .32 ACP / 7.65mm Browning
  '.38': 9.07, // .38 Special
  '.45': 11.43, // .45 ACP
};

const EDGE_CALL_THRESHOLD_MM = 1.0;

export interface Hole {
  /** Target-mm coordinates, origin at the target center. */
  readonly centerMm: Point;
  readonly caliberMm: number;
}

export interface ScoreResult {
  /** Ring label, or '0' for a miss. */
  readonly ringLabel: string;
  /** 0-10; X counts as 10. */
  readonly value: number;
  readonly isInnerTen: boolean;
  /**
   * Distance from the hole's near edge to the decisive ring boundary. For a
   * miss, the distance PAST the outermost ring instead.
   */
  readonly marginMm: number;
  /** true iff scored (not a miss) and marginMm < 1mm — the spike's
   * "surface the judgement call, don't decide it" primitive. */
  readonly edgeCall: boolean;
}

export function scoreHole(hole: Hole, target: TargetFaceDefinition): ScoreResult {
  if (!(hole.caliberMm > 0)) {
    throw new RangeError(`caliberMm must be > 0, got ${hole.caliberMm}`);
  }
  if (target.rings.length === 0) {
    throw new RangeError('target has no rings');
  }

  const radiusMm = Math.hypot(hole.centerMm.x, hole.centerMm.y);
  const nearEdgeMm = Math.max(0, radiusMm - hole.caliberMm / 2);

  for (const candidate of target.rings) {
    const ringRadiusMm = candidate.diameterMm / 2;
    if (nearEdgeMm <= ringRadiusMm) {
      const marginMm = ringRadiusMm - nearEdgeMm;
      return {
        ringLabel: candidate.label,
        value: candidate.value,
        isInnerTen: candidate.isInnerTen,
        marginMm,
        edgeCall: marginMm < EDGE_CALL_THRESHOLD_MM,
      };
    }
  }

  // target.rings.length === 0 was already rejected above.
  const outermost = target.rings[target.rings.length - 1] as (typeof target.rings)[number];
  return {
    ringLabel: '0',
    value: 0,
    isInnerTen: false,
    marginMm: nearEdgeMm - outermost.diameterMm / 2,
    edgeCall: false,
  };
}
