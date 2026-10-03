// Ellipse -> target-mm rectification math, ported from the CV spike (stages
// 2-3: build_geom / refine_geom / _radial_profile). Executable spec:
// docs/specs/target-scoring-math-spec.md §2.
//
// This module starts from "an ellipse and hole pixel-coordinates exist" —
// fitting the ellipse from pixels (OpenCV's fitEllipseDirect + ray-cast
// refit) and sampling the radial profile from the image (warpPolar) are
// native-side; see the spec §1 for the exact native/JS split.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A fitted black-zone ellipse, in image pixel coordinates. */
export interface EllipseFit {
  readonly center: Point;
  /** Full axis length (diameter), image px. Must be > 0. */
  readonly majorAxis: number;
  /** Full axis length (diameter), image px. Must be > 0 and <= majorAxis. */
  readonly minorAxis: number;
  /**
   * Degrees. OpenCV fitEllipse convention: rotates image space so the first
   * resulting axis aligns with minorAxis and the second with majorAxis (spec
   * §2.2) — the native layer passes the ellipse through unchanged.
   */
  readonly rotationDeg: number;
}

/** mm = m · (px - center) + offset. See spec §2.1. */
export interface RectificationTransform {
  readonly center: Point;
  readonly m: readonly [number, number, number, number]; // row-major 2x2: [a, b, c, d]
  readonly offset: Point;
}

function assertPositive(value: number, what: string): void {
  if (!(value > 0)) throw new RangeError(`${what} must be > 0, got ${value}`);
}

/** Ports the spike's build_geom. See spec §2.2. */
export function buildRectification(
  ellipse: EllipseFit,
  referenceDiameterMm: number,
): RectificationTransform {
  assertPositive(ellipse.majorAxis, 'majorAxis');
  assertPositive(ellipse.minorAxis, 'minorAxis');
  assertPositive(referenceDiameterMm, 'referenceDiameterMm');
  if (ellipse.minorAxis > ellipse.majorAxis) {
    throw new RangeError('minorAxis must be <= majorAxis');
  }

  const rOut = referenceDiameterMm / 2;
  const th = (ellipse.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  // R = [[cos, sin], [-sin, cos]]
  const s0 = (2 * rOut) / ellipse.minorAxis;
  const s1 = (2 * rOut) / ellipse.majorAxis;
  // M = S @ R
  const a = s0 * cos;
  const b = s0 * sin;
  const c = s1 * -sin;
  const d = s1 * cos;

  return {
    center: ellipse.center,
    m: [a, b, c, d],
    offset: { x: 0, y: 0 },
  };
}

function matInvert(m: readonly [number, number, number, number]): [number, number, number, number] {
  const [a, b, c, d] = m;
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det];
}

/** Ports the forward half of build_geom's warpPerspective, in mm. Spec §2.3. */
export function imageToTargetMm(t: RectificationTransform, p: Point): Point {
  const dx = p.x - t.center.x;
  const dy = p.y - t.center.y;
  const [a, b, c, d] = t.m;
  return {
    x: a * dx + b * dy + t.offset.x,
    y: c * dx + d * dy + t.offset.y,
  };
}

/** Ports the inverse mapping. Spec §2.3. */
export function targetMmToImage(t: RectificationTransform, p: Point): Point {
  const relX = p.x - t.offset.x;
  const relY = p.y - t.offset.y;
  const [a, b, c, d] = matInvert(t.m);
  return {
    x: t.center.x + a * relX + b * relY,
    y: t.center.y + c * relX + d * relY,
  };
}

/**
 * Ports the effect of refine_geom's (dx, dy, scale) correction
 * redefined in mm-space (spec §2.4): for every image
 * point p, imageToTargetMm(refine(t,dx,dy,scale), p) === scale * (imageToTargetMm(t, p) - (dx, dy)).
 */
export function refineRectification(
  t: RectificationTransform,
  dxMm: number,
  dyMm: number,
  scale: number,
): RectificationTransform {
  if (!(scale > 0)) throw new RangeError(`scale must be > 0, got ${scale}`);
  const [a, b, c, d] = t.m;
  return {
    center: t.center,
    m: [a * scale, b * scale, c * scale, d * scale],
    offset: {
      x: scale * (t.offset.x - dxMm),
      y: scale * (t.offset.y - dyMm),
    },
  };
}

/**
 * Ports the scoring inner loop of refine_geom: the
 * pure-math half of the spike's alignment objective. `profile` is a 1-D
 * array indexed by radius-in-samples (the native layer's warpPolar +
 * high-pass output). Spec §2.5.
 */
export function scoreRadialProfile(
  profile: ArrayLike<number>,
  samplesPerMm: number,
  ringRadiiMm: readonly number[],
  windowSamples = 2,
): number {
  let total = 0;
  let count = 0;
  for (const radiusMm of ringRadiiMm) {
    const r = Math.round(radiusMm * samplesPerMm);
    const lo = Math.max(0, r - windowSamples);
    const hi = r + windowSamples + 1; // exclusive upper bound, matches spike's hi = r + 3 for windowSamples=2
    if (hi > profile.length) continue;
    let localMax = -Infinity;
    for (let i = lo; i < hi; i += 1) {
      // `hi <= profile.length` was just checked, and lo >= 0, so every index
      // in [lo, hi) is in bounds.
      const v = profile[i] as number;
      if (v > localMax) localMax = v;
    }
    total += localMax;
    count += 1;
  }
  return count > 0 ? total / count : -Infinity;
}

export interface CoarseToFineOptions {
  readonly initialSearchMm?: number;
  readonly initialStepMm?: number;
  readonly scaleWindow?: number;
  readonly iterations?: number;
}

export interface CoarseToFineResult {
  readonly dxMm: number;
  readonly dyMm: number;
  readonly scale: number;
  readonly score: number;
}

/** center ± halfWidth in `step` increments, inclusive of both ends. */
function grid(center: number, halfWidth: number, step: number): number[] {
  const steps = Math.max(0, Math.round((2 * halfWidth) / step));
  const values: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    values.push(center - halfWidth + i * step);
  }
  return values;
}

/**
 * Ports the coarse-to-fine grid search driver in refine_geom
 * generalized over a caller-supplied `evaluate`
 * callback so the native layer can drive the same search with its own image
 * sampling (spec §2.6).
 */
export function coarseToFineRefine(
  evaluate: (dxMm: number, dyMm: number, scale: number) => number,
  options: CoarseToFineOptions = {},
): CoarseToFineResult {
  const { initialSearchMm = 10, initialStepMm = 2, scaleWindow = 0.12, iterations = 3 } = options;

  let bestDx = 0;
  let bestDy = 0;
  let bestScale = 1;
  let bestScore = -Infinity;
  let searchMm = initialSearchMm;
  let stepMm = initialStepMm;

  for (let iter = 0; iter < iterations; iter += 1) {
    let candDx = 0;
    let candDy = 0;
    let candScale = 1;
    let candScore = -Infinity;

    const scaleStep = (0.02 * stepMm) / 2;
    for (const dx of grid(bestDx, searchMm, stepMm)) {
      for (const dy of grid(bestDy, searchMm, stepMm)) {
        for (const scale of grid(bestScale, scaleWindow, scaleStep)) {
          const score = evaluate(dx, dy, scale);
          if (score > candScore) {
            candDx = dx;
            candDy = dy;
            candScale = scale;
            candScore = score;
          }
        }
      }
    }

    bestDx = candDx;
    bestDy = candDy;
    bestScale = candScale;
    bestScore = candScore;
    searchMm = stepMm * 1.5;
    stepMm = Math.max(0.5, stepMm / 3);
  }

  return { dxMm: bestDx, dyMm: bestDy, scale: bestScale, score: bestScore };
}

/**
 * The transform a `coarseToFineRefine` search settles on. Its `scale` is the
 * one the rings were scored at (ring r mm at r * pxPerMm * scale on the
 * canvas), so a target-mm is a base-mm *divided* by it: `refineRectification`
 * takes the reciprocal. Passing the search's scale straight through put the
 * disc lock's transform off by scale squared (#496).
 */
export function applyRefinement(
  t: RectificationTransform,
  result: Pick<CoarseToFineResult, 'dxMm' | 'dyMm' | 'scale'>,
): RectificationTransform {
  return refineRectification(t, result.dxMm, result.dyMm, 1 / result.scale);
}
