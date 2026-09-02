// Group analytics for photo-scored series: MPI, windage/elevation, mean
// radius, extreme spread, and points lost. Executable spec:
// docs/specs/photo-scoring-phase1-spec.md §3 and §9.
//
// Input is target-mm in the same convention as `imageToTargetMm` and
// `scoreHole` (origin at the target centre, y increasing DOWNWARD).
// `elevationMm` negates y so that positive reads as "above centre", which is
// what a shooter means by elevation; `windageMm` passes x through.

import { scoreHole } from '../target-scoring/score';
import type { TargetFaceDefinition } from '../target-scoring/targets';

/** A shot position in target millimetres. y increases downward. */
export interface GroupPoint {
  readonly xMm: number;
  readonly yMm: number;
}

export interface GroupAnalysis {
  readonly shotCount: number;
  /** Mean point of impact, in the input's own (y-down) convention. */
  readonly mpiMm: GroupPoint;
  /** MPI x. Positive = right of centre. */
  readonly windageMm: number;
  /** Negated MPI y. Positive = above centre. */
  readonly elevationMm: number;
  /** Mean distance from the MPI. */
  readonly meanRadiusMm: number;
  /** Largest distance between any two shots. */
  readonly extremeSpreadMm: number;
}

function assertFinite(points: readonly GroupPoint[]): void {
  for (const p of points) {
    if (!Number.isFinite(p.xMm) || !Number.isFinite(p.yMm)) {
      throw new RangeError(`group coordinates must be finite, got (${p.xMm}, ${p.yMm})`);
    }
  }
}

/**
 * Returns null for an empty group — the caller hides the view rather than
 * rendering a plot of nothing.
 */
export function analyzeGroup(points: readonly GroupPoint[]): GroupAnalysis | null {
  if (points.length === 0) return null;
  assertFinite(points);

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.xMm;
    sumY += p.yMm;
  }
  const mpiMm: GroupPoint = { xMm: sumX / points.length, yMm: sumY / points.length };

  let sumRadius = 0;
  for (const p of points) {
    sumRadius += Math.hypot(p.xMm - mpiMm.xMm, p.yMm - mpiMm.yMm);
  }

  // Extreme spread is the group's diameter — the largest distance between any
  // TWO shots, which is not the same as the largest distance from the MPI.
  let extremeSpreadMm = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      // Both indices are inside the loop bounds.
      const a = points[i] as GroupPoint;
      const b = points[j] as GroupPoint;
      const d = Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
      if (d > extremeSpreadMm) extremeSpreadMm = d;
    }
  }

  return {
    shotCount: points.length,
    mpiMm,
    windageMm: mpiMm.xMm,
    // `0 - y`, not `-y`: negating a zero MPI yields -0, which formats as
    // "-0.0 mm" in the UI.
    elevationMm: 0 - mpiMm.yMm,
    meanRadiusMm: sumRadius / points.length,
    extremeSpreadMm,
  };
}

/** A scored mark: position plus the caliber it was scored with. Spec §9.2. */
export interface PointsLostMark {
  readonly xMm: number;
  readonly yMm: number;
  readonly caliberMm: number;
}

export interface PointsLostAnalysis {
  /** Sum of each mark's ring value at its real position. */
  readonly actualScore: number;
  /**
   * Sum of each mark's ring value after shifting the whole group by −MPI —
   * the group's own shape, translated onto the target center. An
   * approximation of "this group's best possible score", not the true
   * maximum over every translation — see spec §9.4. Can be lower than
   * `actualScore` when a called flier drags the MPI away from an otherwise
   * tight cluster (spec §9.1, §9.3 PL9).
   */
  readonly recenteredScore: number;
  /** `marks.length` × the target's highest ring value. */
  readonly maxScore: number;
  /** `recenteredScore - actualScore`. Can be negative — see `recenteredScore`. */
  readonly pointsLostToPosition: number;
  /** `maxScore - recenteredScore`. Always >= 0 (spec §9.1). */
  readonly pointsLostToSize: number;
}

/**
 * Breaks down a scored group's shortfall from a perfect score into the part
 * recoverable by aiming at a corrected point of aim (position) and the part
 * inherent to the group's own spread (size). Spec §9.
 *
 * Returns null for an empty group, mirroring `analyzeGroup`.
 */
export function analyzePointsLost(
  marks: readonly PointsLostMark[],
  target: TargetFaceDefinition,
): PointsLostAnalysis | null {
  if (marks.length === 0) return null;

  const analysis = analyzeGroup(marks.map((m) => ({ xMm: m.xMm, yMm: m.yMm })));
  // marks.length > 0 was just checked, so analyzeGroup cannot return null.
  const mpiMm = (analysis as GroupAnalysis).mpiMm;

  let actualScore = 0;
  let recenteredScore = 0;
  let highestRingValue = 0;
  for (const ring of target.rings) {
    if (ring.value > highestRingValue) highestRingValue = ring.value;
  }

  for (const mark of marks) {
    actualScore += scoreHole(
      { centerMm: { x: mark.xMm, y: mark.yMm }, caliberMm: mark.caliberMm },
      target,
    ).value;
    recenteredScore += scoreHole(
      {
        centerMm: { x: mark.xMm - mpiMm.xMm, y: mark.yMm - mpiMm.yMm },
        caliberMm: mark.caliberMm,
      },
      target,
    ).value;
  }

  const maxScore = marks.length * highestRingValue;

  return {
    actualScore,
    recenteredScore,
    maxScore,
    pointsLostToPosition: recenteredScore - actualScore,
    pointsLostToSize: maxScore - recenteredScore,
  };
}
