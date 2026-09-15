// Stages 1-3 of the geometry pipeline, on react-native-fast-opencv.
// Ported from spike/cv/target_cv.py (branch spike/cv-target-scoring):
// find_face / _refit_rays / build_geom / refine_geom.
// Spec: docs/specs/photo-scoring-phase1-spec.md §5.2.
//
// This module is deliberately THIN. Everything decidable by arithmetic lives
// in tested pure modules — `shared/src/target-scoring` owns the rectification
// math and the search driver, `validity.ts` owns the gate — so what remains
// here is only the part that genuinely needs pixels, which is the part that
// would need a device test to cover.
//
// Two integration facts from the spike (§4.6) shape it:
//  * there is no `imread`: pixels arrive via `Mat.createFromBase64`;
//  * there is no per-pixel accessor: `toBuffer()` copies a whole Mat, so a JS
//    loop is only affordable over small reduced arrays. Rule: native ops for
//    everything, `warpPolar` for anything radial, small arrays into JS.
import type { EllipseFit, RectificationTransform } from '@shotledger/shared';
import {
  buildRectification,
  coarseToFineRefine,
  refineRectification,
  scoreRadialProfile,
} from '@shotledger/shared';
import type { Mat, RotatedRect } from 'react-native-fast-opencv';
import {
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  InterpolationFlags,
  LineTypes,
  MatVector,
  Mat as MatClass,
  MorphShapes,
  MorphTypes,
  OpenCV,
  Point,
  Point2f,
  PointVector,
  RetrievalModes,
  Scalar,
  Size,
  ThresholdTypes,
} from 'react-native-fast-opencv';

import { pickFaceCandidate, type FaceCandidate } from './face-candidate';
import type { GeometryMetrics } from './validity';

/** Rectified working canvas resolution, as in the spike. Fixing it makes
 *  runtime independent of the input photo's size. */
export const CANVAS_PX_PER_MM = 4;

export interface GeometryPipelineResult {
  readonly transform: RectificationTransform;
  readonly ellipse: EllipseFit;
  readonly metrics: GeometryMetrics;
}

/**
 * Native objects live in a native buffer until released, and a photo-heavy
 * session that leaks them runs out of memory. Everything allocated goes
 * through this so one `releaseAll` in a `finally` covers the whole pipeline.
 */
class Arena {
  private readonly items: { release(): void }[] = [];

  keep<T extends { release(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  /** An output Mat: OpenCV resizes `dst` itself, so the initial shape is a
   *  placeholder. */
  dst(): Mat {
    return this.keep(MatClass.create(1, 1, DataTypes.CV_8U));
  }

  /** A zero-filled single-channel mask. Built from a typed array rather than
   *  a JS number[] — a 2048px mask is 4M entries. */
  mask(rows: number, cols: number): Mat {
    return this.keep(
      MatClass.createFromBuffer('uint8', rows, cols, 1, new Uint8Array(rows * cols)),
    );
  }

  releaseAll(): void {
    for (const item of this.items.reverse()) {
      try {
        item.release();
      } catch {
        // A double release must not mask the pipeline's own error.
      }
    }
    this.items.length = 0;
  }
}

function discMean(arena: Arena, grey: Mat, cx: number, cy: number, r: number): number {
  const mask = arena.mask(grey.rows, grey.cols);
  const centre = arena.keep(Point.create(Math.round(cx), Math.round(cy)));
  OpenCV.circle(
    mask,
    centre,
    Math.max(2, Math.round(r)),
    arena.keep(Scalar.create(255, 255, 255)),
    -1,
    LineTypes.LINE_8,
  );
  return OpenCV.mean(grey, mask).a;
}

function annulusMean(
  arena: Arena,
  grey: Mat,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
): number {
  const mask = arena.mask(grey.rows, grey.cols);
  const centre = arena.keep(Point.create(Math.round(cx), Math.round(cy)));
  OpenCV.circle(
    mask,
    centre,
    Math.max(2, Math.round(r1)),
    arena.keep(Scalar.create(255, 255, 255)),
    -1,
    LineTypes.LINE_8,
  );
  OpenCV.circle(
    mask,
    centre,
    Math.max(1, Math.round(r0)),
    arena.keep(Scalar.create(0, 0, 0)),
    -1,
    LineTypes.LINE_8,
  );
  return OpenCV.mean(grey, mask).a;
}

/**
 * Smallest share of the frame a contour must cover to be considered the face
 * at all. The printed black zone fills a good part of any usable photo; this
 * only keeps `fitEllipse` away from specks, where a fitted ellipse says
 * nothing and the call can fail outright on too few points.
 */
const MIN_CANDIDATE_AREA_FRACTION = 0.005;

/**
 * OpenCV reports a RotatedRect's size as (width, height) with the angle
 * measured against that axis order. `buildRectification` requires the axes
 * pre-sorted (math spec GB5); rotating by 90° when they swap keeps the angle
 * consistent with the new order.
 */
function toEllipseFit(rect: RotatedRect): EllipseFit {
  const swap = rect.width > rect.height;
  return {
    center: { x: rect.x, y: rect.y },
    minorAxis: swap ? rect.height : rect.width,
    majorAxis: swap ? rect.width : rect.height,
    rotationDeg: swap ? rect.angle + 90 : rect.angle,
  };
}

/**
 * Stage 1: the largest dark blob is the printed black zone.
 *
 * Otsu runs on a heavily blurred copy on purpose — the split wanted is
 * paper/black, not texture. `fitEllipseDirect` is missing upstream in
 * react-native-fast-opencv, so this uses plain `fitEllipse`; stage 3 is what
 * rescues a poor fit, and the validity gate catches the cases where it does
 * not.
 */
function findFace(arena: Arena, src: Mat): { ellipse: EllipseFit; filled: Mat; grey: Mat } {
  const grey = arena.dst();
  OpenCV.cvtColor(src, grey, ColorConversionCodes.COLOR_BGR2GRAY);

  const blurred = arena.dst();
  OpenCV.GaussianBlur(grey, blurred, arena.keep(Size.create(31, 31)), 0);

  const binary = arena.dst();
  OpenCV.threshold(
    blurred,
    binary,
    0,
    255,
    ThresholdTypes.THRESH_BINARY_INV | ThresholdTypes.THRESH_OTSU,
  );

  const kernel = arena.keep(
    OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, arena.keep(Size.create(9, 9))),
  );
  OpenCV.morphologyEx(binary, binary, MorphTypes.MORPH_OPEN, kernel);
  OpenCV.morphologyEx(binary, binary, MorphTypes.MORPH_CLOSE, kernel);

  const contours = arena.keep(MatVector.create());
  OpenCV.findContours(
    binary,
    contours,
    RetrievalModes.RETR_EXTERNAL,
    ContourApproximationModes.CHAIN_APPROX_NONE,
  );

  // Shape, not just size: see face-candidate.ts. A contour has to be large
  // enough for fitEllipse to mean anything before it is worth describing, so
  // tiny specks are skipped rather than fitted.
  const minCandidateArea = MIN_CANDIDATE_AREA_FRACTION * grey.rows * grey.cols;
  const candidates: FaceCandidate[] = [];
  for (let i = 0; i < contours.length; i += 1) {
    const area = OpenCV.contourArea(contours.get(i)).value;
    if (area < minCandidateArea) continue;
    const fit = toEllipseFit(OpenCV.fitEllipse(contours.get(i)));
    candidates.push({
      index: i,
      area,
      majorAxis: fit.majorAxis,
      minorAxis: fit.minorAxis,
    });
  }

  const picked = pickFaceCandidate(candidates);
  if (!picked) throw new Error('no dark region found');
  const best = picked.index;

  const rect = arena.keep(OpenCV.fitEllipse(contours.get(best)));

  const filled = arena.mask(grey.rows, grey.cols);
  OpenCV.drawContours(
    filled,
    contours,
    best,
    arena.keep(Scalar.create(255, 255, 255)),
    -1,
    LineTypes.LINE_8,
  );

  return { ellipse: toEllipseFit(rect), filled, grey };
}

/**
 * Stage 1b: re-fit the black-zone boundary from ray casts, dropping any ray
 * that leaves the frame — "much steadier than one contour fit when the card
 * is cropped" (target_cv.py:_refit_rays).
 *
 * The mask is pulled into JS once with `toBuffer`; 360 rays over it is a few
 * milliseconds, where the same walk through native calls would be seconds.
 */
function refitRays(
  arena: Arena,
  filled: Mat,
  ellipse: EllipseFit,
  iterations = 3,
  rayCount = 360,
): EllipseFit {
  const { buffer, rows, cols } = filled.toBuffer('uint8');
  let current = ellipse;

  for (let iter = 0; iter < iterations; iter += 1) {
    const cx = current.center.x;
    const cy = current.center.y;
    const rMax = 0.75 * Math.max(rows, cols);
    const found: number[] = [];

    for (let i = 0; i < rayCount; i += 1) {
      const angle = (2 * Math.PI * i) / rayCount;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let lastX = -1;
      let lastY = -1;
      for (let r = 2; r < rMax; r += 1.5) {
        const x = Math.round(cx + r * dx);
        const y = Math.round(cy + r * dy);
        if (x <= 2 || x >= cols - 3 || y <= 2 || y >= rows - 3) {
          // The ray left the frame, so the true boundary is outside the
          // photo and everything this ray found is unusable.
          lastX = -1;
          break;
        }
        if (buffer[y * cols + x]) {
          lastX = x;
          lastY = y;
        }
      }
      if (lastX >= 0) found.push(lastX, lastY);
    }

    if (found.length < 60) return current; // too few rays survived to re-fit

    const points = arena.keep(PointVector.create());
    for (let i = 0; i < found.length; i += 2) {
      points.push(arena.keep(Point.create(found[i] as number, found[i + 1] as number)));
    }
    current = toEllipseFit(arena.keep(OpenCV.fitEllipse(points)));
  }
  return current;
}

/**
 * The 3x3 image->canvas matrix, derived from the shared rectification so the
 * canvas is exactly `buildRectification` scaled to CANVAS_PX_PER_MM and
 * centred. One source of truth for the linear map is what makes a mark land
 * in the same target-mm the scorer uses.
 */
function canvasHomography(arena: Arena, t: RectificationTransform, canvasSize: number): Mat {
  const [a, b, c, d] = t.m;
  const k = CANVAS_PX_PER_MM;
  const half = canvasSize / 2;
  const tx = half - k * (a * t.center.x + b * t.center.y) + k * t.offset.x;
  const ty = half - k * (c * t.center.x + d * t.center.y) + k * t.offset.y;
  // prettier-ignore
  return arena.keep(
    MatClass.create(3, 3, DataTypes.CV_64F, [
      k * a, k * b, tx,
      k * c, k * d, ty,
      0,     0,     1,
    ]),
  );
}

/**
 * The radial edge profile at a candidate centre. `warpPolar` turns the radial
 * problem into a row reduction — it is the primitive the spike wished for,
 * since `remap` is missing upstream and this is the better tool anyway
 * (spike §4.6).
 */
function radialProfile(
  arena: Arena,
  canvas: Mat,
  cx: number,
  cy: number,
  radiusPx: number,
): Float64Array {
  const angleBins = 360;
  const polar = arena.dst();
  OpenCV.warpPolar(
    canvas,
    polar,
    arena.keep(Size.create(Math.round(radiusPx), angleBins)),
    arena.keep(Point2f.create(cx, cy)),
    radiusPx,
    InterpolationFlags.INTER_LINEAR,
  );

  const { buffer, rows, cols } = polar.toBuffer('uint8');
  const meanByRadius = new Float64Array(cols);
  for (let r = 0; r < cols; r += 1) {
    let sum = 0;
    for (let a = 0; a < rows; a += 1) sum += buffer[a * cols + r] as number;
    meanByRadius[r] = sum / rows;
  }

  // High-pass: |profile - smoothed|, so it fires on a white line on black and
  // a black line on white alike (target_cv.py:_radial_profile).
  const half = 10;
  const out = new Float64Array(cols);
  for (let r = 0; r < cols; r += 1) {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, r - half); k < Math.min(cols, r + half + 1); k += 1) {
      sum += meanByRadius[k] as number;
      n += 1;
    }
    out[r] = Math.abs((meanByRadius[r] as number) - sum / n);
  }
  return out;
}

/** Median absolute deviation — the normaliser that turns the profile score
 *  into an absolute threshold instead of a proxy for the photo's contrast. */
function medianAbsoluteDeviation(values: Float64Array): number {
  const sorted = Array.from(values).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const deviations = sorted.map((v) => Math.abs(v - median)).sort((x, y) => x - y);
  return deviations[Math.floor(deviations.length / 2)] ?? 0;
}

export interface RunGeometryOptions {
  readonly base64: string;
  readonly width: number;
  readonly height: number;
  readonly referenceDiameterMm: number;
  /** Ascending ring radii, mm — the template the profile is matched against. */
  readonly ringRadiiMm: readonly number[];
}

/**
 * Pixels in, a target-mm transform and the gate's metrics out.
 *
 * This function never decides whether the result is trustworthy — it only
 * measures. `checkGeometryValidity` makes that call, so the threshold logic
 * stays in a module that can be unit-tested against the real corpus numbers.
 */
export function runGeometry(options: RunGeometryOptions): GeometryPipelineResult {
  const arena = new Arena();
  try {
    const src = arena.keep(MatClass.createFromBase64(options.base64));
    const { ellipse: initial, filled, grey } = findFace(arena, src);
    const ellipse = refitRays(arena, filled, initial);

    const base = buildRectification(ellipse, options.referenceDiameterMm);
    const outerRadiusMm = (options.ringRadiiMm[options.ringRadiiMm.length - 1] ?? 250) * 1.05;
    const canvasSize = Math.round(2 * outerRadiusMm * CANVAS_PX_PER_MM);

    const canvas = arena.dst();
    OpenCV.warpPerspective(
      grey,
      canvas,
      canvasHomography(arena, base, canvasSize),
      arena.keep(Size.create(canvasSize, canvasSize)),
      InterpolationFlags.INTER_CUBIC,
      BorderTypes.BORDER_CONSTANT,
      arena.keep(Scalar.create(255, 255, 255)),
    );

    // The profile depends only on (dx, dy) — `scale` merely rescales the
    // radius lookup — so it is memoised per centre, exactly as the spike's
    // loop nesting does. Without this the search would warpPolar once per
    // (dx, dy, scale) triple rather than once per centre: ~150 calls instead
    // of a few thousand.
    const cache = new Map<string, Float64Array>();
    const radiusPx = outerRadiusMm * CANVAS_PX_PER_MM;
    const profileAt = (dxMm: number, dyMm: number): Float64Array => {
      const key = `${dxMm.toFixed(3)}:${dyMm.toFixed(3)}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const profile = radialProfile(
        arena,
        canvas,
        canvasSize / 2 + dxMm * CANVAS_PX_PER_MM,
        canvasSize / 2 + dyMm * CANVAS_PX_PER_MM,
        radiusPx,
      );
      cache.set(key, profile);
      return profile;
    };

    const refined = coarseToFineRefine((dxMm, dyMm, scale) =>
      scoreRadialProfile(profileAt(dxMm, dyMm), CANVAS_PX_PER_MM * scale, options.ringRadiiMm),
    );

    const transform = refineRectification(base, refined.dxMm, refined.dyMm, refined.scale);

    // Gate metrics, measured on the same pixels the geometry used.
    const mad = medianAbsoluteDeviation(profileAt(refined.dxMm, refined.dyMm));
    const r = ellipse.minorAxis / 2;
    const inner = discMean(arena, grey, ellipse.center.x, ellipse.center.y, 0.7 * r);
    const outer = annulusMean(arena, grey, ellipse.center.x, ellipse.center.y, 1.15 * r, 1.4 * r);

    const metrics: GeometryMetrics = {
      axisRatio: ellipse.majorAxis / ellipse.minorAxis,
      zoneFraction: ellipse.majorAxis / Math.max(options.width, options.height),
      centerInFrame:
        ellipse.center.x >= 0 &&
        ellipse.center.x < options.width &&
        ellipse.center.y >= 0 &&
        ellipse.center.y < options.height,
      zoneContrastGrey: outer - inner,
      profileScore: mad > 1e-6 ? refined.score / mad : 0,
    };

    return { transform, ellipse, metrics };
  } finally {
    arena.releaseAll();
  }
}
