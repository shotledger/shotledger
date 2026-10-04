// Crops cut around a lock on a real photo, upsampled to 2048 px: the views
// milsnabb.eval.ts and guards.eval.ts measure the locks on.
import type { GrayImage } from '../../../app/src/features/photo-scoring/closeup-lock';
import { applyHomography, type Homography } from '../../../app/src/features/photo-scoring/corners';
import { invertHomography } from '../../../app/src/features/photo-scoring/transform';

/** Half-width (mm) of each view; a crop is 1.33 times as tall. */
export const MIL_VIEWS = [
  ['10', 55],
  ['9-10', 100],
  ['9-10 wide', 120],
] as const;
export const PRE_VIEWS = [
  ['pre 9-10', 55],
  ['pre 8-10', 80],
  ['pre 7-10', 110],
  ['mil 9-10', 100],
  ['mil 9-10 wide', 120],
] as const;
/** [half-width, centre offset x, y] mm: none has the centre in frame. */
export const MIL_OUTER = [
  [60, 0, 150],
  [60, 0, -150],
  [60, 70, 0],
  [60, -70, 0],
  [40, 0, 210],
  [40, 0, -210],
  [40, 55, 120],
  [40, -55, -120],
] as const;
export const PRE_OUTER = [
  [80, 170, 0],
  [80, 0, 170],
  [80, -170, 0],
] as const;
/** A small deterministic generator, so a rerun cuts the same crops. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The generator's seed for a photo, as milsnabb.eval.ts has always drawn it. */
export const photoSeed = (photo: string) =>
  7 + photo.length * 31 + photo.charCodeAt(photo.length - 5);

export interface Crop {
  readonly view: string;
  readonly trial: number | 'outer';
  readonly image: GrayImage;
  /** crop px -> original px */
  readonly back: Homography;
}

/** Bilinear crop of [x0, x1) x [y0, y1), resized so its long side is 2048. */
export function cut(g: GrayImage, x0: number, y0: number, x1: number, y1: number) {
  const up = 2048 / Math.max(x1 - x0, y1 - y0);
  const w = Math.round((x1 - x0) * up);
  const h = Math.round((y1 - y0) * up);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(Math.max(y0 + (y + 0.5) / up - 0.5, 0), g.height - 1);
    const iy = Math.min(Math.floor(sy), g.height - 2);
    const fy = sy - iy;
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(Math.max(x0 + (x + 0.5) / up - 0.5, 0), g.width - 1);
      const ix = Math.min(Math.floor(sx), g.width - 2);
      const fx = sx - ix;
      const at = (xx: number, yy: number) => g.data[yy * g.width + xx] as number;
      const v =
        (1 - fy) * ((1 - fx) * at(ix, iy) + fx * at(ix + 1, iy)) +
        fy * ((1 - fx) * at(ix, iy + 1) + fx * at(ix + 1, iy + 1));
      data[y * w + x] = Math.round(v);
    }
  }
  const s = 1 / up;
  const back = [
    s,
    0,
    x0 + 0.5 * s - 0.5,
    0,
    s,
    y0 + 0.5 * s - 0.5,
    0,
    0,
    1,
  ] as unknown as Homography;
  return { image: { width: w, height: h, data }, back };
}

/**
 * Per view [name, half-width mm], `trials` crops 1.33 times as tall as wide:
 * the first centred, the rest off-centre by up to 30%. Then one crop per
 * `outer` entry [half-width, centre offset x, y] mm. A crop past the photo's
 * edge is skipped.
 */
export function* crops(
  g: GrayImage,
  toMm: Homography,
  views: readonly (readonly [string, number])[],
  outer: readonly (readonly [number, number, number])[],
  trials: number,
  random: () => number,
): Generator<Crop> {
  const toImage = invertHomography(toMm)!;
  const c0 = applyHomography(toImage, { x: 0, y: 0 });
  const px = applyHomography(toImage, { x: 1, y: 0 });
  const py = applyHomography(toImage, { x: 0, y: 1 });
  const ppmm = Math.sqrt(Math.abs((px.x - c0.x) * (py.y - c0.y) - (px.y - c0.y) * (py.x - c0.x)));
  const specs: [string, number, number | 'outer', number, number][] = [];
  for (const [view, hw] of views) {
    for (let t = 0; t < trials; t += 1) {
      const ox = t ? (random() * 0.6 - 0.3) * hw : 0;
      const oy = t ? (random() * 0.6 - 0.3) * hw : 0;
      specs.push([view, hw, t, ox, oy]);
    }
  }
  for (const [hw, dx, dy] of outer) specs.push(['outer', hw, 'outer', dx, dy]);
  for (const [view, hw, trial, ox, oy] of specs) {
    const cx = c0.x + ox * ppmm;
    const cy = c0.y + oy * ppmm;
    const x0 = Math.trunc(cx - hw * ppmm);
    const x1 = Math.trunc(cx + hw * ppmm);
    const y0 = Math.trunc(cy - 1.33 * hw * ppmm);
    const y1 = Math.trunc(cy + 1.33 * hw * ppmm);
    if (x0 < 0 || y0 < 0 || x1 > g.width || y1 > g.height) continue;
    yield { view, trial, ...cut(g, x0, y0, x1, y1) };
  }
}

/** 3x3 row-major product a * b. */
export function mul(a: readonly number[], b: readonly number[]): Homography {
  const o: number[] = [];
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1)
      o.push(a[3 * r]! * b[c]! + a[3 * r + 1]! * b[3 + c]! + a[3 * r + 2]! * b[6 + c]!);
  return o as unknown as Homography;
}
