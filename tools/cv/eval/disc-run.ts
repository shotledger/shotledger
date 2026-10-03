// The app's disc lock on one grey photo in Node: runDiscLock on OpenCV.js,
// the validity gate, and the image px -> mm mapping scan.tsx derives from it.
// `@shotledger/shared` resolves only from inside app/ and shared/.
import { SPSF_PISTOL_25M_PRECISION } from '../../../shared/src/target-scoring/targets';
import type { Homography } from '../../../app/src/features/photo-scoring/corners';
import {
  CANVAS_PX_PER_MM,
  type GeometryPipelineResult,
  runDiscLock,
} from '../../../app/src/features/photo-scoring/disc-lock';
import {
  fromRectification,
  homographyOf,
  invertHomography,
} from '../../../app/src/features/photo-scoring/transform';
import {
  checkGeometryValidity,
  type ValidityResult,
} from '../../../app/src/features/photo-scoring/validity';
import { type Cv, openCvJsDiscOps } from './opencv-js-disc-ops';

const FACE = SPSF_PISTOL_25M_PRECISION;

export interface DiscRun {
  readonly ms: number;
  /** Why the lock threw ("no dark region found"), else null. */
  readonly error: string | null;
  readonly result: GeometryPipelineResult | null;
  readonly validity: ValidityResult | null;
  /** Image px -> mm, as scan.tsx's `discToMm`; null only when the lock threw. */
  readonly toMm: Homography | null;
  /**
   * Image px -> mm as the rectified canvas lays it out (`pxPerMm`, the
   * centre), which is what tap-snap and the hole proposals read. By
   * refineRectification's contract it is `toMm` divided by the refined scale
   * squared, so the two agree only where the scale search settled on 1.
   */
  readonly canvasToMm: Homography | null;
}

export function runDisc(
  cv: Cv,
  gray: { data: Uint8Array; width: number; height: number },
): DiscRun {
  const ops = openCvJsDiscOps(cv);
  const t0 = performance.now();
  try {
    const result = runDiscLock(ops, ops.gray(gray.data, gray.width, gray.height), {
      width: gray.width,
      height: gray.height,
      referenceDiameterMm: FACE.referenceDiameterMm,
      ringRadiiMm: FACE.rings.map((ring) => ring.diameterMm / 2),
    });
    const ms = performance.now() - t0;
    const toMm = invertHomography(homographyOf(fromRectification(result.transform)));
    const s = result.canvas.pxPerMm / CANVAS_PX_PER_MM;
    return {
      ms,
      error: null,
      result,
      validity: checkGeometryValidity(result.metrics),
      toMm,
      canvasToMm: toMm && (toMm.map((v, i) => (i < 6 ? v / (s * s) : v)) as unknown as Homography),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ms: performance.now() - t0,
      error: message,
      result: null,
      validity: null,
      toMm: null,
      canvasToMm: null,
    };
  } finally {
    ops.release();
  }
}
