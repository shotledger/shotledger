// Close-up lock: the 25 m precision face found from its ring lines alone, for
// a photo of the inner rings where the black disc's edge is out of frame.
//
// A line-for-line port of the Python spike's close-up lock, which the gate was
// measured with (numbers: docs/specs/cv-closeup-lock-2026-09.md).
// `closeup-lock.fixtures.json` is a snapshot of this module on synthetic
// close-ups (`pnpm cv:fixtures`); regenerate it after a change on purpose.
//
// The stage:
//  1. centre: every strong edge votes along its normal, at 512 px and then
//     at full resolution in a window around that peak;
//  2. step: the radial line profile from that centre is periodic, and its
//     period is one 25 mm step;
//  3. shape: points on ring k, divided by k, lie on one ellipse; its fit, then
//     a robust homography on every ring point, maps image px to mm;
//  4. a fit whose odd rings sit between printed lines is at half the step
//     (the X ring won), and is refitted at double.
//
// The four image-wide operations go through `CloseupOps`, so a device can
// hand them to OpenCV (closeup-lock-native.ts); everything else is plain JS.
import { reflectIndex } from '@shotledger/shared';

import { applyHomography, type Homography } from './corners';
import { quantile } from './order-statistics';
import { invertHomography } from './transform';

// ---------------------------------------------------------------- constants

export const RING_STEP_MM = 25;
export const WORK_LONG_SIDE = 1536;
const VOTE_LONG_SIDE = 512;
const VOTE_WINDOW = 24;
const VOTE_MAX_EDGES = 30000;
export const NANG = 720;
const PRIOR_WEIGHT = 10;
const F_SCALE_MM = 0.5;
const LM_ITERS = 100;

/** The gate (spec): median fit residual, comb score, ring offset, and how
 *  much brighter the paper outside the black is than the black (a precision
 *  lock on a milsnabb photo sees black there; real precision locks >= 0.58). */
export const CLOSEUP_GATE = {
  residualMm: 0.5,
  comb: 8,
  ringOffsetMm: 0.5,
  faceContrast: 0.25,
} as const;

/** Radii (mm) inside the precision black, and on the paper outside it. */
const FACE_BLACK_MM = [55, 65, 75, 85] as const;
const FACE_PAPER_MM = [112, 118, 125, 132, 140] as const;

// ---------------------------------------------------------------- types

/** A grayscale image, row-major. */
export interface GrayImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Float32Array | Float64Array;
}

/** A float image, row-major. */
export interface CloseupImage {
  readonly width: number;
  readonly height: number;
  readonly data: Float64Array;
}

/**
 * The image-wide operations, so a device can hand them to OpenCV. The pure
 * versions below are the reference and compute what OpenCV does in float64.
 */
export interface CloseupOps {
  /** `cv2.resize(..., INTER_AREA)` to exactly width x height. */
  readonly resizeArea: (img: GrayImage, width: number, height: number) => CloseupImage;
  /** `cv2.GaussianBlur` with ksize (0, 0), BORDER_REFLECT_101. */
  readonly blur: (img: CloseupImage, sigmaX: number, sigmaY: number) => Float64Array;
  /** 3x3 Sobel in x and in y, BORDER_REFLECT_101. */
  readonly sobel: (img: CloseupImage) => { gx: Float64Array; gy: Float64Array };
  /**
   * nang x rmax bilinear samples at (cx + r cos a, cy + r sin a) with
   * a = 2 pi i / nang — `cv2.warpPolar`'s grid; a neighbour outside the image
   * counts as 0.
   */
  readonly polar: (
    img: CloseupImage,
    cx: number,
    cy: number,
    nang: number,
    rmax: number,
  ) => Float64Array;
}

export interface CloseupLock {
  /** Image px -> target mm, centre at (0, 0), row-major, [8] = 1. */
  readonly toMm: Homography;
  /** The target centre, image px. */
  readonly center: { readonly x: number; readonly y: number };
  readonly residualMm: number;
  readonly comb: number;
  /** The worst ring's distance from its printed line, mm; null when no ring
   *  is mostly in frame. */
  readonly ringOffsetMm: number | null;
  /** Ring lines that took part in the fit. */
  readonly rings: number;
  readonly support: number;
  readonly axisRatio: number;
  /** Paper minus black through the lock, in the photo's p5-p95 range; null
   *  when either zone is out of frame. */
  readonly faceContrast: number | null;
  /** Work px, for the lock-step fixture. */
  readonly voteCenter: { readonly x: number; readonly y: number };
  /** Work px. */
  readonly period: number;
}

/** The work image a lock runs on, and what the ring-offset yardstick reads. */
export interface CloseupWork {
  readonly g: CloseupImage;
  /** Original px -> work px. */
  readonly toWork: Homography;
  /** `|g - blur(g, 4)|`, the thin-line response the yardstick reads. */
  readonly lines: CloseupImage;
}

// ---------------------------------------------------------------- pure ops

/** OpenCV's ksize for a float image: round(8 sigma + 1), odd. */
export function gaussianKsize(sigma: number): number {
  return Math.round(sigma * 8 + 1) | 1;
}

function gaussian(sigma: number): Float64Array {
  const k = gaussianKsize(sigma);
  const r = (k - 1) / 2;
  const out = new Float64Array(k);
  let sum = 0;
  for (let i = 0; i < k; i += 1) {
    const v = Math.exp(-((i - r) * (i - r)) / (2 * sigma * sigma));
    out[i] = v;
    sum += v;
  }
  for (let i = 0; i < k; i += 1) out[i] = (out[i] as number) / sum;
  return out;
}

/** Separable convolution, rows first, BORDER_REFLECT_101. */
function separable(
  data: Float64Array,
  w: number,
  h: number,
  kx: Float64Array,
  ky: Float64Array,
): Float64Array {
  const pass = (input: Float64Array, kernel: Float64Array, alongX: boolean) => {
    const radius = (kernel.length - 1) / 2;
    if (radius === 0 && kernel[0] === 1) return input;
    const out = new Float64Array(w * h);
    const along = alongX ? w : h;
    const stride = alongX ? 1 : w;
    const across = alongX ? h : w;
    const acrossStride = alongX ? w : 1;
    for (let a = 0; a < across; a += 1) {
      const base = a * acrossStride;
      for (let p = 0; p < along; p += 1) {
        let sum = 0;
        if (p >= radius && p + radius < along) {
          let index = base + (p - radius) * stride;
          for (let k = 0; k < kernel.length; k += 1) {
            sum += (kernel[k] as number) * (input[index] as number);
            index += stride;
          }
        } else {
          for (let d = -radius; d <= radius; d += 1) {
            sum +=
              (kernel[d + radius] as number) *
              (input[base + reflectIndex(p + d, along) * stride] as number);
          }
        }
        out[base + p * stride] = sum;
      }
    }
    return out;
  };
  return pass(pass(data, kx, true), ky, false);
}

/** OpenCV's INTER_AREA weights along one axis: [dst, src, alpha] triples. */
function areaTable(ssize: number, dsize: number): number[] {
  const scale = 1 / (dsize / ssize);
  const tab: number[] = [];
  for (let dx = 0; dx < dsize; dx += 1) {
    const fsx1 = dx * scale;
    const fsx2 = fsx1 + scale;
    const cell = Math.min(scale, ssize - fsx1);
    let sx1 = Math.ceil(fsx1);
    let sx2 = Math.floor(fsx2);
    sx2 = Math.min(sx2, ssize - 1);
    sx1 = Math.min(sx1, sx2);
    // OpenCV keeps the weights in float32
    if (sx1 - fsx1 > 1e-3) tab.push(dx, sx1 - 1, Math.fround((sx1 - fsx1) / cell));
    for (let sx = sx1; sx < sx2; sx += 1) tab.push(dx, sx, Math.fround(1 / cell));
    if (fsx2 - sx2 > 1e-3) {
      tab.push(dx, sx2, Math.fround(Math.min(Math.min(fsx2 - sx2, 1), cell) / cell));
    }
  }
  return tab;
}

function resizeArea(img: GrayImage, width: number, height: number): CloseupImage {
  const { width: sw, height: sh, data } = img;
  const tx = areaTable(sw, width);
  const ty = areaTable(sh, height);
  const tmp = new Float64Array(sh * width);
  for (let y = 0; y < sh; y += 1) {
    const src = y * sw;
    const dst = y * width;
    for (let t = 0; t < tx.length; t += 3) {
      const d = dst + (tx[t] as number);
      tmp[d] =
        (tmp[d] as number) + (tx[t + 2] as number) * (data[src + (tx[t + 1] as number)] as number);
    }
  }
  const out = new Float64Array(height * width);
  for (let t = 0; t < ty.length; t += 3) {
    const dst = (ty[t] as number) * width;
    const src = (ty[t + 1] as number) * width;
    const a = ty[t + 2] as number;
    for (let x = 0; x < width; x += 1) {
      out[dst + x] = (out[dst + x] as number) + a * (tmp[src + x] as number);
    }
  }
  return { data: out, width, height };
}

export function bilinearAt(img: CloseupImage, x: number, y: number): number {
  const { data, width: w, height: h } = img;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let v = 0;
  for (let dy = 0; dy <= 1; dy += 1) {
    const yy = y0 + dy;
    if (yy < 0 || yy >= h) continue;
    const wy = dy ? fy : 1 - fy;
    for (let dx = 0; dx <= 1; dx += 1) {
      const xx = x0 + dx;
      if (xx < 0 || xx >= w) continue;
      v += (dx ? fx : 1 - fx) * wy * (data[yy * w + xx] as number);
    }
  }
  return v;
}

function polarAngles(nang: number): { cos: Float64Array; sin: Float64Array } {
  const cos = new Float64Array(nang);
  const sin = new Float64Array(nang);
  const step = (2 * Math.PI) / nang;
  for (let i = 0; i < nang; i += 1) {
    cos[i] = Math.cos(i * step);
    sin[i] = Math.sin(i * step);
  }
  return { cos, sin };
}

/** The reference implementation, pure JS. */
export const pureCloseupOps: CloseupOps = {
  resizeArea,
  blur: (img, sx, sy) => separable(img.data, img.width, img.height, gaussian(sx), gaussian(sy)),
  sobel: (img) => ({
    gx: separable(
      img.data,
      img.width,
      img.height,
      Float64Array.of(-1, 0, 1),
      Float64Array.of(1, 2, 1),
    ),
    gy: separable(
      img.data,
      img.width,
      img.height,
      Float64Array.of(1, 2, 1),
      Float64Array.of(-1, 0, 1),
    ),
  }),
  polar: (img, cx, cy, nang, rmax) => {
    const { cos, sin } = polarAngles(nang);
    const out = new Float64Array(nang * rmax);
    for (let i = 0; i < nang; i += 1) {
      const c = cos[i] as number;
      const s = sin[i] as number;
      for (let r = 0; r < rmax; r += 1) out[i * rmax + r] = bilinearAt(img, cx + r * c, cy + r * s);
    }
    return out;
  },
};

// ---------------------------------------------------------------- helpers

export type M3 = number[];

export function mul3(a: readonly number[], b: readonly number[]): M3 {
  const out: M3 = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out.push(
        (a[3 * r] as number) * (b[c] as number) +
          (a[3 * r + 1] as number) * (b[3 + c] as number) +
          (a[3 * r + 2] as number) * (b[6 + c] as number),
      );
    }
  }
  return out;
}

export function asHomography(m: readonly number[]): Homography {
  return [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]] as unknown as Homography;
}

/** numpy's median: the mean of the two middle values for an even count. */
export function median(values: Float64Array): number {
  const n = values.length;
  const s = Float64Array.from(values).sort();
  const mid = n >> 1;
  return n % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Gaussian elimination with partial pivoting; null when singular. */
function solve(a: readonly number[], b: readonly number[], n: number): number[] | null {
  const m: number[][] = [];
  for (let r = 0; r < n; r += 1) m.push([...a.slice(r * n, r * n + n), b[r] as number]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    }
    if (Math.abs(m[p]![c]!) < 1e-300) return null;
    if (p !== c) [m[p], m[c]] = [m[c]!, m[p]!];
    const lead = m[c]!;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const row = m[r]!;
      const f = row[c]! / lead[c]!;
      for (let k = c; k <= n; k += 1) row[k] = row[k]! - f * lead[k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

// ---------------------------------------------------------------- work image

/** Float64 work image at WORK_LONG_SIDE (never upscaled), blurred at 1 px. */
export function closeupWorkImage(
  image: GrayImage,
  ops: CloseupOps = pureCloseupOps,
  longSide = WORK_LONG_SIDE,
): CloseupWork {
  const { width: w0, height: h0 } = image;
  const s = Math.min(1, longSide / Math.max(w0, h0));
  const w = Math.trunc(w0 * s + 0.5);
  const h = Math.trunc(h0 * s + 0.5);
  const raw =
    w !== w0 || h !== h0
      ? ops.resizeArea(image, w, h)
      : { data: Float64Array.from(image.data), width: w, height: h };
  const sx = w / w0;
  const sy = h / h0;
  const g: CloseupImage = { data: ops.blur(raw, 1, 1), width: w, height: h };
  const smooth = ops.blur(g, 4, 4);
  const lines = new Float64Array(w * h);
  for (let i = 0; i < lines.length; i += 1) {
    lines[i] = Math.abs((g.data[i] as number) - (smooth[i] as number));
  }
  return {
    g,
    toWork: [sx, 0, 0.5 * sx - 0.5, 0, sy, 0.5 * sy - 0.5, 0, 0, 1],
    lines: { data: lines, width: w, height: h },
  };
}

// ---------------------------------------------------------------- centre vote

interface Edges {
  readonly xs: Int32Array;
  readonly ys: Int32Array;
  readonly ux: Float64Array;
  readonly uy: Float64Array;
}

/** Strongest 5% of the gradient, every n-th if too many, with unit normals. */
function edges(img: CloseupImage, ops: CloseupOps): Edges {
  const { gx, gy } = ops.sobel(img);
  const n = img.width * img.height;
  const mag = new Float64Array(n);
  for (let i = 0; i < n; i += 1) mag[i] = Math.hypot(gx[i] as number, gy[i] as number);
  const thr = quantile(mag, 0.95);
  const picked: number[] = [];
  for (let i = 0; i < n; i += 1) if ((mag[i] as number) > thr) picked.push(i);
  let index = picked;
  if (picked.length > VOTE_MAX_EDGES) {
    index = [];
    for (let i = 0; i < VOTE_MAX_EDGES; i += 1) {
      index.push(picked[Math.floor((i * picked.length) / VOTE_MAX_EDGES)] as number);
    }
  }
  const m = index.length;
  const out = {
    xs: new Int32Array(m),
    ys: new Int32Array(m),
    ux: new Float64Array(m),
    uy: new Float64Array(m),
  };
  for (let k = 0; k < m; k += 1) {
    const i = index[k] as number;
    out.xs[k] = i % img.width;
    out.ys[k] = Math.floor(i / img.width);
    out.ux[k] = (gx[i] as number) / (mag[i] as number);
    out.uy[k] = (gy[i] as number) / (mag[i] as number);
  }
  return out;
}

export function voteCenter(g: CloseupImage, ops: CloseupOps): { x: number; y: number } {
  const { width: W, height: H } = g;
  const f = Math.min(1, VOTE_LONG_SIDE / Math.max(H, W));
  const w = Math.trunc(W * f + 0.5);
  const h = Math.trunc(H * f + 0.5);
  const gv = w !== W || h !== H ? ops.resizeArea(g, w, h) : g;
  const e = edges(gv, ops);
  // A hole votes for its own centre only at a few px; skip short distances.
  const L = Math.max(h, w);
  const d0 = 0.04 * L;
  const nd = Math.ceil(1.2 * L - d0);
  const acc = new Float64Array(w * h);
  for (let k = 0; k < e.xs.length; k += 1) {
    const x = e.xs[k] as number;
    const y = e.ys[k] as number;
    const ux = e.ux[k] as number;
    const uy = e.uy[k] as number;
    for (let sgn = 1; sgn >= -1; sgn -= 2) {
      for (let i = 0; i < nd; i += 1) {
        const d = d0 + i;
        const fx = x + sgn * ux * d + 0.5;
        const fy = y + sgn * uy * d + 0.5;
        // the ray starts in frame, and once out it stays out
        if (!(fx >= 0 && fx < w && fy >= 0 && fy < h)) break;
        const index = Math.floor(fy) * w + Math.floor(fx);
        acc[index] = (acc[index] as number) + 1;
      }
    }
  }
  const blurred = ops.blur({ data: acc, width: w, height: h }, 1, 1);
  const best = argmax(blurred);
  const mx = best % w;
  const my = Math.floor(best / w);
  return refineVote(g, (mx + 0.5) * (W / w) - 0.5, (my + 0.5) * (H / h) - 0.5, ops);
}

function argmax(a: Float64Array): number {
  let best = 0;
  for (let i = 1; i < a.length; i += 1) if ((a[i] as number) > (a[best] as number)) best = i;
  return best;
}

/** The vote again at full resolution, counted only in a window around the
 *  coarse peak: each normal votes only along the stretch that crosses it. */
function refineVote(g: CloseupImage, cx: number, cy: number, ops: CloseupOps) {
  const { width: W, height: H } = g;
  const e = edges(g, ops);
  const L = Math.max(H, W);
  const d0 = 0.04 * L;
  const step = 1.5;
  const n = Math.ceil((1.2 * L - d0) / step);
  const R = VOTE_WINDOW;
  const ox = Math.floor(cx + 0.5) - R;
  const oy = Math.floor(cy + 0.5) - R;
  const reach = step * R;
  const side = 2 * R + 1;
  const acc = new Float64Array(side * side);
  for (let k = 0; k < e.xs.length; k += 1) {
    const x = e.xs[k] as number;
    const y = e.ys[k] as number;
    const ux = e.ux[k] as number;
    const uy = e.uy[k] as number;
    if (Math.abs(ux * (cy - y) - uy * (cx - x)) > reach) continue;
    for (let sgn = 1; sgn >= -1; sgn -= 2) {
      const t = sgn * (ux * (cx - x) + uy * (cy - y));
      const i0 = Math.ceil((t - reach - d0) / step);
      const i1 = Math.floor((t + reach - d0) / step);
      for (let j = 0; j < 2 * R + 2; j += 1) {
        const i = i0 + j;
        if (i < 0 || i >= n || i > i1) continue;
        const d = d0 + step * i;
        const vx = Math.floor(x + sgn * ux * d + 0.5) - ox;
        const vy = Math.floor(y + sgn * uy * d + 0.5) - oy;
        if (vx >= 0 && vx < side && vy >= 0 && vy < side) {
          acc[vy * side + vx] = (acc[vy * side + vx] as number) + 1;
        }
      }
    }
  }
  const blurred = pureCloseupOps.blur({ data: acc, width: side, height: side }, 3, 3);
  const best = argmax(blurred);
  return { x: ox + (best % side), y: oy + Math.floor(best / side) };
}

// ---------------------------------------------------------------- profile

export interface Ridge {
  /** NANG x nr, NaN outside the frame. */
  readonly data: Float64Array;
  readonly nr: number;
  readonly cos: Float64Array;
  readonly sin: Float64Array;
}

/** Polar resample, then a thin-line response along the radius (abs, both
 *  polarities). The low-pass is normalised over in-frame samples only. */
export function polarRidge(g: CloseupImage, cx: number, cy: number, ops: CloseupOps): Ridge {
  const { width: w, height: h } = g;
  const nr = Math.trunc(Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)));
  const { cos, sin } = polarAngles(NANG);
  const inside = new Float64Array(NANG * nr);
  for (let i = 0; i < NANG; i += 1) {
    const c = cos[i] as number;
    const s = sin[i] as number;
    for (let r = 0; r < nr; r += 1) {
      const x = cx + c * r;
      const y = cy + s * r;
      inside[i * nr + r] = x >= 0 && x <= w - 1 && y >= 0 && y <= h - 1 ? 1 : 0;
    }
  }
  const pol = ops.polar(g, cx, cy, NANG, nr);
  for (let i = 0; i < pol.length; i += 1) pol[i] = (pol[i] as number) * (inside[i] as number);
  const num = ops.blur({ data: pol, width: nr, height: NANG }, 6, 0.01);
  const den = ops.blur({ data: inside, width: nr, height: NANG }, 6, 0.01);
  const ridge = new Float64Array(NANG * nr);
  for (let i = 0; i < ridge.length; i += 1) {
    ridge[i] = inside[i]
      ? Math.abs((pol[i] as number) - (num[i] as number) / Math.max(den[i] as number, 1e-9))
      : NaN;
  }
  return { data: ridge, nr, cos, sin };
}

export function profile(ridge: Ridge): Float64Array {
  const { data, nr } = ridge;
  const prof = new Float64Array(nr);
  for (let r = 0; r < nr; r += 1) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < NANG; i += 1) {
      const v = data[i * nr + r] as number;
      if (!Number.isNaN(v)) {
        sum += v;
        n += 1;
      }
    }
    prof[r] = n / NANG < 0.25 || n === 0 ? NaN : sum / n;
  }
  return prof;
}

/**
 * Period (px) of the ring lines, its comb score and line count. Scored as
 * line strength at the multiples minus strength half-way between them, so
 * neither twice the period nor half of it can win.
 */
function bestPeriod(prof: Float64Array): { P: number; comb: number } {
  const valid: number[] = [];
  for (let r = 0; r < prof.length; r += 1) if (!Number.isNaN(prof[r] as number)) valid.push(r);
  if (valid.length < 40) return { P: 0, comb: 0 };
  const rlim = valid[valid.length - 1] as number;
  const vals = Float64Array.from(valid, (r) => prof[r] as number);
  const base = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - base))) + 1e-6;
  const z = Float64Array.from(prof, (v) => (Number.isNaN(v) ? 0 : (v - base) / mad));

  const peak = (r: number, P: number) => {
    const half = Math.max(2, 0.04 * P);
    const end = Math.min(z.length - 1, Math.trunc(r + half));
    let m = -Infinity;
    for (let i = Math.trunc(r - half); i <= end; i += 1) m = Math.max(m, z[i] as number);
    return m;
  };
  const comb = (P: number, skip = 0) => {
    let on = 0;
    let off = 0;
    let n = 0;
    for (let k = 1; (k + 0.5) * P + 3 < rlim; k += 1) {
      if (!Number.isNaN(prof[Math.trunc(k * P)] as number) && !(skip && k % skip === 0)) {
        on += peak(k * P, P);
        off += peak((k + 0.5) * P, P);
        n += 1;
      }
    }
    return { score: n ? (on - off) / n : -1e9, n };
  };

  let best = { P: 0, comb: -1e9 };
  for (let i = 0; 12 + 0.25 * i < rlim / 3; i += 1) {
    const P = 12 + 0.25 * i;
    const { score, n } = comb(P);
    // Two lines are enough: the 10 and 9 are all a tight close-up shows.
    if (n >= 2 && score > best.comb) best = { P, comb: score };
  }
  if (best.comb <= 0) return { P: 0, comb: 0 };
  // Every third line (8, 5, 2) is a clean comb too. A shorter period wins
  // when the lines only it predicts are really there.
  for (const div of [2, 3]) {
    const sub = best.P / div;
    if (sub < 12) continue;
    const extra = comb(sub, div);
    if (extra.n >= 2 && extra.score >= 0.5 * best.comb) return { P: sub, comb: comb(sub).score };
  }
  return best;
}

// ---------------------------------------------------------------- the fit

interface RingPoints {
  readonly x: number[];
  readonly y: number[];
  readonly k: number[];
  readonly seen: number;
  readonly found: number;
}

/** Per ray, the ridge maximum near each k * P, where it stands out. */
function ringPoints(ridge: Ridge, cx: number, cy: number, P: number): RingPoints | null {
  const { data, nr, cos, sin } = ridge;
  const out = { x: [] as number[], y: [] as number[], k: [] as number[], seen: 0, found: 0 };
  const kmax = Math.trunc(nr / P);
  let any = false;
  for (let k = 1; k <= kmax; k += 1) {
    const lo = Math.trunc(k * P - 0.25 * P);
    const hi = Math.trunc(k * P + 0.25 * P) + 1;
    if (hi >= nr) break;
    const bw = hi - lo;
    const okrow = new Uint8Array(NANG);
    let okCount = 0;
    for (let i = 0; i < NANG; i += 1) {
      let ok = 1;
      for (let j = lo; j < hi; j += 1) if (Number.isNaN(data[i * nr + j] as number)) ok = 0;
      okrow[i] = ok;
      okCount += ok;
    }
    if (okCount / NANG < 0.15) continue;
    any = true;
    const b = new Float64Array(bw);
    let found = 0;
    for (let i = 0; i < NANG; i += 1) {
      if (!okrow[i]) continue;
      for (let j = 0; j < bw; j += 1) b[j] = data[i * nr + lo + j] as number;
      let jBest = 0;
      for (let j = 1; j < bw; j += 1) if ((b[j] as number) > (b[jBest] as number)) jBest = j;
      // keep rays whose peak stands out from the band's own level
      if (!((b[jBest] as number) > 2 * median(b) + 1)) continue;
      const jj = Math.min(Math.max(jBest, 1), bw - 2);
      const y0 = b[jj - 1] as number;
      const y1 = b[jj] as number;
      const y2 = b[jj + 1] as number;
      const den = y0 - 2 * y1 + y2;
      const sub = Math.abs(den) > 1e-6 ? (0.5 * (y0 - y2)) / den : 0;
      const r = lo + jj + Math.min(Math.max(sub, -0.5), 0.5);
      out.x.push(cx + r * (cos[i] as number));
      out.y.push(cy + r * (sin[i] as number));
      out.k.push(k);
      found += 1;
    }
    out.seen += okCount;
    out.found += found;
  }
  return any ? out : null;
}

export interface Ellipse {
  readonly cx: number;
  readonly cy: number;
  /** (p - c)^T Q (p - c) = 1, [q00, q01, q11]. */
  readonly q: readonly [number, number, number];
}

/** Real roots of x^3 + a x^2 + b x + c, each polished by Newton. */
function cubicRoots(a: number, b: number, c: number): number[] {
  const q = (a * a - 3 * b) / 9;
  const r = (2 * a ** 3 - 9 * a * b + 27 * c) / 54;
  let roots: number[];
  if (r * r < q ** 3) {
    const t = Math.acos(Math.max(-1, Math.min(1, r / Math.sqrt(q ** 3))));
    const sq = -2 * Math.sqrt(q);
    roots = [
      sq * Math.cos(t / 3) - a / 3,
      sq * Math.cos((t + 2 * Math.PI) / 3) - a / 3,
      sq * Math.cos((t - 2 * Math.PI) / 3) - a / 3,
    ];
  } else {
    const A = -Math.sign(r || 1) * (Math.abs(r) + Math.sqrt(r * r - q ** 3)) ** (1 / 3);
    const B = A !== 0 ? q / A : 0;
    roots = [A + B - a / 3];
  }
  return roots.map((x0) => {
    let x = x0;
    for (let i = 0; i < 3; i += 1) {
      const f = ((x + a) * x + b) * x + c;
      const d = (3 * x + 2 * a) * x + b;
      if (d === 0) break;
      x -= f / d;
    }
    return x;
  });
}

/** Unit eigenvectors of the real eigenvalues of a row-major 3x3. */
function realEigenvectors(m: readonly number[]): number[][] {
  const [a, b, c, d, e, f, g, h, i] = m as [
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
  const tr = a + e + i;
  const c1 = a * e - b * d + a * i - c * g + e * i - f * h;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const out: number[][] = [];
  for (const lam of cubicRoots(-tr, c1, -det)) {
    const n = [a - lam, b, c, d, e - lam, f, g, h, i - lam];
    let best = 0;
    let vec: number[] | null = null;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const u = n.slice(3 * p, 3 * p + 3) as [number, number, number];
      const v = n.slice(3 * q, 3 * q + 3) as [number, number, number];
      const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const norm = Math.sqrt(x[0]! * x[0]! + x[1]! * x[1]! + x[2]! * x[2]!);
      if (norm > best) {
        best = norm;
        vec = x.map((t) => t / norm);
      }
    }
    if (vec) out.push(vec);
  }
  return out;
}

/** Direct least-squares ellipse (Fitzgibbon, in Halir and Flusser's stable
 *  form) on normalised points; null when the best conic is not an ellipse. */
export function fitEllipse(xs: Float64Array, ys: Float64Array): Ellipse | null {
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i] as number;
    my += ys[i] as number;
  }
  mx /= n;
  my /= n;
  let ss = 0;
  for (let i = 0; i < n; i += 1)
    ss += ((xs[i] as number) - mx) ** 2 + ((ys[i] as number) - my) ** 2;
  const s = Math.sqrt(ss / n / 2);
  if (!(s > 0)) return null;
  const S1 = new Array<number>(9).fill(0);
  const S2 = new Array<number>(9).fill(0);
  const S3 = new Array<number>(9).fill(0);
  for (let p = 0; p < n; p += 1) {
    const x = ((xs[p] as number) - mx) / s;
    const y = ((ys[p] as number) - my) / s;
    const d1 = [x * x, x * y, y * y];
    const d2 = [x, y, 1];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        S1[3 * r + c] = S1[3 * r + c]! + d1[r]! * d1[c]!;
        S2[3 * r + c] = S2[3 * r + c]! + d1[r]! * d2[c]!;
        S3[3 * r + c] = S3[3 * r + c]! + d2[r]! * d2[c]!;
      }
    }
  }
  // T = -S3^-1 S2^T, column by column
  const T = new Array<number>(9).fill(0);
  for (let c = 0; c < 3; c += 1) {
    const col = solve(S3, [-S2[3 * c]!, -S2[3 * c + 1]!, -S2[3 * c + 2]!], 3);
    if (!col) return null;
    for (let r = 0; r < 3; r += 1) T[3 * r + c] = col[r]!;
  }
  const M = mul3(S2, T).map((v, i) => v + S1[i]!);
  const Mc = [
    M[6]! / 2,
    M[7]! / 2,
    M[8]! / 2,
    -M[3]!,
    -M[4]!,
    -M[5]!,
    M[0]! / 2,
    M[1]! / 2,
    M[2]! / 2,
  ];
  let best = 0;
  let a1: number[] | null = null;
  for (const v of realEigenvectors(Mc)) {
    const cond = 4 * v[0]! * v[2]! - v[1]! ** 2;
    if (cond > best) {
      best = cond;
      a1 = v;
    }
  }
  if (!a1) return null;
  const [A, B, C] = a1 as [number, number, number];
  const D = T[0]! * A + T[1]! * B + T[2]! * C;
  const E = T[3]! * A + T[4]! * B + T[5]! * C;
  const F = T[6]! * A + T[7]! * B + T[8]! * C;
  const det = 4 * A * C - B * B;
  const xc = (B * E - 2 * C * D) / det;
  const yc = (B * D - 2 * A * E) / det;
  const Fc = A * xc * xc + B * xc * yc + C * yc * yc + D * xc + E * yc + F;
  if (Fc === 0) return null;
  const k = -1 / Fc / (s * s);
  const q: [number, number, number] = [A * k, (B / 2) * k, C * k];
  if (!(q[0] > 0 && q[0] * q[2] - q[1] * q[1] > 0)) return null;
  return { cx: mx + s * xc, cy: my + s * yc, q };
}

/** Affine taking the ellipse to the unit circle without rotating the picture
 *  (the symmetric square root of Q), and the ellipse's two full axes. */
export function unitMap(e: Ellipse): { m: M3; d1: number; d2: number } {
  const [a, b, c] = e.q;
  const sd = Math.sqrt(a * c - b * b);
  const t = Math.sqrt(a + c + 2 * sd);
  const A = [(a + sd) / t, b / t, b / t, (c + sd) / t];
  const mean = (a + c) / 2;
  const dev = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  return {
    m: [
      A[0]!,
      A[1]!,
      -(A[0]! * e.cx + A[1]! * e.cy),
      A[2]!,
      A[3]!,
      -(A[2]! * e.cx + A[3]! * e.cy),
      0,
      0,
      1,
    ],
    d1: 2 / Math.sqrt(mean + dev),
    d2: 2 / Math.sqrt(mean - dev),
  };
}

function softL1(r: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < r.length; i += 1) {
    sum += 2 * F_SCALE_MM ** 2 * (Math.sqrt(1 + ((r[i] as number) / F_SCALE_MM) ** 2) - 1);
  }
  return sum;
}

/** Radial residuals of every ring point and the rotation prior, and the
 *  Jacobian, (N + 1) x 8 row-major. */
function residuals(
  x: readonly number[],
  px: Float64Array,
  py: Float64Array,
  target: Float64Array,
  skew0: number,
): { r: Float64Array; J: Float64Array } {
  const n = px.length;
  const r = new Float64Array(n + 1);
  const J = new Float64Array((n + 1) * 8);
  const [h0, h1, h2, h3, h4, h5, h6, h7] = x as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  for (let i = 0; i < n; i += 1) {
    const X = px[i] as number;
    const Y = py[i] as number;
    const w = h6 * X + h7 * Y + 1;
    const u = (h0 * X + h1 * Y + h2) / w;
    const v = (h3 * X + h4 * Y + h5) / w;
    const rho = Math.max(Math.hypot(u, v), 1e-12);
    r[i] = rho - (target[i] as number);
    const du = u / rho / w;
    const dv = v / rho / w;
    const o = i * 8;
    J[o] = du * X;
    J[o + 1] = du * Y;
    J[o + 2] = du;
    J[o + 3] = dv * X;
    J[o + 4] = dv * Y;
    J[o + 5] = dv;
    J[o + 6] = -(du * u + dv * v) * X;
    J[o + 7] = -(du * u + dv * v) * Y;
  }
  r[n] = PRIOR_WEIGHT * (h1 - h3 - skew0);
  J[n * 8 + 1] = PRIOR_WEIGHT;
  J[n * 8 + 3] = -PRIOR_WEIGHT;
  return { r, J };
}

/**
 * Robust least squares on the ring points: each should land k steps (25 mm on
 * precision) from the origin. Levenberg-Marquardt on iteratively reweighted
 * residuals with a soft-L1 loss, as the reference writes out; a weak prior
 * holds the rotation, which no radius can see.
 */
export function refineHomography(
  H0: readonly number[],
  px: Float64Array,
  py: Float64Array,
  ks: Float64Array,
  stepMm: number = RING_STEP_MM,
): { H: M3; residual: number } {
  const h22 = H0[8] as number;
  let x = H0.slice(0, 8).map((v) => v / h22);
  const target = ks.map((k) => k * stepMm);
  const skew0 = (x[1] as number) - (x[3] as number);
  let { r, J } = residuals(x, px, py, target, skew0);
  let cost = softL1(r);
  let lam = 1e-3;
  const rows = r.length;
  for (let iter = 0; iter < LM_ITERS; iter += 1) {
    const A = new Array<number>(64).fill(0);
    const g = new Array<number>(8).fill(0);
    for (let i = 0; i < rows; i += 1) {
      const ri = r[i] as number;
      const wt = 1 / Math.sqrt(1 + (ri / F_SCALE_MM) ** 2);
      const o = i * 8;
      for (let a = 0; a < 8; a += 1) {
        const ja = (J[o + a] as number) * wt;
        if (ja === 0) continue;
        g[a] = g[a]! + ja * ri;
        for (let b = 0; b < 8; b += 1) A[8 * a + b] = A[8 * a + b]! + ja * (J[o + b] as number);
      }
    }
    let improved = false;
    let done = false;
    while (lam <= 1e10) {
      const damped = A.map((v, i) => (i % 9 === 0 ? v + lam * v : v));
      const step = solve(
        damped,
        g.map((v) => -v),
        8,
      );
      if (!step) {
        lam *= 10;
        continue;
      }
      const xn = x.map((v, i) => v + step[i]!);
      const next = residuals(xn, px, py, target, skew0);
      const cn = softL1(next.r);
      if (cn < cost) {
        done = cost - cn <= 1e-12 * cost;
        x = xn;
        r = next.r;
        J = next.J;
        cost = cn;
        lam = Math.max(lam / 10, 1e-12);
        improved = true;
        break;
      }
      lam *= 10;
    }
    if (!improved || done) break;
  }
  return { H: [...x, 1], residual: median(r.subarray(0, rows - 1).map(Math.abs)) };
}

interface Fit {
  readonly workToMm: M3;
  readonly d1: number;
  readonly d2: number;
  readonly used: number;
  readonly support: number;
  readonly residual: number;
}

function fitRings(
  g: CloseupImage,
  cx0: number,
  cy0: number,
  P0: number,
  first: Ridge,
  ops: CloseupOps,
): Fit | null {
  let cx = cx0;
  let cy = cy0;
  let P = P0;
  let ridge = first;
  let last: {
    m: M3;
    d1: number;
    d2: number;
    used: number;
    support: number;
    residual: number;
    px: Float64Array;
    py: Float64Array;
    ks: Float64Array;
  } | null = null;
  for (let iter = 0; iter < 3; iter += 1) {
    // rays radial from the refined centre
    if (iter > 0) ridge = polarRidge(g, cx, cy, ops);
    const got = ringPoints(ridge, cx, cy, P);
    if (!got) return null;
    const n = got.x.length;
    if (n < 50) return null;
    const px = Float64Array.from(got.x);
    const py = Float64Array.from(got.y);
    const ks = Float64Array.from(got.k);
    const nx = new Float64Array(n);
    const ny = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      nx[i] = cx + ((px[i] as number) - cx) / (ks[i] as number);
      ny[i] = cy + ((py[i] as number) - cy) / (ks[i] as number);
    }
    const ellipse = fitEllipse(nx, ny);
    if (!ellipse) return null;
    const { m, d1, d2 } = unitMap(ellipse);
    // radial residual of each original point against its own ring
    const dev = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const qx = m[0]! * px[i]! + m[1]! * py[i]! + m[2]!;
      const qy = m[3]! * px[i]! + m[4]! * py[i]! + m[5]!;
      const k = ks[i] as number;
      dev[i] = Math.abs(Math.hypot(qx, qy) / k - 1) * k * RING_STEP_MM;
    }
    last = {
      m,
      d1,
      d2,
      used: new Set(got.k).size,
      support: got.found / Math.max(1, got.seen),
      residual: median(dev),
      px,
      py,
      ks,
    };
    cx = ellipse.cx;
    cy = ellipse.cy;
    P = (d1 + d2) / 4;
  }
  if (!last) return null;
  const affine = mul3([RING_STEP_MM, 0, 0, 0, RING_STEP_MM, 0, 0, 0, 1], last.m);
  const { H, residual } = refineHomography(affine, last.px, last.py, last.ks);
  return {
    workToMm: H,
    d1: last.d1,
    d2: last.d2,
    used: last.used,
    support: last.support,
    residual,
  };
}

// ---------------------------------------------------------------- yardstick

const CIRCLE_ANGLES = polarAngles(360);

/** Mean line response along the mm circle of radius R, in frame only. */
function circleMean(lines: CloseupImage, inv: readonly number[], R: number): number | null {
  const { width: w, height: h } = lines;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 360; i += 1) {
    const X = R * (CIRCLE_ANGLES.cos[i] as number);
    const Y = R * (CIRCLE_ANGLES.sin[i] as number);
    const d = inv[6]! * X + inv[7]! * Y + inv[8]!;
    const x = (inv[0]! * X + inv[1]! * Y + inv[2]!) / d;
    const y = (inv[3]! * X + inv[4]! * Y + inv[5]!) / d;
    if (x >= 0 && x < w - 1 && y >= 0 && y < h - 1) {
      sum += bilinearAt(lines, x, y);
      n += 1;
    }
  }
  return n / 360 < 0.3 ? null : sum / n;
}

/** `circleMean`, but the median: a ring line runs the whole way round, while
 *  a digit, a hole or a patch covers only part of a circle. */
function circleMedian(lines: CloseupImage, inv: readonly number[], R: number): number | null {
  const { width: w, height: h } = lines;
  const v = new Float64Array(360);
  let n = 0;
  for (let i = 0; i < 360; i += 1) {
    const X = R * (CIRCLE_ANGLES.cos[i] as number);
    const Y = R * (CIRCLE_ANGLES.sin[i] as number);
    const d = inv[6]! * X + inv[7]! * Y + inv[8]!;
    const x = (inv[0]! * X + inv[1]! * Y + inv[2]!) / d;
    const y = (inv[3]! * X + inv[4]! * Y + inv[5]!) / d;
    if (x >= 0 && x < w - 1 && y >= 0 && y < h - 1) {
      v[n] = bilinearAt(lines, x, y);
      n += 1;
    }
  }
  return n / 360 < 0.3 ? null : median(v.subarray(0, n));
}

/**
 * Per ring at `radii` mm that is mostly in frame, the radial offset (mm)
 * within ±`win` at which `along` (the line response along the circle) peaks;
 * the worst of them. Null when no ring is in frame.
 */
function worstLineOffset(
  lines: CloseupImage,
  workToMm: readonly number[],
  radii: readonly number[],
  win: number,
  along: typeof circleMean,
): number | null {
  const inv = invertHomography(asHomography(workToMm));
  if (!inv) return null;
  const step = 0.1;
  const nOff = Math.round((2 * win) / step);
  let worst = 0;
  let n = 0;
  for (const R of radii) {
    if (along(lines, inv, R) === null) continue;
    let best = -Infinity;
    let bo = 0;
    for (let i = 0; i <= nOff; i += 1) {
      const o = -win + i * step;
      const v = along(lines, inv, R + o) ?? -1;
      if (v > best) {
        best = v;
        bo = o;
      }
    }
    worst = Math.max(worst, Math.abs(bo));
    n += 1;
  }
  return n ? worst : null;
}

function workRingOffset(lines: CloseupImage, workToMm: readonly number[]): number | null {
  return worstLineOffset(lines, workToMm, [25, 50, 75], 3, circleMean);
}

/**
 * How far a lock's rings sit from the printed lines: per ring at 25, 50 and
 * 75 mm that is mostly in frame, the radial offset (mm) at which the line
 * response along the lock's circle peaks; the worst of them. Null when no
 * ring is in frame. The close-up gate and the choice between the disc lock
 * and the close-up lock both hold a lock to this.
 */
export function ringOffsetMm(work: CloseupWork, toMm: Homography): number | null {
  const fromWork = invertHomography(work.toWork);
  if (!fromWork) return null;
  return workRingOffset(work.lines, mul3(toMm, fromWork));
}

/** Median line response round precision's X ring (12.5 mm), round its 10
 *  (25 mm), and in the black between them (6.25 and 18.75 mm, averaged). */
export interface XRingReading {
  readonly x: number;
  readonly ten: number;
  readonly gap: number;
}

/**
 * What the line response reads where a lock puts precision's X ring. A
 * milsnabb face prints nothing inside its X, so a crop of its X and 10 locked
 * as precision's 10 and 9 reads no line there. Null when the X, the 10 or both
 * gaps are mostly out of frame.
 */
export function xRingReading(work: CloseupWork, toMm: Homography): XRingReading | null {
  const fromWork = invertHomography(work.toWork);
  const inv = fromWork && invertHomography(asHomography(mul3(toMm, fromWork)));
  if (!inv) return null;
  const at = (R: number) => circleMedian(work.lines, inv, R);
  const x = at(12.5);
  const ten = at(25);
  const gaps = [at(6.25), at(18.75)].filter((v): v is number => v !== null);
  if (x === null || ten === null || gaps.length === 0) return null;
  return { x, ten, gap: gaps.reduce((s, v) => s + v, 0) / gaps.length };
}

/** The 9 and 8 lines. Within 12 mm of either there is no other printed line;
 *  the 10's line is not used, because the X ring is 12.5 mm inside it. */
const DRIFT_RADII_MM = [50, 75] as const;
const DRIFT_WINDOW_MM = 12;

/**
 * `ringOffsetMm` for a lock that may be far off: the 9 and 8 lines only,
 * searched almost half a step either side, read as the median along the
 * circle so that holes and patches do not pull the peak. A lock at the wrong
 * scale drifts off the lines with radius; the disc lock's gate reads this.
 */
export function ringDriftMm(work: CloseupWork, toMm: Homography): number | null {
  const fromWork = invertHomography(work.toWork);
  if (!fromWork) return null;
  return worstLineOffset(
    work.lines,
    mul3(toMm, fromWork),
    DRIFT_RADII_MM,
    DRIFT_WINDOW_MM,
    circleMedian,
  );
}

function isHalfPeriod(lines: CloseupImage, workToMm: readonly number[]): boolean {
  const inv = invertHomography(asHomography(workToMm));
  if (!inv) return false;
  const odd: number[] = [];
  const even: number[] = [];
  for (let k = 1; k < 12; k += 1) {
    const on = circleMean(lines, inv, k * RING_STEP_MM);
    const mid = circleMean(lines, inv, (k + 0.5) * RING_STEP_MM);
    if (on === null || mid === null) continue;
    (k % 2 ? odd : even).push(on / Math.max(mid, 1e-6));
  }
  // k=1 is the X ring when the period is halved, so it proves nothing.
  odd.shift();
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return odd.length > 0 && even.length > 0 && mean(odd) < 1.3 && mean(even) > 1.8;
}

/** The finer steps tried, finest first. */
const FINER_STEPS = [4, 3, 2] as const;
/** Each class of a finer step's extra lines must be this strong against the
 *  weakest of the fit's own lines, and against the finer step's gaps. */
const FINER_VS_LINES = 0.5;
const FINER_VS_GAPS = 1.8;
/** The 1 ring, in steps: nothing outside it is a ring line. */
const OUTER_RING_STEPS = 10;

/**
 * Whether every line a step m times finer predicts is printed. Line j of the
 * finer step sits at j * 25 / m mm of this fit; the ones that are not the
 * fit's own fall into m - 1 classes (j mod m), each tested alone, so a
 * 2x-coarse fit's real half-step lines cannot carry a 4x candidate's missing
 * quarter-step ones. Radii under one step are skipped: the X ring sits at
 * half a step on any scale.
 */
function finerLinesPresent(lines: CloseupImage, workToMm: readonly number[], m: number): boolean {
  const inv = invertHomography(asHomography(workToMm));
  if (!inv) return false;
  const strengths = (radii: number[]) =>
    radii.map((R) => circleMedian(lines, inv, R)).filter((v): v is number => v !== null);
  const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / a.length;
  const own: number[] = [];
  for (let k = 1; k <= Math.floor(OUTER_RING_STEPS / m); k += 1) own.push(k * RING_STEP_MM);
  const gaps: number[] = [];
  for (let j = m; j < OUTER_RING_STEPS; j += 1) gaps.push(((j + 0.5) * RING_STEP_MM) / m);
  const ownS = strengths(own);
  const gapS = strengths(gaps);
  if (ownS.length < 2 || gapS.length < 2) return false;
  const floor = FINER_VS_LINES * Math.min(...ownS);
  const gap = mean(gapS);
  for (let c = 1; c < m; c += 1) {
    const radii: number[] = [];
    for (let j = m; j <= OUTER_RING_STEPS; j += 1)
      if (j % m === c) radii.push((j * RING_STEP_MM) / m);
    const extra = strengths(radii);
    if (extra.length === 0) return false;
    const e = mean(extra);
    if (e < floor || e < FINER_VS_GAPS * gap) return false;
  }
  return true;
}

/**
 * Every whole multiple of 25 mm is a printed line, so a fit at 2, 3 or 4
 * times the true step still has a line under each ring and passes the
 * yardstick. Take the finest step whose extra lines are all printed: its mm
 * are this fit's times m, and a refit there adds the finer lines' points;
 * keep whichever sits closer to the lines. Lock-step with `_finest_step`.
 */
function finestStep(
  g: CloseupImage,
  lines: CloseupImage,
  fit: Fit,
  offset: number | null,
  P: number,
  ops: CloseupOps,
): { fit: Fit; offset: number | null; P: number } {
  const toWork = invertHomography(asHomography(fit.workToMm));
  if (!toWork) return { fit, offset, P };
  const cx = toWork[2] / toWork[8];
  const cy = toWork[5] / toWork[8];
  for (const m of FINER_STEPS) {
    if (!finerLinesPresent(lines, fit.workToMm, m)) continue;
    let cand: Fit = {
      workToMm: mul3([m, 0, 0, 0, m, 0, 0, 0, 1], fit.workToMm),
      d1: fit.d1 / m,
      d2: fit.d2 / m,
      used: fit.used,
      support: fit.support,
      residual: fit.residual * m,
    };
    let off = workRingOffset(lines, cand.workToMm);
    const refit = fitRings(g, cx, cy, P / m, polarRidge(g, cx, cy, ops), ops);
    if (refit) {
      const rOff = workRingOffset(lines, refit.workToMm);
      if (rOff !== null && (off === null || rOff < off)) {
        cand = refit;
        off = rOff;
      }
    }
    return { fit: cand, offset: off, P: P / m };
  }
  return { fit, offset, P };
}

/**
 * How much brighter the face is outside its black than inside, through the
 * lock: the median grey along circles in each zone, in the work image's own
 * p5-p95 range. Null when either zone is out of frame. Lock-step with
 * `_face_contrast`.
 */
function faceContrast(g: CloseupImage, workToMm: readonly number[]): number | null {
  const inv = invertHomography(asHomography(workToMm));
  if (!inv) return null;
  const zone = (radii: readonly number[]) => {
    const v = radii.map((R) => circleMedian(g, inv, R)).filter((x): x is number => x !== null);
    return v.length ? median(Float64Array.from(v)) : null;
  };
  const black = zone(FACE_BLACK_MM);
  const paper = zone(FACE_PAPER_MM);
  if (black === null || paper === null) return null;
  const span = Math.max(quantile(g.data, 0.95) - quantile(g.data, 0.05), 1);
  return (paper - black) / span;
}

// ---------------------------------------------------------------- the lock

/** The lock on an already prepared work image. */
export function lockCloseupWork(
  work: CloseupWork,
  ops: CloseupOps = pureCloseupOps,
): CloseupLock | null {
  const { g, lines } = work;
  const vote = voteCenter(g, ops);
  const ridge = polarRidge(g, vote.x, vote.y, ops);
  const best = bestPeriod(profile(ridge));
  const comb = best.comb;
  let P = best.P;
  if (P <= 0) return null;
  let fit = fitRings(g, vote.x, vote.y, P, ridge, ops);
  if (!fit) return null;
  // Holes shot through the middle can leave the X ring as the strongest
  // comb at half a step; then every odd ring sits between printed lines.
  let offset = workRingOffset(lines, fit.workToMm);
  if (isHalfPeriod(lines, fit.workToMm) || offset === null || offset > CLOSEUP_GATE.ringOffsetMm) {
    const refit = fitRings(g, vote.x, vote.y, 2 * P, ridge, ops);
    if (refit) {
      const reOffset = workRingOffset(lines, refit.workToMm);
      if (reOffset !== null && (offset === null || reOffset < offset)) {
        fit = refit;
        offset = reOffset;
        P = 2 * P;
      }
    }
  }
  ({ fit, offset, P } = finestStep(g, lines, fit, offset, P, ops));
  const toMm = mul3(fit.workToMm, work.toWork);
  const toImage = invertHomography(asHomography(toMm));
  if (!toImage) return null;
  const norm = toMm[8] as number;
  return {
    toMm: asHomography(toMm.map((v) => v / norm)),
    center: { x: toImage[2] / toImage[8], y: toImage[5] / toImage[8] },
    residualMm: fit.residual,
    comb,
    ringOffsetMm: offset,
    rings: fit.used,
    support: fit.support,
    axisRatio: Math.max(fit.d1, fit.d2) / Math.max(1e-6, Math.min(fit.d1, fit.d2)),
    faceContrast: faceContrast(g, fit.workToMm),
    voteCenter: vote,
    period: P,
  };
}

/** Image px -> mm of the precision face from a close-up of its inner rings,
 *  or null when the ring lines give too little to go on. */
export function lockCloseup(
  image: GrayImage,
  ops: CloseupOps = pureCloseupOps,
  longSide = WORK_LONG_SIDE,
): CloseupLock | null {
  return lockCloseupWork(closeupWorkImage(image, ops, longSide), ops);
}

export function passesCloseupGate(lock: CloseupLock | null): lock is CloseupLock {
  return (
    lock !== null &&
    lock.residualMm <= CLOSEUP_GATE.residualMm &&
    lock.comb >= CLOSEUP_GATE.comb &&
    lock.ringOffsetMm !== null &&
    lock.ringOffsetMm <= CLOSEUP_GATE.ringOffsetMm &&
    (lock.faceContrast === null || lock.faceContrast >= CLOSEUP_GATE.faceContrast)
  );
}

/** mm per image px of `toMm` near `at`, from its Jacobian. */
function mmPerPx(toMm: Homography, at: { readonly x: number; readonly y: number }): number {
  const p = applyHomography(toMm, at);
  const px = applyHomography(toMm, { x: at.x + 1, y: at.y });
  const py = applyHomography(toMm, { x: at.x, y: at.y + 1 });
  return Math.sqrt(Math.abs((px.x - p.x) * (py.y - p.y) - (px.y - p.y) * (py.x - p.x)));
}

/** A close-up lock at 2, 3 or 4 times the true ring step reads this share of
 *  the disc lock's mm per px; the disc lock is never off by such a factor. */
const SCALE_VETO = [1 / 2, 1 / 3, 1 / 4] as const;
const SCALE_VETO_TOL = 0.06;

/**
 * Which lock the marking screen uses (spec, "Consequences for the app"): the
 * one that passes its gate; when both do, the one whose rings sit closer to
 * the printed lines, the disc lock on a tie; null when neither passes. A
 * close-up whose scale is a whole-number fraction of a passing disc lock's
 * locked onto every second, third or fourth line, and is refused.
 */
export function chooseLock(options: {
  readonly discPasses: boolean;
  /** The disc lock's `ringOffsetMm` on the same work image. */
  readonly discOffsetMm: number | null;
  readonly closeup: CloseupLock | null;
  /** The disc lock's image px -> mm, for the scale check. */
  readonly discToMm?: Homography;
}): 'disc' | 'closeup' | null {
  const { closeup, discToMm } = options;
  const closeupPasses = passesCloseupGate(closeup);
  if (!options.discPasses) return closeupPasses ? 'closeup' : null;
  if (!closeupPasses) return 'disc';
  if (discToMm) {
    const ratio = mmPerPx(closeup.toMm, closeup.center) / mmPerPx(discToMm, closeup.center);
    if (SCALE_VETO.some((f) => Math.abs(ratio / f - 1) <= SCALE_VETO_TOL)) return 'disc';
  }
  const disc = options.discOffsetMm ?? Infinity;
  return (closeup.ringOffsetMm ?? Infinity) < disc ? 'closeup' : 'disc';
}
