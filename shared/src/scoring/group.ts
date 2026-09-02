// Group analytics for photo-scored series: MPI, windage/elevation, mean
// radius and extreme spread. Executable spec:
// docs/specs/photo-scoring-phase1-spec.md §3.
//
// Input is target-mm in the same convention as `imageToTargetMm` and
// `scoreHole` (origin at the target centre, y increasing DOWNWARD).
// `elevationMm` negates y so that positive reads as "above centre", which is
// what a shooter means by elevation; `windageMm` passes x through.

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
