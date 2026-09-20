// One interface over the two ways phase 1 can know where the target is.
//
// The automatic path produces a `RectificationTransform` — affine, because a
// single conic does not determine a homography, so the fitted ellipse can
// only undo rotation and anisotropic scale (CV spike §2 stage 3). The manual
// corner fallback produces a full projective map. Everything downstream (the
// ring overlay, the tap handler, the loupe) only ever needs "px <-> mm", so
// it takes this interface and never learns which path produced it.
import type { Point, RectificationTransform } from '@shotledger/shared';
import { imageToTargetMm, targetMmToImage } from '@shotledger/shared';

import type { ProjectiveTransform } from './corners';
import { applyHomography } from './corners';

export interface TargetTransform {
  /** Image pixel -> target millimeters (origin at the center, y down). */
  readonly toMm: (p: Point) => Point;
  /** Target millimeters -> image pixel. */
  readonly toImage: (p: Point) => Point;
  /** How the transform was obtained — surfaced in the UI, since a manually
   *  adjusted target deserves a different level of trust than a locked one. */
  readonly source: 'auto' | 'manual';
}

export function fromRectification(t: RectificationTransform): TargetTransform {
  return {
    toMm: (p) => imageToTargetMm(t, p),
    toImage: (p) => targetMmToImage(t, p),
    source: 'auto',
  };
}

export function fromProjective(t: ProjectiveTransform): TargetTransform {
  return {
    toMm: (p) => applyHomography(t.toMm, p),
    toImage: (p) => applyHomography(t.toImage, p),
    source: 'manual',
  };
}

/**
 * Scales a transform built for one image size onto another — the geometry
 * runs on the 2048 px copy, but the marking screen lays out at whatever width
 * the phone gives it. Without this the marks would be offset by the ratio
 * between the two.
 */
export function scaleTransform(transform: TargetTransform, factor: number): TargetTransform {
  if (!(factor > 0)) throw new RangeError(`factor must be > 0, got ${factor}`);
  return {
    toMm: (p) => transform.toMm({ x: p.x / factor, y: p.y / factor }),
    toImage: (p) => {
      const q = transform.toImage(p);
      return { x: q.x * factor, y: q.y * factor };
    },
    source: transform.source,
  };
}
