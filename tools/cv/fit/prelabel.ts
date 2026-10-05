// The shipped hole proposals on a photo, in mark-holes' label px: the
// starting marks of CV_MARK_PRELABEL, for a human to correct.
import { proposeHoles } from '../../../app/src/features/photo-scoring/hole-proposals';
import { appCanvas, labelShift, proposalFace } from '../eval/app-canvas';
import type { Cv } from '../eval/opencv-js-disc-ops';
import type { Lock } from './label-canvas';

export interface Prelabel {
  /** Label px, as a hand mark is read off the grid. */
  readonly x: number;
  readonly y: number;
  readonly p: number;
}

/** The proposals at `threshold` on the app's canvas of the photo, highest
 *  probability first, or why there is no canvas. */
export function prelabelHoles(
  cv: Cv,
  photo: { readonly gray: Uint8Array; readonly width: number; readonly height: number },
  lock: Lock,
  threshold: number,
): Prelabel[] | string {
  const prepared = appCanvas(cv, photo, lock);
  if (typeof prepared === 'string') return prepared;
  const { canvas } = prepared;
  const shift = labelShift(lock);
  return proposeHoles(canvas, proposalFace(lock), threshold).map((h) => ({
    x: h.xMm * canvas.pxPerMm + canvas.centerXPx - shift,
    y: h.yMm * canvas.pxPerMm + canvas.centerYPx - shift,
    p: h.probability,
  }));
}

export function parseThreshold(value: string, variable: string): number {
  const t = Number(value);
  if (!(t > 0 && t < 1)) throw new Error(`${variable}=${value} (a probability, e.g. 0.3)`);
  return t;
}
