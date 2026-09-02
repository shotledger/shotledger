// Manual 4-point corner adjustment — the fallback when the validity gate
// rejects the automatic fit. Spec: docs/specs/photo-scoring-phase1-spec.md §2.5.
//
// This is a full PROJECTIVE mapping, unlike the automatic path. A single
// conic does not determine a homography (CV spike §2 stage 3), so the fitted
// ellipse can only undo rotation and anisotropic scale — weak perspective.
// Four user-placed points do determine one, so this fallback also covers the
// moderate-angle photos the automatic path cannot: the spike measured 3 full
// locks out of 14 there, and camera angle was the single largest geometry
// failure axis after target-type misdetection.

import type { Point } from '@shotledger/shared';

/** Row-major 3x3. */
export type Homography = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface ProjectiveTransform {
  readonly toMm: Homography;
  readonly toImage: Homography;
}

/**
 * The four reference points the user drags onto the photo: the extreme
 * points of the OUTERMOST ring, in target-mm. Order is
 * top, right, bottom, left — and the UI must present them in that order,
 * because a homography from mismatched correspondences is silently wrong
 * rather than an error.
 */
export function outerRingReferencePoints(target: {
  rings: readonly { diameterMm: number }[];
}): readonly Point[] {
  const outermost = target.rings[target.rings.length - 1];
  if (!outermost) throw new RangeError('target has no rings');
  const r = outermost.diameterMm / 2;
  return [
    { x: 0, y: -r }, // top
    { x: r, y: 0 }, // right
    { x: 0, y: r }, // bottom
    { x: -r, y: 0 }, // left
  ];
}

/** Gaussian elimination with partial pivoting on an n x (n+1) augmented matrix. */
function solve(matrix: number[][], n: number): number[] | null {
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      const candidate = matrix[row] as number[];
      const best = matrix[pivot] as number[];
      if (Math.abs(candidate[col] as number) > Math.abs(best[col] as number)) pivot = row;
    }
    const pivotRow = matrix[pivot] as number[];
    if (Math.abs(pivotRow[col] as number) < 1e-12) return null; // degenerate
    matrix[pivot] = matrix[col] as number[];
    matrix[col] = pivotRow;

    const lead = matrix[col] as number[];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const target = matrix[row] as number[];
      const factor = (target[col] as number) / (lead[col] as number);
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) {
        target[k] = (target[k] as number) - factor * (lead[k] as number);
      }
    }
  }
  return Array.from({ length: n }, (_, i) => {
    const row = matrix[i] as number[];
    return (row[n] as number) / (row[i] as number);
  });
}

/**
 * Direct linear transform for exactly four correspondences. Returns null when
 * the points are degenerate (three collinear, or two coincident) rather than
 * a matrix of NaNs — the caller shows "move the corners apart", not rings
 * drawn from nonsense.
 */
export function homographyFromQuad(
  from: readonly Point[],
  to: readonly Point[],
): Homography | null {
  if (from.length !== 4 || to.length !== 4) {
    throw new RangeError('homographyFromQuad needs exactly four correspondences');
  }
  for (const p of [...from, ...to]) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new RangeError('corner coordinates must be finite');
    }
  }

  // h33 is fixed at 1, leaving 8 unknowns and two equations per point pair.
  const rows: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const s = from[i] as Point;
    const d = to[i] as Point;
    rows.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x, d.x]);
    rows.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y, d.y]);
  }

  const h = solve(rows, 8);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  return [
    h[0] as number,
    h[1] as number,
    h[2] as number,
    h[3] as number,
    h[4] as number,
    h[5] as number,
    h[6] as number,
    h[7] as number,
    1,
  ];
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

/**
 * Builds the transform from four image points the user dragged onto the
 * outermost ring's top/right/bottom/left extremes. Returns null on a
 * degenerate quad.
 */
export function transformFromCorners(
  imageCorners: readonly Point[],
  target: { rings: readonly { diameterMm: number }[] },
): ProjectiveTransform | null {
  const reference = outerRingReferencePoints(target);
  const toMm = homographyFromQuad(imageCorners, reference);
  const toImage = homographyFromQuad(reference, imageCorners);
  if (!toMm || !toImage) return null;
  return { toMm, toImage };
}
