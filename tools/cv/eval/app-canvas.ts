// The rectified grey canvas the app hands the hole proposals, for one photo:
// the disc lock's (runDiscLock on OpenCV.js), or the close-up or milsnabb
// lock's through rectifyWithHomography, as scan.tsx does. holes-prep.tool.ts
// writes it to disk; mark-holes.tool.ts pre-labels on it.
import {
  closeupWorkImage,
  lockCloseupWork,
  passesCloseupGate,
} from '../../../app/src/features/photo-scoring/closeup-lock';
import {
  rectifyWithHomography,
  runDiscLock,
} from '../../../app/src/features/photo-scoring/disc-lock';
import type { ProposalFace } from '../../../app/src/features/photo-scoring/hole-proposals';
import {
  lockMilsnabbWork,
  passesMilsnabbGate,
} from '../../../app/src/features/photo-scoring/milsnabb-lock';
import type { RectifiedCanvas } from '../../../app/src/features/photo-scoring/tap-snap';
import { checkGeometryValidity } from '../../../app/src/features/photo-scoring/validity';
import {
  CANVAS_PX,
  FACE,
  faceFor,
  type Lock,
  RING_RADII_MM,
  SPIKE_CANVAS_PX,
} from '../fit/label-canvas';
import { type Cv, openCvJsDiscOps } from './opencv-js-disc-ops';

export const CALIBER_MM = 5.6;

/** Moves a mark read off mark-holes' grid onto the app canvas: the disc grid is
 *  a 1040 px crop of the 2100 px canvas, a close-up's is labelled in canvas px. */
export const labelShift = (lock: Lock) => (lock === 'disc' ? (CANVAS_PX - SPIKE_CANVAS_PX) / 2 : 0);

/** What the hole proposals are told about the face on a lock's canvas. */
export function proposalFace(lock: Lock): ProposalFace {
  const face = faceFor(lock);
  return {
    caliberMm: CALIBER_MM,
    blackRadiusMm: face.blackRadiusMm,
    maxRadiusMm: face.ringRadiiMm.at(-1)!,
    ringRadiiMm: face.ringRadiiMm,
  };
}

/** The app's canvas of a photo's grey bytes, or why there is none. */
export function appCanvas(
  cv: Cv,
  photo: { readonly gray: Uint8Array; readonly width: number; readonly height: number },
  lock: Lock,
): { readonly canvas: RectifiedCanvas; readonly note: string } | string {
  const face = faceFor(lock);
  const ops = openCvJsDiscOps(cv);
  try {
    const gray = ops.gray(photo.gray, photo.width, photo.height);
    if (lock === 'closeup' || lock === 'milsnabb') {
      const work = closeupWorkImage({ data: photo.gray, width: photo.width, height: photo.height });
      let toMm;
      if (lock === 'closeup') {
        const closeup = lockCloseupWork(work);
        if (!passesCloseupGate(closeup)) return 'close-up lock failed its gate; skipped';
        toMm = closeup.toMm;
      } else {
        const milsnabb = lockMilsnabbWork(work);
        if (!passesMilsnabbGate(milsnabb)) return 'milsnabb lock failed its gate; skipped';
        toMm = milsnabb.toMm;
      }
      const canvas = rectifyWithHomography(ops, gray, {
        toMm,
        outerRadiusMm: face.ringRadiiMm.at(-1)!,
      });
      return { canvas, note: lock === 'closeup' ? 'close-up lock' : 'milsnabb lock' };
    }
    const result = runDiscLock(ops, gray, {
      width: photo.width,
      height: photo.height,
      referenceDiameterMm: FACE.referenceDiameterMm,
      ringRadiiMm: RING_RADII_MM,
    });
    const { valid, reasons } = checkGeometryValidity(result.metrics);
    return {
      canvas: result.canvas,
      note: `disc lock, gate ${valid ? 'pass' : reasons.join(',')}`,
    };
  } catch (error: unknown) {
    return `${lock} lock failed (${error instanceof Error ? error.message : String(error)}); skipped`;
  } finally {
    ops.release();
  }
}
