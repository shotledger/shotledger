// The disc lock: stages 1-3 of the geometry pipeline, over `DiscOps`.
// Ported from spike/cv/target_cv.py (branch spike/cv-target-scoring):
// find_face / _refit_rays / build_geom / refine_geom.
// Spec: docs/specs/photo-scoring-phase1-spec.md §5.2.
//
// This module is deliberately THIN. Everything decidable by arithmetic lives
// in tested pure modules — `shared/src/target-scoring` owns the rectification
// math and the search driver, `validity.ts` owns the gate — so what remains
// here is only the part that genuinely needs pixels.
//
// The OpenCV calls go through `DiscOps`, as the close-up lock's go through
// `CloseupOps`: on the device react-native-fast-opencv (opencv.ts), in Node
// the OpenCV.js build (spike/cv/parity/opencv-js-disc-ops.ts), so an
// evaluation runs this same code on the same library the phone runs.
//
// Two integration facts from the spike (§4.6) shape it:
//  * there is no `imread`: pixels arrive via `Mat.createFromBase64`;
//  * there is no per-pixel accessor: `toBuffer()` copies a whole Mat, so a JS
//    loop is only affordable over small reduced arrays. Rule: native ops for
//    everything, `warpPolar` for anything radial, small arrays into JS.
import type { EllipseFit, RectificationTransform } from '@shotledger/shared';
import {
  applyRefinement,
  buildRectification,
  coarseToFineRefine,
  scoreRadialProfile,
} from '@shotledger/shared';

import type { Homography } from './corners';
import { pickFaceCandidate, type FaceCandidate } from './face-candidate';
import type { RectifiedCanvas } from './tap-snap';
import type { GeometryMetrics } from './validity';

/** Rectified working canvas resolution, as in the spike. Fixing it makes
 *  runtime independent of the input photo's size. */
export const CANVAS_PX_PER_MM = 4;

/** OpenCV's RotatedRect, as `fitEllipse` returns it. */
export interface RotatedRectFit {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

/**
 * The OpenCV calls the disc lock makes, one per method. `M` is an 8-bit
 * single-channel image and `C` a contour list, both owned by the
 * implementation until it releases them after the run.
 */
export interface DiscOps<M, C> {
  readonly size: (img: M) => { rows: number; cols: number };
  /** A zero-filled image. */
  readonly zeros: (rows: number, cols: number) => M;
  /** `GaussianBlur`, ksize x ksize, sigma 0 (derived from ksize). */
  readonly gaussianBlur: (src: M, ksize: number) => M;
  /** `threshold(0, 255, THRESH_BINARY_INV | THRESH_OTSU)`. */
  readonly thresholdOtsuInv: (src: M) => M;
  /** `getStructuringElement(MORPH_RECT, ksize x ksize)`. */
  readonly rectKernel: (ksize: number) => M;
  /** `morphologyEx` in place. */
  readonly morphologyEx: (img: M, op: 'open' | 'close', kernel: M) => void;
  /** `findContours(RETR_EXTERNAL, CHAIN_APPROX_NONE)`. */
  readonly externalContours: (binary: M) => C;
  readonly contourCount: (contours: C) => number;
  readonly contourArea: (contours: C, index: number) => number;
  readonly fitContourEllipse: (contours: C, index: number) => RotatedRectFit;
  /** `drawContours` of one contour, filled with 255. */
  readonly fillContour: (mask: M, contours: C, index: number) => void;
  /** `fitEllipse` on integer points, `[x0, y0, x1, y1, ...]`. */
  readonly fitPointsEllipse: (xy: readonly number[]) => RotatedRectFit;
  /** `warpPerspective` to size x size, INTER_CUBIC, white constant border. */
  readonly warpPerspective: (src: M, matrix: readonly number[], size: number) => M;
  /** `warpPolar`, linear, INTER_LINEAR: `rows` angles by `cols` radii. */
  readonly warpPolar: (
    src: M,
    cx: number,
    cy: number,
    maxRadius: number,
    cols: number,
    rows: number,
  ) => M;
  /** `mean(src, mask)` over a mask of filled circles about one integer
   *  centre, drawn in order (LINE_8). */
  readonly circleMaskMean: (
    src: M,
    cx: number,
    cy: number,
    circles: readonly { readonly radius: number; readonly value: number }[],
  ) => number;
  /** Row-major bytes, valid until the implementation releases `img`. */
  readonly bytes: (img: M) => { data: Uint8Array; rows: number; cols: number };
}

export interface GeometryPipelineResult {
  readonly transform: RectificationTransform;
  readonly ellipse: EllipseFit;
  readonly metrics: GeometryMetrics;
  /**
   * The rectified gray canvas, copied out before the native Mats are
   * released, so tap-snap can run on a typed array with no OpenCV call per
   * tap (see tap-snap.ts). One copy per photo — a few megabytes that the
   * caller drops when it leaves the marking phase.
   *
   * `center*Px` and `pxPerMm` describe the mapping the refinement settled on,
   * taken from the same numbers the refinement was scored with rather than
   * re-derived: the profile search centers on `canvasSize / 2 + dxMm *
   * CANVAS_PX_PER_MM` and scores ring radii at `CANVAS_PX_PER_MM * scale`.
   */
  readonly canvas: RectifiedCanvas;
}

/**
 * Smallest share of the frame a contour must cover to be considered the face
 * at all. The printed black zone fills a good part of any usable photo; this
 * only keeps `fitEllipse` away from specks, where a fitted ellipse says
 * nothing and the call can fail outright on too few points.
 */
const MIN_CANDIDATE_AREA_FRACTION = 0.005;

function discMean<M, C>(ops: DiscOps<M, C>, gray: M, cx: number, cy: number, r: number): number {
  return ops.circleMaskMean(gray, Math.round(cx), Math.round(cy), [
    { radius: Math.max(2, Math.round(r)), value: 255 },
  ]);
}

function annulusMean<M, C>(
  ops: DiscOps<M, C>,
  gray: M,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
): number {
  return ops.circleMaskMean(gray, Math.round(cx), Math.round(cy), [
    { radius: Math.max(2, Math.round(r1)), value: 255 },
    { radius: Math.max(1, Math.round(r0)), value: 0 },
  ]);
}

/**
 * OpenCV reports a RotatedRect's size as (width, height) with the angle
 * measured against that axis order. `buildRectification` requires the axes
 * pre-sorted (math spec GB5); rotating by 90° when they swap keeps the angle
 * consistent with the new order.
 */
function toEllipseFit(rect: RotatedRectFit): EllipseFit {
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
function findFace<M, C>(ops: DiscOps<M, C>, gray: M): { ellipse: EllipseFit; filled: M } {
  const blurred = ops.gaussianBlur(gray, 31);
  const binary = ops.thresholdOtsuInv(blurred);

  const kernel = ops.rectKernel(9);
  ops.morphologyEx(binary, 'open', kernel);
  ops.morphologyEx(binary, 'close', kernel);

  const contours = ops.externalContours(binary);

  // Shape, not just size: see face-candidate.ts. A contour has to be large
  // enough for fitEllipse to mean anything before it is worth describing, so
  // tiny specks are skipped rather than fitted.
  const { rows, cols } = ops.size(gray);
  const minCandidateArea = MIN_CANDIDATE_AREA_FRACTION * rows * cols;
  const candidates: FaceCandidate[] = [];
  const count = ops.contourCount(contours);
  for (let i = 0; i < count; i += 1) {
    const area = ops.contourArea(contours, i);
    if (area < minCandidateArea) continue;
    const fit = toEllipseFit(ops.fitContourEllipse(contours, i));
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

  const rect = ops.fitContourEllipse(contours, best);

  const filled = ops.zeros(rows, cols);
  ops.fillContour(filled, contours, best);

  return { ellipse: toEllipseFit(rect), filled };
}

/**
 * Stage 1b: re-fit the black-zone boundary from ray casts, dropping any ray
 * that leaves the frame — "much steadier than one contour fit when the card
 * is cropped" (target_cv.py:_refit_rays).
 *
 * The mask is pulled into JS once; 360 rays over it is a few milliseconds,
 * where the same walk through native calls would be seconds.
 */
function refitRays<M, C>(
  ops: DiscOps<M, C>,
  filled: M,
  ellipse: EllipseFit,
  iterations = 3,
  rayCount = 360,
): EllipseFit {
  const { data: buffer, rows, cols } = ops.bytes(filled);
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

    current = toEllipseFit(ops.fitPointsEllipse(found));
  }
  return current;
}

/**
 * The 3x3 image->canvas matrix, derived from the shared rectification so the
 * canvas is exactly `buildRectification` scaled to CANVAS_PX_PER_MM and
 * centered. One source of truth for the linear map is what makes a mark land
 * in the same target-mm the scorer uses.
 */
export function canvasHomography(t: RectificationTransform, canvasSize: number): number[] {
  const [a, b, c, d] = t.m;
  const k = CANVAS_PX_PER_MM;
  const half = canvasSize / 2;
  const tx = half - k * (a * t.center.x + b * t.center.y) + k * t.offset.x;
  const ty = half - k * (c * t.center.x + d * t.center.y) + k * t.offset.y;
  // prettier-ignore
  return [
    k * a, k * b, tx,
    k * c, k * d, ty,
    0,     0,     1,
  ];
}

/**
 * The radial edge profile at a candidate center. `warpPolar` turns the radial
 * problem into a row reduction — it is the primitive the spike wished for,
 * since `remap` is missing upstream and this is the better tool anyway
 * (spike §4.6).
 */
function radialProfile<M, C>(
  ops: DiscOps<M, C>,
  canvas: M,
  cx: number,
  cy: number,
  radiusPx: number,
): Float64Array {
  const angleBins = 360;
  const polar = ops.warpPolar(canvas, cx, cy, radiusPx, Math.round(radiusPx), angleBins);

  const { data: buffer, rows, cols } = ops.bytes(polar);
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

/** Median absolute deviation — the normalizer that turns the profile score
 *  into an absolute threshold instead of a proxy for the photo's contrast. */
function medianAbsoluteDeviation(values: Float64Array): number {
  const sorted = Array.from(values).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const deviations = sorted.map((v) => Math.abs(v - median)).sort((x, y) => x - y);
  return deviations[Math.floor(deviations.length / 2)] ?? 0;
}

export interface DiscLockOptions {
  /** The photo's size, for the gate's frame checks. */
  readonly width: number;
  readonly height: number;
  readonly referenceDiameterMm: number;
  /** Ascending ring radii, mm — the template the profile is matched against. */
  readonly ringRadiiMm: readonly number[];
}

/**
 * Grey pixels in, a target-mm transform and the gate's metrics out.
 *
 * This function never decides whether the result is trustworthy — it only
 * measures. `checkGeometryValidity` makes that call, so the threshold logic
 * stays in a module that can be unit-tested against the real corpus numbers.
 */
export function runDiscLock<M, C>(
  ops: DiscOps<M, C>,
  gray: M,
  options: DiscLockOptions,
): GeometryPipelineResult {
  const { ellipse: initial, filled } = findFace(ops, gray);
  const ellipse = refitRays(ops, filled, initial);

  const base = buildRectification(ellipse, options.referenceDiameterMm);
  const outerRadiusMm = (options.ringRadiiMm[options.ringRadiiMm.length - 1] ?? 250) * 1.05;
  const canvasSize = Math.round(2 * outerRadiusMm * CANVAS_PX_PER_MM);

  const canvas = ops.warpPerspective(gray, canvasHomography(base, canvasSize), canvasSize);

  // The profile depends only on (dx, dy) — `scale` merely rescales the
  // radius lookup — so it is memoised per center, exactly as the spike's
  // loop nesting does. Without this the search would warpPolar once per
  // (dx, dy, scale) triple rather than once per center: ~150 calls instead
  // of a few thousand.
  const cache = new Map<string, Float64Array>();
  const radiusPx = outerRadiusMm * CANVAS_PX_PER_MM;
  const profileAt = (dxMm: number, dyMm: number): Float64Array => {
    const key = `${dxMm.toFixed(3)}:${dyMm.toFixed(3)}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const profile = radialProfile(
      ops,
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

  const transform = applyRefinement(base, refined);

  // Gate metrics, measured on the same pixels the geometry used.
  const mad = medianAbsoluteDeviation(profileAt(refined.dxMm, refined.dyMm));
  const r = ellipse.minorAxis / 2;
  const inner = discMean(ops, gray, ellipse.center.x, ellipse.center.y, 0.7 * r);
  const outer = annulusMean(ops, gray, ellipse.center.x, ellipse.center.y, 1.15 * r, 1.4 * r);

  const metrics: GeometryMetrics = {
    axisRatio: ellipse.majorAxis / ellipse.minorAxis,
    zoneFraction: ellipse.majorAxis / Math.max(options.width, options.height),
    centerInFrame:
      ellipse.center.x >= 0 &&
      ellipse.center.x < options.width &&
      ellipse.center.y >= 0 &&
      ellipse.center.y < options.height,
    zoneContrastGray: outer - inner,
    profileScore: mad > 1e-6 ? refined.score / mad : 0,
  };

  const { data: bytes } = ops.bytes(canvas);
  return {
    transform,
    ellipse,
    metrics,
    canvas: {
      // Copied: the bytes are only valid until the ops release the canvas.
      data: Uint8Array.from(bytes),
      size: canvasSize,
      centerXPx: canvasSize / 2 + refined.dxMm * CANVAS_PX_PER_MM,
      centerYPx: canvasSize / 2 + refined.dyMm * CANVAS_PX_PER_MM,
      pxPerMm: CANVAS_PX_PER_MM * refined.scale,
    },
  };
}

/**
 * The rectified gray canvas for a photo whose image-px -> target-mm mapping is
 * already known — the hand-placed corners' homography — so tap-snap and the
 * hole detector get the same 4 px/mm, target-centred canvas the automatic
 * lock produces. Also what makes a close-up usable: the corners can sit on
 * any visible ring, and the canvas only holds what the photo shows (the rest
 * is white padding, which the detector masks out).
 */
export function rectifyWithHomography<M, C>(
  ops: DiscOps<M, C>,
  gray: M,
  options: {
    /** Image px -> target mm. */
    readonly toMm: Homography;
    /** Radius of the outermost scoring ring, mm. */
    readonly outerRadiusMm: number;
  },
): RectifiedCanvas {
  const k = CANVAS_PX_PER_MM;
  const canvasSize = Math.round(2 * options.outerRadiusMm * 1.05 * k);
  const half = canvasSize / 2;
  // canvas px = k * mm + half, and mm = toMm(image px).
  const h = options.toMm;
  // prettier-ignore
  const toCanvas = [
    k * h[0] + half * h[6], k * h[1] + half * h[7], k * h[2] + half * h[8],
    k * h[3] + half * h[6], k * h[4] + half * h[7], k * h[5] + half * h[8],
    h[6],                   h[7],                   h[8],
  ];
  const canvas = ops.warpPerspective(gray, toCanvas, canvasSize);
  const { data: bytes } = ops.bytes(canvas);
  return {
    // Copied: the bytes are only valid until the ops release the canvas.
    data: Uint8Array.from(bytes),
    size: canvasSize,
    centerXPx: half,
    centerYPx: half,
    pxPerMm: k,
  };
}
