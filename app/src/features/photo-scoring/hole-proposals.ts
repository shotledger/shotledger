// Hole proposals: candidate bullet holes on the rectified canvas, each with a
// probability — the assisted "suggest holes" stage.
//
// A line-for-line port of the Python spike's hole proposals (numbers:
// docs/specs/cv-hole-proposals-2026-09.md). `hole-proposals.fixtures.json` is
// a snapshot of this module on synthetic canvases (`pnpm cv:fixtures`);
// regenerate it after a change on purpose.
//
// Pure JS on the gray `RectifiedCanvas` that `runGeometry` already hands out,
// like tap-snap, so it runs in a unit test and on the web. On a device the
// whole-canvas operations go to OpenCV through `MapOps`
// (hole-proposals-native.ts); the global maps run at half resolution
// (2 px/mm), the per-candidate features read the full canvas.
//
// The stage:
//  1. average 2x2 blocks -> a half-resolution canvas for the global maps
//  2. valid mask: the warp's white padding, grown so its edge cannot pose as
//     a hole edge
//  3. Laplacian of Gaussian at three scales around the hole diameter, each
//     normalised by the scoring area's own median absolute deviation
//  4. candidates = local maxima of |LoG| at the hole scale above a threshold
//  5. printed-glyph map: the extent of the low-threshold structure a pixel
//     belongs to, ring lines removed (a digit is long, a hole is not)
//  6. per candidate, at full resolution: the six texture features of
//     `holeFeatures`, a radial profile, the shape of the blob under it, how
//     straight its edges are, where it sits on the face, and the LoG values
//  7. a logistic regression over those 30 features -> probability
//  8. accept above the threshold, merge peaks closer than one hole diameter,
//     and refine each centre to the centroid of its deviation from the paper
import { HOLE_CROP_PX, holeFeatures, reflectIndex } from '@shotledger/shared';

import { kthSmallest } from './order-statistics';
import type { RectifiedCanvas } from './tap-snap';

// ---------------------------------------------------------------- constants

/** Down-sampling factor for the global maps. */
export const HALF = 2;
/** |LoG| at the hole scale, in MADs of the scoring area, below which a pixel
 *  cannot start a candidate. 8 lost 7 of 152 hand-marked holes at the stage. */
export const LOG_THRESHOLD_MAD = 8;
/** Non-maximum suppression: a candidate is the maximum of the square window
 *  of this half-size, in hole diameters. */
export const NMS_RADIUS_D = 0.8;
const PAD_WHITE = 254;
const PAD_MIN_AREA = 50;
const PAD_GROW = 8;
const GLYPH_DELTA = 35;
const LINE_HALF_WIDTH_MM = 0.98;
const BLACK_ZONE_FRACTION = 0.985;
/** Accepted candidates closer than this, in hole diameters, are one hole. */
export const MERGE_RADIUS_D = 1.0;
const REFINE_RADIUS_D = 0.6;
const REFINE_ITERS = 2;
const RING_DIST_CLIP_MM = 6;
const GLYPH_CLIP = 8;
const BLOB_AREA_CLIP = 6;
const BLOB_ELONG_CLIP = 6;
const STRAIGHT_BINS = 18;
const GRADIENT_EPSILON = 1e-9;
/** The LoG maps are normalised by the MAD of every MAD_STRIDE-th pixel. */
const MAD_STRIDE = 4;
/**
 * Floors on those MADs, just under the smallest of the 31 corpus photos. A
 * grain-free image (a scan, rendered art) otherwise has a fine-scale MAD
 * ~150x lower, and every printed line then scores as a certain hole.
 */
const MAD_FLOOR = { s1: 0.05, s2: 0.02, s05: 0.08 } as const;

export const HOLE_PROPOSAL_FEATURE_NAMES = [
  'orient_entropy',
  'hf_energy',
  'laplacian_var',
  'grad_mean',
  'center_deviation',
  'std',
  'in_black',
  'ring_dist',
  'r_mm',
  'log1',
  'log2',
  'log05',
  'abslog1',
  'scale_ratio',
  'rb0',
  'rb1',
  'rb2',
  'rb3',
  'rb4',
  'nrb0',
  'nrb1',
  'nrb2',
  'nrb3',
  'nrb4',
  'b_area',
  'b_fill',
  'b_elong',
  'b_touch',
  'straight',
  'glyph',
] as const;

export type HoleProposalFeatureName = (typeof HOLE_PROPOSAL_FEATURE_NAMES)[number];
export type HoleProposalFeatures = Record<HoleProposalFeatureName, number>;

/**
 * Fitted on 5169 candidates from the 31 hand-marked photos (152 holes);
 * `tools/cv/fit/fit-hole-proposals.mts` refits them. Raw feature scale.
 */
export const HOLE_PROPOSAL_WEIGHTS: HoleProposalFeatures = {
  orient_entropy: 4.271673,
  hf_energy: 0.182486,
  laplacian_var: 0.006418,
  grad_mean: 31.640295,
  center_deviation: 49.970597,
  std: -100.117709,
  in_black: 3.142235,
  ring_dist: -0.173672,
  r_mm: -0.033935,
  log1: -0.252405,
  log2: -0.482507,
  log05: 0.03612,
  abslog1: 0.368739,
  scale_ratio: -0.378987,
  rb0: -0.046484,
  rb1: 0.105095,
  rb2: 0.128372,
  rb3: -0.133883,
  rb4: 0.163354,
  nrb0: 6.324037,
  nrb1: 1.064415,
  nrb2: 1.034327,
  nrb3: 8.184115,
  nrb4: -15.963946,
  b_area: -0.267907,
  b_fill: 2.84421,
  b_elong: -0.582949,
  b_touch: 1.178402,
  straight: -3.97232,
  glyph: -0.089777,
};
export const HOLE_PROPOSAL_BIAS = -26.046342;
/**
 * Where to cut. 0.7 measured 74% recall at 92% precision and 0.32 false
 * positives per photo over the pooled corpora, 5-fold by photo.
 */
export const HOLE_PROPOSAL_THRESHOLD = 0.7;

/**
 * The floor when a series is filled up to its shot count with the next-best
 * candidates (`fillTo`). Measured 5-fold by photo on the 31 labelled photos:
 * 74.3% → 81.6% recall, 94.2% → 89.2% precision, no hole lost.
 */
export const HOLE_PROPOSAL_FILL_THRESHOLD = 0.1;

// ---------------------------------------------------------------- types

/** What the stage knows about the face, all in mm except the scale. */
export interface ProposalFace {
  readonly caliberMm: number;
  /** Radius of the printed black zone (`referenceDiameterMm / 2`). */
  readonly blackRadiusMm: number;
  /** Radius of the outermost scoring ring — nothing beyond it is searched. */
  readonly maxRadiusMm: number;
  readonly ringRadiiMm: readonly number[];
}

export interface HoleCandidate {
  /** Canvas px of the LoG peak (integers). */
  readonly x: number;
  readonly y: number;
  /** |LoG| at the hole scale, in MADs. */
  readonly resp: number;
  readonly features: HoleProposalFeatures;
  readonly probability: number;
}

export interface HoleProposal {
  /** Target-mm, refined centre. */
  readonly xMm: number;
  readonly yMm: number;
  readonly probability: number;
  /** Canvas px of the peak this proposal started from. */
  readonly peakX: number;
  readonly peakY: number;
  /** Added to fill the series (`fillTo`), below the confident threshold. */
  readonly filled: boolean;
}

/** Where one detector run spent its time, for the scan-timing log. */
export interface DetectorTimings {
  mapsMs: number;
  peaksMs: number;
  featuresMs: number;
  peaks: number;
  canvasPx: number;
}

/** A float image, row-major. */
interface Img {
  readonly data: Float64Array;
  readonly width: number;
  readonly height: number;
}

interface Maps {
  readonly half: Img;
  readonly inzone: Uint8Array;
  readonly black: Uint8Array;
  readonly logs: {
    readonly s1: Float64Array;
    readonly s2: Float64Array;
    readonly s05: Float64Array;
  };
  readonly glyph: Float64Array;
  readonly dHalf: number;
}

// ---------------------------------------------------------------- helpers

/** 1-D Gaussian, radius ceil(3 sigma), normalised to sum 1. */
export function gaussianKernel(sigma: number): Float64Array {
  const r = Math.ceil(3 * sigma);
  const k = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i += 1) k[i] = (k[i] as number) / sum;
  return k;
}

/** Separable convolution, BORDER_REFLECT_101, rows first then columns —
 *  `cv2.sepFilter2D`'s order. Interior pixels skip the reflection lookup:
 *  on a 1050 px map with a 49-tap kernel that lookup is the whole cost. */
function separable(img: Img, rowKernel: Float64Array, colKernel: Float64Array): Float64Array {
  const { width: w, height: h } = img;
  const pass = (input: Float64Array, kernel: Float64Array, alongX: boolean) => {
    const radius = (kernel.length - 1) / 2;
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
  return pass(pass(img.data, rowKernel, true), colKernel, false);
}

function blur(img: Img, sigma: number): Float64Array {
  const k = gaussianKernel(sigma);
  return separable(img, k, k);
}

/** 4-neighbour Laplacian, BORDER_REFLECT_101. */
function laplacian4(img: Img): Float64Array {
  const { data, width: w, height: h } = img;
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const up = reflectIndex(y - 1, h) * w;
    const down = reflectIndex(y + 1, h) * w;
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const left = reflectIndex(x - 1, w);
      const right = reflectIndex(x + 1, w);
      out[row + x] =
        (data[up + x] as number) +
        (data[down + x] as number) +
        (data[row + left] as number) +
        (data[row + right] as number) -
        4 * (data[row + x] as number);
    }
  }
  return out;
}

function downsample2(canvas: RectifiedCanvas): Img {
  const n = canvas.size;
  const h = Math.floor(n / HALF);
  const w = h;
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = 2 * y * n + 2 * x;
      out[y * w + x] =
        ((canvas.data[i] as number) +
          (canvas.data[i + 1] as number) +
          (canvas.data[i + n] as number) +
          (canvas.data[i + n + 1] as number)) /
        4;
    }
  }
  return { data: out, width: w, height: h };
}

/** A connected component's bounding box and pixel count. */
export interface Component {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly area: number;
}

/** 8-connected components of a binary mask: labels (0 = background, first
 *  component 1) and per-component bounding boxes, `connectedComponentsWithStats`. */
function label8(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(width * height);
  const stats: Component[] = [{ x: 0, y: 0, w: 0, h: 0, area: 0 }];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue;
    const id = stats.length;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const px = index % width;
      const py = (index - px) / width;
      area += 1;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = py + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = px + dx;
          if (nx < 0 || nx >= width) continue;
          const ni = ny * width + nx;
          if (mask[ni] && !labels[ni]) {
            labels[ni] = id;
            stack.push(ni);
          }
        }
      }
    }
    stats.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }
  return { labels, stats };
}

/** Square dilation of a binary mask (outside the image ignored). */
function dilateSquare(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const rows = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 0;
      for (let d = -radius; d <= radius && !v; d += 1) {
        const nx = x + d;
        if (nx >= 0 && nx < width && mask[y * width + nx]) v = 1;
      }
      rows[y * width + x] = v;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 0;
      for (let d = -radius; d <= radius && !v; d += 1) {
        const ny = y + d;
        if (ny >= 0 && ny < height && rows[ny * width + x]) v = 1;
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/** Square erosion of a binary mask (outside the image counts as 0). */
function erodeSquare(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 1;
      for (let dy = -radius; dy <= radius && v; dy += 1) {
        const ny = y + dy;
        for (let dx = -radius; dx <= radius && v; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) v = 0;
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/** Square maximum filter (outside the image ignored), separably. */
function maxFilter(
  data: Float64Array,
  width: number,
  height: number,
  radius: number,
): Float64Array {
  const rows = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let m = -Infinity;
      for (let d = -radius; d <= radius; d += 1) {
        const nx = x + d;
        if (nx >= 0 && nx < width) {
          const v = data[y * width + nx] as number;
          if (v > m) m = v;
        }
      }
      rows[y * width + x] = m;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let m = -Infinity;
      for (let d = -radius; d <= radius; d += 1) {
        const ny = y + d;
        if (ny >= 0 && ny < height) {
          const v = rows[ny * width + x] as number;
          if (v > m) m = v;
        }
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

/** numpy's median: the mean of the two middle values for an even count.
 *  Linear time — a full sort of a million-entry map is most of the stage. */
function median(values: Float64Array): number {
  const n = values.length;
  if (n === 0) return 0;
  const copy = Float64Array.from(values);
  const mid = Math.floor(n / 2);
  const upper = kthSmallest(copy, mid);
  if (n % 2 === 1) return upper;
  // after selecting `mid`, the values before it are all <= it, so the other
  // middle value is the largest of them
  let lower = -Infinity;
  for (let i = 0; i < mid; i += 1) if ((copy[i] as number) > lower) lower = copy[i] as number;
  return (lower + upper) / 2;
}

/** The warp's white padding, grown so its edge cannot pose as a hole edge:
 *  nonzero where a pixel is not valid. */
function paddingMask(half: Img, ops: MapOps): Uint8Array {
  const { width: w, height: h } = half;
  const { labels, stats } = ops.components(ops.atLeast(half, PAD_WHITE), w, h);
  const badId = new Uint8Array(stats.length);
  for (let id = 1; id < stats.length; id += 1) {
    const s = stats[id] as Component;
    if (s.area < PAD_MIN_AREA) continue;
    if (s.x === 0 || s.y === 0 || s.x + s.w >= w || s.y + s.h >= h) badId[id] = 1;
  }
  const bad = new Uint8Array(w * h);
  for (let i = 0; i < bad.length; i += 1) bad[i] = badId[labels[i] as number] as number;
  return ops.dilate(bad, w, h, PAD_GROW);
}

/**
 * numpy's median of the values a histogram of quarter steps counts, `hist[q]`
 * being how many equal q / 4. The half-resolution canvas holds 2x2 means of
 * bytes, so every value is a quarter step and this is the exact median.
 */
function quarterMedian(hist: Int32Array, count: number): number {
  const nth = (k: number) => {
    let seen = 0;
    for (let q = 0; q < hist.length; q += 1) {
      seen += hist[q] as number;
      if (seen > k) return q / 4;
    }
    return (hist.length - 1) / 4;
  };
  const mid = count >> 1;
  return count % 2 === 1 ? nth(mid) : (nth(mid - 1) + nth(mid)) / 2;
}

// ---------------------------------------------------------------- the stage

function holeDiameterPx(canvas: RectifiedCanvas, face: ProposalFace): number {
  return face.caliberMm * canvas.pxPerMm;
}

function ringDistanceMm(rMm: number, face: ProposalFace): number {
  let best = Infinity;
  for (const rr of face.ringRadiiMm) best = Math.min(best, Math.abs(rMm - rr));
  return best;
}

/**
 * The whole-canvas operations, so a device can hand them to OpenCV.
 *
 * Under Hermes the pure blurs cost about two minutes on a 2100 px canvas
 * (measured on the emulator) — the same arithmetic in OpenCV is well under a
 * second. The rest of the stage stays in JS on both paths, so the native path
 * differs from the reference only by what OpenCV's own `GaussianBlur`,
 * `Laplacian`, `resize` and `dilate` compute in float64, which is the
 * arithmetic the Python reference runs to begin with. The mask operations
 * (components, dilate, erode) are exact, so they match bit for bit.
 */
export interface MapOps {
  /** 2x2 block means, row-major, `floor(size / 2)` square. */
  readonly halfResolution: (canvas: RectifiedCanvas) => Img;
  /** Gaussian blur (`gaussianKernel(sigma)`, BORDER_REFLECT_101) then the
   *  4-neighbour Laplacian. */
  readonly blurLaplacian: (img: Img, sigma: number) => Float64Array;
  /** Square maximum filter of the given half-size, outside the image ignored. */
  readonly maxFilter: (
    data: Float64Array,
    width: number,
    height: number,
    radius: number,
  ) => Float64Array;
  /** 8-connected components of a 0/1 mask: a label per pixel (0 = background)
   *  and each label's box. Only the partition counts, not the numbering. */
  readonly components: (
    mask: Uint8Array,
    width: number,
    height: number,
  ) => { readonly labels: Int32Array; readonly stats: readonly Component[] };
  /** Nonzero where `img` is at least `value`. */
  readonly atLeast: (img: Img, value: number) => Uint8Array;
  /** Square dilation of a 0/1 mask, outside the image ignored. */
  readonly dilate: (mask: Uint8Array, width: number, height: number, radius: number) => Uint8Array;
  /** Square erosion of a 0/1 mask, outside the image counting as 0. */
  readonly erode: (mask: Uint8Array, width: number, height: number, radius: number) => Uint8Array;
}

/** The reference implementation, pure JS. */
export const pureMapOps: MapOps = {
  halfResolution: downsample2,
  blurLaplacian: (img, sigma) =>
    laplacian4({ data: blur(img, sigma), width: img.width, height: img.height }),
  maxFilter,
  atLeast: (img, value) => {
    const out = new Uint8Array(img.data.length);
    for (let i = 0; i < out.length; i += 1) out[i] = (img.data[i] as number) >= value ? 1 : 0;
    return out;
  },
  components: label8,
  dilate: dilateSquare,
  erode: erodeSquare,
};

/** Row-major float image, exported for the native `MapOps`. */
export type { Img as MapImage };

/** The maps that do not depend on the calibre, so the hole-size check's
 *  second run on a canvas reuses its first's. */
interface CanvasMaps {
  readonly half: Img;
  readonly inzone: Uint8Array;
  readonly black: Uint8Array;
  readonly sampled: readonly number[];
  /** The glyph map grown by one px, in px: divided by the hole diameter it is
   *  the glyph map at that calibre. */
  readonly glyphPx: Float64Array;
}

const canvasMapsCache = new WeakMap<
  RectifiedCanvas,
  { readonly face: ProposalFace; readonly ops: MapOps; readonly maps: CanvasMaps }
>();

function sameFaceGeometry(a: ProposalFace, b: ProposalFace): boolean {
  return (
    a.blackRadiusMm === b.blackRadiusMm &&
    a.maxRadiusMm === b.maxRadiusMm &&
    a.ringRadiiMm.length === b.ringRadiiMm.length &&
    a.ringRadiiMm.every((r, i) => r === b.ringRadiiMm[i])
  );
}

function canvasMapsOf(canvas: RectifiedCanvas, face: ProposalFace, ops: MapOps): CanvasMaps {
  const cached = canvasMapsCache.get(canvas);
  if (cached && cached.ops === ops && sameFaceGeometry(cached.face, face)) return cached.maps;
  const maps = computeCanvasMaps(canvas, face, ops);
  canvasMapsCache.set(canvas, { face, ops, maps });
  return maps;
}

function computeCanvasMaps(canvas: RectifiedCanvas, face: ProposalFace, ops: MapOps): CanvasMaps {
  const half = ops.halfResolution(canvas);
  const { width: w, height: h } = half;
  const padding = paddingMask(half, ops);
  const black = new Uint8Array(w * h);
  const inzone = new Uint8Array(w * h);
  // Only the rings within reach of a pixel's whole-millimetre bucket are
  // tested for the ring-line mask, which is at most two.
  const lines = new Uint8Array(w * h);
  const buckets: number[][] = [];
  for (let mm = 0; mm <= Math.ceil(face.maxRadiusMm) + 1; mm += 1) {
    buckets.push(face.ringRadiiMm.filter((rr) => Math.abs(rr - mm) <= LINE_HALF_WIDTH_MM + 1));
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      // a half-res pixel is measured at the centre of its 2x2 block
      const fx = x * HALF + (HALF - 1) / 2;
      const fy = y * HALF + (HALF - 1) / 2;
      const r = Math.hypot(fx - canvas.centerXPx, fy - canvas.centerYPx) / canvas.pxPerMm;
      const i = y * w + x;
      black[i] = r <= BLACK_ZONE_FRACTION * face.blackRadiusMm ? 1 : 0;
      inzone[i] = r <= face.maxRadiusMm && !padding[i] ? 1 : 0;
      const near = buckets[Math.floor(r)];
      if (!near) continue;
      for (let k = 0; k < near.length; k += 1) {
        if (Math.abs(r - (near[k] as number)) <= LINE_HALF_WIDTH_MM) {
          lines[i] = 1;
          break;
        }
      }
    }
  }
  // The MAD over every MAD_STRIDE-th pixel in each direction of the scoring
  // area: a 1/16 sample is statistically the same number and keeps the two
  // exact medians affordable under Hermes.
  const sampled: number[] = [];
  for (let y = 0; y < h; y += MAD_STRIDE) {
    for (let x = 0; x < w; x += MAD_STRIDE) if (inzone[y * w + x]) sampled.push(y * w + x);
  }

  // printed-glyph extent map, per zone (0 = the black, 1 = the paper)
  const data = half.data;
  const hist = [new Int32Array(1021), new Int32Array(1021)] as const;
  const counts = [0, 0];
  let quarters = true;
  for (let i = 0; i < data.length; i += 1) {
    if (!inzone[i]) continue;
    const z = black[i] ? 0 : 1;
    const q = (data[i] as number) * 4;
    if (q !== Math.floor(q) || q < 0 || q > 1020) quarters = false;
    else (hist[z] as Int32Array)[q] = ((hist[z] as Int32Array)[q] as number) + 1;
    counts[z] = (counts[z] as number) + 1;
  }
  const bgOf = (z: 0 | 1): number => {
    if (quarters) return quarterMedian(hist[z], counts[z] as number);
    const values = new Float64Array(counts[z] as number);
    let c = 0;
    for (let i = 0; i < data.length; i += 1) {
      if (inzone[i] && (black[i] ? 0 : 1) === z) values[c++] = data[i] as number;
    }
    return median(values);
  };
  const zones = ([0, 1] as const).filter((z) => (counts[z] as number) >= 100);
  const bg = [0, 0];
  for (const z of zones) bg[z] = bgOf(z);
  const struct = [new Uint8Array(w * h), new Uint8Array(w * h)] as const;
  for (let i = 0; i < data.length; i += 1) {
    if (!inzone[i] || lines[i]) continue;
    const z = black[i] ? 0 : 1;
    if (Math.abs((data[i] as number) - (bg[z] as number)) > GLYPH_DELTA) struct[z][i] = 1;
  }
  // Extents in px: dividing by the hole diameter later gives the same values
  // as dividing each extent first, max and division both being monotone.
  const extents = zones.map((z) => {
    const { labels, stats } = ops.components(
      ops.erode(ops.dilate(struct[z], w, h, 1), w, h, 1),
      w,
      h,
    );
    const ext = new Float64Array(stats.length);
    for (let id = 1; id < stats.length; id += 1) {
      const s = stats[id] as Component;
      ext[id] = Math.max(s.w, s.h);
    }
    return { labels, ext };
  });
  const glyph = new Float64Array(w * h);
  for (const { labels, ext } of extents) {
    for (let i = 0; i < glyph.length; i += 1) {
      const v = ext[labels[i] as number] as number;
      if (v > (glyph[i] as number)) glyph[i] = v;
    }
  }
  return { half, inzone, black, sampled, glyphPx: ops.maxFilter(glyph, w, h, 1) };
}

function computeMaps(canvas: RectifiedCanvas, face: ProposalFace, ops: MapOps): Maps {
  const { half, inzone, black, sampled, glyphPx } = canvasMapsOf(canvas, face, ops);
  const dHalf = holeDiameterPx(canvas, face) / HALF;
  const sigma1 = dHalf / (2 * Math.SQRT2);
  const logOf = (sigma: number, floor: number): Float64Array => {
    const lap = ops.blurLaplacian(half, sigma);
    const count = sampled.length;
    const z = new Float64Array(count);
    for (let i = 0; i < count; i += 1) z[i] = lap[sampled[i] as number] as number;
    const med = median(z);
    const dev = new Float64Array(count);
    for (let i = 0; i < count; i += 1) dev[i] = Math.abs((z[i] as number) - med);
    const mad = Math.max(median(dev), floor) + 1e-3;
    for (let i = 0; i < lap.length; i += 1) lap[i] = (lap[i] as number) / mad;
    return lap;
  };
  const logs = {
    s1: logOf(sigma1, MAD_FLOOR.s1),
    s2: logOf(2 * sigma1, MAD_FLOOR.s2),
    s05: logOf(0.5 * sigma1, MAD_FLOOR.s05),
  };
  const glyph = new Float64Array(glyphPx.length);
  for (let i = 0; i < glyph.length; i += 1) glyph[i] = (glyphPx[i] as number) / dHalf;
  return { half, inzone, black, logs, glyph, dHalf };
}

/** (x, y, |LoG| in MADs) at full-res px for each local maximum, raster order. */
function findPeaks(maps: Maps, ops: MapOps): { x: number; y: number; resp: number }[] {
  const { width: w, height: h } = maps.half;
  const resp = new Float64Array(w * h);
  for (let i = 0; i < resp.length; i += 1) resp[i] = Math.abs(maps.logs.s1[i] as number);
  const radius = Math.round(NMS_RADIUS_D * maps.dHalf);
  const mx = ops.maxFilter(resp, w, h, radius);
  const out: { x: number; y: number; resp: number }[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const v = resp[i] as number;
      if (v >= (mx[i] as number) && v >= LOG_THRESHOLD_MAD && maps.inzone[i]) {
        // full-res position: the lower-right pixel of the 2x2 block, an integer
        out.push({ x: x * HALF + 1, y: y * HALF + 1, resp: v });
      }
    }
  }
  return out;
}

/** The clipped square window around (x0, y0): its bounds on the canvas. */
function windowOf(canvas: RectifiedCanvas, x0: number, y0: number, radius: number) {
  const n = canvas.size;
  return {
    xa: Math.max(0, x0 - radius),
    ya: Math.max(0, y0 - radius),
    xb: Math.min(n, x0 + radius + 1),
    yb: Math.min(n, y0 + radius + 1),
  };
}

function radialBins(canvas: RectifiedCanvas, x0: number, y0: number, d: number, inBlack: boolean) {
  const { xa, ya, xb, yb } = windowOf(canvas, x0, y0, Math.trunc(2.5 * d) + 1);
  const n = canvas.size;
  const bgValues: number[] = [];
  const sums = [0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0];
  let total = 0;
  let count = 0;
  for (let y = ya; y < yb; y += 1) {
    for (let x = xa; x < xb; x += 1) {
      const v = canvas.data[y * n + x] as number;
      total += v;
      count += 1;
      const rr = Math.hypot(x - x0, y - y0) / d;
      if (rr >= 1.5) {
        if (rr <= 2.5) bgValues.push(v);
        continue;
      }
      // bins [0, 0.25), [0.25, 0.5), [0.5, 0.75), [0.75, 1), [1, 1.5) of d
      const b = rr < 0.5 ? (rr < 0.25 ? 0 : 1) : rr < 0.75 ? 2 : rr < 1 ? 3 : 4;
      sums[b] = (sums[b] as number) + v;
      counts[b] = (counts[b] as number) + 1;
    }
  }
  const bg = bgValues.length > 10 ? median(Float64Array.from(bgValues)) : total / count;
  const sign = inBlack ? 1 : -1;
  const bins = sums.map((s, b) =>
    (counts[b] as number) > 0 ? sign * (s / (counts[b] as number) - bg) : 0,
  );
  let peak = 1;
  for (const v of bins) peak = Math.max(peak, Math.abs(v));
  return { bins, normalized: bins.map((v) => v / peak), bg, sign };
}

function blobShape(
  canvas: RectifiedCanvas,
  x0: number,
  y0: number,
  d: number,
  bg: number,
  sign: number,
): [number, number, number, number] {
  const { xa, ya, xb, yb } = windowOf(canvas, x0, y0, Math.trunc(1.3 * d) + 1);
  const n = canvas.size;
  const w = xb - xa;
  const h = yb - ya;
  const dev = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      dev[y * w + x] = sign * ((canvas.data[(ya + y) * n + xa + x] as number) - bg);
    }
  }
  const cy = y0 - ya;
  const cx = x0 - xa;
  let cSum = 0;
  let cCount = 0;
  for (let y = Math.max(0, cy - 2); y < Math.min(h, cy + 3); y += 1) {
    for (let x = Math.max(0, cx - 2); x < Math.min(w, cx + 3); x += 1) {
      cSum += dev[y * w + x] as number;
      cCount += 1;
    }
  }
  const c = cSum / cCount;
  if (c <= 4) return [0, 0, 0, 0];
  const bw = new Uint8Array(w * h);
  for (let i = 0; i < bw.length; i += 1) bw[i] = (dev[i] as number) >= 0.5 * c ? 1 : 0;
  const { labels, stats } = label8(bw, w, h);
  const id = labels[cy * w + cx] as number;
  if (id === 0) return [0, 0, 0, 0];
  const s = stats[id] as Component;
  const unit = Math.PI * (d / 2) ** 2;
  const ext = Math.max(s.w, s.h);
  const fill = ext > 0 ? s.area / ((Math.PI / 4) * ext * ext) : 0;
  const elong = ext / Math.max(1, Math.min(s.w, s.h));
  const touches = s.x === 0 || s.y === 0 || s.x + s.w >= w || s.y + s.h >= h ? 1 : 0;
  return [Math.min(s.area / unit, BLOB_AREA_CLIP), fill, Math.min(elong, BLOB_ELONG_CLIP), touches];
}

/**
 * Fraction of gradient energy in the two dominant orientation bins over a
 * 1.5 d crop: a manufactured edge concentrates, a torn rim does not.
 */
export function edgeStraightness(
  canvas: RectifiedCanvas,
  x0: number,
  y0: number,
  d: number,
): number {
  const { xa, ya, xb, yb } = windowOf(canvas, x0, y0, Math.trunc(0.75 * d) + 1);
  const n = canvas.size;
  const w = xb - xa;
  const h = yb - ya;
  const g = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1)
      g[y * w + x] = (canvas.data[(ya + y) * n + xa + x] as number) / 255;
  }
  const img: Img = { data: g, width: w, height: h };
  // cv2.Sobel(ksize=3): derivative along one axis, [1,2,1] smoothing across it.
  const gx = separable(img, Float64Array.of(-1, 0, 1), Float64Array.of(1, 2, 1));
  const gy = separable(img, Float64Array.of(1, 2, 1), Float64Array.of(-1, 0, 1));
  const hist = new Float64Array(STRAIGHT_BINS);
  let total = 0;
  for (let i = 0; i < g.length; i += 1) {
    // A gradient this small is a rounding residue of the convolution, and
    // its sign would otherwise pick the bin for an edge that is exactly
    // horizontal or vertical. Snapped to zero on both sides of the port.
    const dx = Math.abs(gx[i] as number) < GRADIENT_EPSILON ? 0 : (gx[i] as number);
    const dy = Math.abs(gy[i] as number) < GRADIENT_EPSILON ? 0 : (gy[i] as number);
    const mag = Math.hypot(dx, dy);
    // angle modulo pi, in [0, pi) as Python's `%` gives it
    let ang = Math.atan2(dy, dx) % Math.PI;
    if (ang < 0) ang += Math.PI;
    // bin edge i is i * (pi / 18), and an angle on an edge goes up — the
    // reference bins by hand the same way
    const step = Math.PI / STRAIGHT_BINS;
    let bin = Math.min(STRAIGHT_BINS - 1, Math.floor((ang / Math.PI) * STRAIGHT_BINS));
    if (ang < bin * step) bin -= 1;
    else if (bin < STRAIGHT_BINS - 1 && ang >= (bin + 1) * step) bin += 1;
    hist[bin] = (hist[bin] as number) + mag;
    total += mag;
  }
  const sorted = Float64Array.from(hist).sort();
  const top = (sorted[STRAIGHT_BINS - 1] as number) + (sorted[STRAIGHT_BINS - 2] as number);
  return top / (total + 1e-9);
}

/** The `HOLE_CROP_PX` crop, reflected at the canvas rim. */
function crop48(canvas: RectifiedCanvas, x0: number, y0: number): Uint8Array {
  const n = HOLE_CROP_PX;
  const out = new Uint8Array(n * n);
  const cols = new Int32Array(n);
  for (let x = 0; x < n; x += 1) cols[x] = reflectIndex(x0 - n / 2 + x, canvas.size);
  for (let y = 0; y < n; y += 1) {
    const row = reflectIndex(y0 - n / 2 + y, canvas.size) * canvas.size;
    for (let x = 0; x < n; x += 1)
      out[y * n + x] = canvas.data[row + (cols[x] as number)] as number;
  }
  return out;
}

/** A peak's features; with `blobOnly`, null when no blob is under it. */
function featuresAt(
  canvas: RectifiedCanvas,
  x0: number,
  y0: number,
  maps: Maps,
  face: ProposalFace,
  blobOnly?: false,
): HoleProposalFeatures;
function featuresAt(
  canvas: RectifiedCanvas,
  x0: number,
  y0: number,
  maps: Maps,
  face: ProposalFace,
  blobOnly: boolean,
): HoleProposalFeatures | null;
function featuresAt(
  canvas: RectifiedCanvas,
  x0: number,
  y0: number,
  maps: Maps,
  face: ProposalFace,
  blobOnly = false,
): HoleProposalFeatures | null {
  const d = holeDiameterPx(canvas, face);
  const rMm = Math.hypot(x0 - canvas.centerXPx, y0 - canvas.centerYPx) / canvas.pxPerMm;
  const inBlack = rMm <= BLACK_ZONE_FRACTION * face.blackRadiusMm;
  const sgn = inBlack ? 1 : -1;
  const { bins, normalized, bg, sign } = radialBins(canvas, x0, y0, d, inBlack);
  const [bArea, bFill, bElong, bTouch] = blobShape(canvas, x0, y0, d, bg, sign);
  if (blobOnly && bArea === 0) return null;
  const hf = holeFeatures({ data: crop48(canvas, x0, y0), size: HOLE_CROP_PX });
  const hi = Math.floor(y0 / HALF) * maps.half.width + Math.floor(x0 / HALF);
  // a hole in the black zone is bright, so its Laplacian is negative
  const log1 = -sgn * (maps.logs.s1[hi] as number);
  const log2 = -sgn * (maps.logs.s2[hi] as number);
  const log05 = -sgn * (maps.logs.s05[hi] as number);
  return {
    orient_entropy: hf.orientEntropy,
    hf_energy: hf.hfEnergy,
    laplacian_var: hf.laplacianVar,
    grad_mean: hf.gradMean,
    center_deviation: hf.centerDeviation,
    std: hf.stdDev,
    in_black: inBlack ? 1 : 0,
    ring_dist: Math.min(ringDistanceMm(rMm, face), RING_DIST_CLIP_MM),
    r_mm: rMm,
    log1,
    log2,
    log05,
    abslog1: Math.abs(log1),
    scale_ratio: log1 / (Math.abs(log2) + 1),
    rb0: bins[0] as number,
    rb1: bins[1] as number,
    rb2: bins[2] as number,
    rb3: bins[3] as number,
    rb4: bins[4] as number,
    nrb0: normalized[0] as number,
    nrb1: normalized[1] as number,
    nrb2: normalized[2] as number,
    nrb3: normalized[3] as number,
    nrb4: normalized[4] as number,
    b_area: bArea,
    b_fill: bFill,
    b_elong: bElong,
    b_touch: bTouch,
    straight: edgeStraightness(canvas, x0, y0, d),
    glyph: Math.min(maps.glyph[hi] as number, GLYPH_CLIP),
  };
}

/** Probability that a candidate is a bullet hole, 0..1. */
export function holeProposalProbability(features: HoleProposalFeatures): number {
  let z = HOLE_PROPOSAL_BIAS;
  for (const name of HOLE_PROPOSAL_FEATURE_NAMES) {
    z += HOLE_PROPOSAL_WEIGHTS[name] * features[name];
  }
  return 1 / (1 + Math.exp(-z));
}

function refineCenter(
  canvas: RectifiedCanvas,
  x: number,
  y: number,
  d: number,
  bg: number,
  sign: number,
): { x: number; y: number } {
  const radius = Math.trunc(REFINE_RADIUS_D * d) + 1;
  const n = canvas.size;
  let cx = x;
  let cy = y;
  for (let iter = 0; iter < REFINE_ITERS; iter += 1) {
    const { xa, ya, xb, yb } = windowOf(canvas, Math.round(cx), Math.round(cy), radius);
    let sum = 0;
    let sumX = 0;
    let sumY = 0;
    for (let py = ya; py < yb; py += 1) {
      for (let px = xa; px < xb; px += 1) {
        if (Math.hypot(px - cx, py - cy) > REFINE_RADIUS_D * d) continue;
        const w = Math.max(0, sign * ((canvas.data[py * n + px] as number) - bg));
        sum += w;
        sumX += w * px;
        sumY += w * py;
      }
    }
    if (sum < 1e-3) break;
    cx = sumX / sum;
    cy = sumY / sum;
  }
  return { x: cx, y: cy };
}

/** Which peaks `holeCandidates` returns. */
export interface CandidateScope {
  /** Only the peaks with a blob under them (`b_area` > 0), for a reader that
   *  drops the rest; those skip the crop features and edge straightness. */
  readonly blobOnly?: boolean;
}

/**
 * Every peak with its features and probability, unfiltered unless `scope`
 * says so — what the lock-step fixture and the evaluation consume.
 */
export function holeCandidates(
  canvas: RectifiedCanvas,
  face: ProposalFace,
  ops: MapOps = pureMapOps,
  timings?: DetectorTimings,
  scope: CandidateScope = {},
): HoleCandidate[] {
  if (canvas.size < 4 || canvas.pxPerMm <= 0) return [];
  if (canvas.data.length < canvas.size * canvas.size) return [];
  const t0 = performance.now();
  const maps = computeMaps(canvas, face, ops);
  const t1 = performance.now();
  const peaks = findPeaks(maps, ops);
  const t2 = performance.now();
  const found: HoleCandidate[] = [];
  for (const peak of peaks) {
    const features = featuresAt(canvas, peak.x, peak.y, maps, face, scope.blobOnly ?? false);
    if (features) found.push({ ...peak, features, probability: holeProposalProbability(features) });
  }
  if (timings) {
    Object.assign(timings, {
      mapsMs: t1 - t0,
      peaksMs: t2 - t1,
      featuresMs: performance.now() - t2,
      peaks: peaks.length,
      canvasPx: canvas.size,
    });
  }
  return found;
}

/**
 * The holes the stage proposes, in target-mm, highest probability first.
 *
 * Two touching holes closer than one diameter come out as one proposal — the
 * merge step cannot tell a double from a hole with two peaks, and a shooter
 * adds the second by hand.
 */
export function proposeHoles(
  canvas: RectifiedCanvas,
  face: ProposalFace,
  threshold = HOLE_PROPOSAL_THRESHOLD,
  ops: MapOps = pureMapOps,
  fillTo = 0,
): HoleProposal[] {
  return selectProposals(canvas, face, holeCandidates(canvas, face, ops), threshold, fillTo);
}

/**
 * `proposeHoles` for a screen: the maps run in one go (native on a device),
 * then the per-candidate features in batches with a yield between them, so
 * the marking screen keeps painting and taking taps while it works.
 */
export async function proposeHolesAsync(
  canvas: RectifiedCanvas,
  face: ProposalFace,
  options: {
    readonly ops?: MapOps;
    readonly threshold?: number;
    readonly batch?: number;
    /** Fill up to this many proposals from the next-best candidates; 0 = off. */
    readonly fillTo?: number;
    /** `holeCandidates` already run on this canvas and face; the detector is
     *  then skipped. */
    readonly candidates?: readonly HoleCandidate[];
  } = {},
): Promise<HoleProposal[]> {
  const ops = options.ops ?? pureMapOps;
  const batch = options.batch ?? 8;
  if (canvas.size < 4 || canvas.pxPerMm <= 0) return [];
  if (canvas.data.length < canvas.size * canvas.size) return [];
  const yieldToScreen = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  await yieldToScreen();
  let candidates = options.candidates;
  if (!candidates) {
    const maps = computeMaps(canvas, face, ops);
    const peaks = findPeaks(maps, ops);
    const found: HoleCandidate[] = [];
    for (let i = 0; i < peaks.length; i += batch) {
      await yieldToScreen();
      for (const peak of peaks.slice(i, i + batch)) {
        const features = featuresAt(canvas, peak.x, peak.y, maps, face);
        found.push({ ...peak, features, probability: holeProposalProbability(features) });
      }
    }
    candidates = found;
  }
  return selectProposals(
    canvas,
    face,
    candidates,
    options.threshold ?? HOLE_PROPOSAL_THRESHOLD,
    options.fillTo ?? 0,
  );
}

/**
 * The confident candidates (probability >= `threshold`), merged; then, while
 * fewer than `fillTo` were found, the next-best down to
 * HOLE_PROPOSAL_FILL_THRESHOLD, marked `filled`. `fillTo` 0 is the default
 * behaviour: confident only.
 */
export function selectProposals(
  canvas: RectifiedCanvas,
  face: ProposalFace,
  candidates: readonly HoleCandidate[],
  threshold: number,
  fillTo = 0,
): HoleProposal[] {
  const d = holeDiameterPx(canvas, face);
  const kept: HoleProposal[] = [];
  const take = (c: HoleCandidate, filled: boolean) => {
    if (kept.some((k) => Math.hypot(c.x - k.peakX, c.y - k.peakY) < MERGE_RADIUS_D * d)) return;
    const inBlack = c.features.in_black > 0.5;
    const { bg, sign } = radialBins(canvas, c.x, c.y, d, inBlack);
    const refined = refineCenter(canvas, c.x, c.y, d, bg, sign);
    kept.push({
      xMm: (refined.x - canvas.centerXPx) / canvas.pxPerMm,
      yMm: (refined.y - canvas.centerYPx) / canvas.pxPerMm,
      probability: c.probability,
      peakX: c.x,
      peakY: c.y,
      filled,
    });
  };
  const byProbability = (a: HoleCandidate, b: HoleCandidate) => b.probability - a.probability;
  for (const c of candidates.filter((c) => c.probability >= threshold).sort(byProbability)) {
    take(c, false);
  }
  if (kept.length >= fillTo) return kept;
  const next = candidates
    .filter((c) => c.probability < threshold && c.probability >= HOLE_PROPOSAL_FILL_THRESHOLD)
    .sort(byProbability);
  for (const c of next) {
    if (kept.length >= fillTo) break;
    take(c, true);
  }
  return kept;
}
