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

import type { Homography, ProjectiveTransform } from './corners';
import { applyHomography } from './corners';

export interface TargetTransform {
  /** Image pixel -> target millimeters (origin at the center, y down). */
  readonly toMm: (p: Point) => Point;
  /** Target millimeters -> image pixel. */
  readonly toImage: (p: Point) => Point;
  /** How the transform was obtained — surfaced in the UI, since a manually
   *  adjusted target deserves a different level of trust than a locked one. */
  readonly source: 'auto' | 'manual';
  /** The mm -> image-px matrix, when the transform is built from one. */
  readonly mmToImage?: Homography;
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
    mmToImage: t.toImage,
  };
}

/** Inverse of a 3x3 by its adjugate. Null when singular. */
export function invertHomography(h: Homography): Homography | null {
  const [a, b, c, d, e, f, g, i, k] = h;
  const A = e * k - f * i;
  const B = -(d * k - f * g);
  const C = d * i - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv = [
    A,
    -(b * k - c * i),
    b * f - c * e,
    B,
    a * k - c * g,
    -(a * f - c * d),
    C,
    -(a * i - b * g),
    a * e - b * d,
  ].map((v) => v / det);
  return inv as unknown as Homography;
}

/**
 * The transform as a mm -> image-px homography. A manual transform carries its
 * matrix; one without a matrix is the affine automatic path, which three
 * points determine exactly.
 */
export function homographyOf(transform: TargetTransform): Homography {
  if (transform.mmToImage) return transform.mmToImage;
  const o = transform.toImage({ x: 0, y: 0 });
  const ex = transform.toImage({ x: 1, y: 0 });
  const ey = transform.toImage({ x: 0, y: 1 });
  return [ex.x - o.x, ey.x - o.x, o.x, ex.y - o.y, ey.y - o.y, o.y, 0, 0, 1];
}

/** What `series.photo_geometry` holds: the geometry image's size and the transform. */
export interface PhotoGeometry {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly source: 'auto' | 'manual';
  /** Row-major 3x3, target-mm -> geometry-image px. */
  readonly mmToImage: Homography;
}

export function serializeTransform(
  transform: TargetTransform,
  imageWidth: number,
  imageHeight: number,
): string {
  const geometry: PhotoGeometry = {
    imageWidth,
    imageHeight,
    source: transform.source,
    mmToImage: homographyOf(transform),
  };
  return JSON.stringify(geometry);
}

/**
 * Parses `series.photo_geometry`. Null for a missing, malformed or singular
 * value — the caller then shows the stats without an overlay.
 */
export function deserializeTransform(
  json: string | null | undefined,
): { geometry: PhotoGeometry; transform: TargetTransform } | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { imageWidth, imageHeight, source, mmToImage } = parsed as Record<string, unknown>;
  if (
    !(typeof imageWidth === 'number' && imageWidth > 0) ||
    !(typeof imageHeight === 'number' && imageHeight > 0) ||
    (source !== 'auto' && source !== 'manual') ||
    !Array.isArray(mmToImage) ||
    mmToImage.length !== 9 ||
    !mmToImage.every((v) => typeof v === 'number' && Number.isFinite(v))
  ) {
    return null;
  }
  const toImage = mmToImage as unknown as Homography;
  const toMm = invertHomography(toImage);
  if (!toMm) return null;
  const transform: TargetTransform = {
    toMm: (p) => applyHomography(toMm, p),
    toImage: (p) => applyHomography(toImage, p),
    source,
    mmToImage: toImage,
  };
  return { geometry: { imageWidth, imageHeight, source, mmToImage: toImage }, transform };
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
    ...(transform.mmToImage && {
      mmToImage: transform.mmToImage.map((v, i) =>
        i < 6 ? v * factor : v,
      ) as unknown as Homography,
    }),
  };
}
