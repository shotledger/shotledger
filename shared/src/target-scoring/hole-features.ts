// Telling a bullet hole from a repair patch, a printed digit or a shadow, by
// texture alone.
//
// Spec: docs/specs/cv-assisted-detection-spec.md. Measurements:
// docs/specs/cv-corpus-validation-2026-09.md §5.
//
// A patch is flat — uniform fill, manufactured edges. A hole has a torn rim
// against the ink or the paper. Six texture descriptors over a 12 mm gray crop
// separate the two, and a logistic regression over them is eight constants and
// no runtime.
//
// The arithmetic mirrors the Python spike's, which ran against OpenCV and
// produced the fitted weights. This one runs where the app does, on the gray
// `RectifiedCanvas` and without OpenCV — so every convolution below has to
// reproduce OpenCV's own, border handling included.
// `hole-features.fixtures.json` is a snapshot of it (`pnpm cv:fixtures`).

/** A square, row-major, 8-bit gray crop. */
export interface GrayCrop {
  readonly data: Uint8Array | readonly number[];
  readonly size: number;
}

export interface HoleFeatures {
  /** Shannon entropy of magnitude-weighted gradient direction, 18 bins. */
  readonly orientEntropy: number;
  /** Mean squared difference from a 5×5 Gaussian blur, ×1000. */
  readonly hfEnergy: number;
  /** Variance of the 3×3 Laplacian, ×1000. */
  readonly laplacianVar: number;
  /** Mean Sobel-3 gradient magnitude. */
  readonly gradMean: number;
  /** |mean(middle third) − mean(crop)|. A magnitude: see the spec, §1. */
  readonly centerDeviation: number;
  /** Population standard deviation. */
  readonly stdDev: number;
}

/**
 * Crop side, in canvas px. `CANVAS_PX_PER_MM` is 4, so this is a 12 mm box —
 * about twice a .22 hole, which is what the weights were fitted on. Changing
 * it invalidates them.
 */
export const HOLE_CROP_PX = 48;

/** Number of gradient-direction bins. */
const ORIENT_BINS = 18;
/** Below this a gradient is a rounding residue, not an edge. */
const GRADIENT_EPSILON = 1e-9;

/**
 * Fitted on 208 candidates from 31 hand-marked photos across both corpora;
 * `tools/cv/fit/fit-hole-filter.mts` refits them. Raw feature scale, so they
 * apply to the numbers `holeFeatures` returns with no standardization step.
 */
export const HOLE_FILTER_WEIGHTS: HoleFeatures = {
  orientEntropy: 28.0314,
  hfEnergy: -1.123,
  laplacianVar: 0.118,
  gradMean: 27.5267,
  centerDeviation: 31.6067,
  stdDev: -47.831,
};

export const HOLE_FILTER_BIAS = -85.0118;

/**
 * Where to cut. 0.5 measured 89.7% precision at 0.32 false positives per photo
 * over the pooled corpora, against 34%/6.05 for the unfiltered stage.
 */
export const HOLE_PROBABILITY_THRESHOLD = 0.5;

const ZERO_FEATURES: HoleFeatures = {
  orientEntropy: 0,
  hfEnergy: 0,
  laplacianVar: 0,
  gradMean: 0,
  centerDeviation: 0,
  stdDev: 0,
};

/**
 * OpenCV's `BORDER_REFLECT_101`: the edge pixel is not repeated, so index −1
 * reflects to 1 and index n to n−2. Every kernel below uses it because every
 * OpenCV call the reference makes does — and it is exported because cutting a
 * crop near the canvas rim has to extend the canvas the same way.
 */
export function reflectIndex(index: number, size: number): number {
  if (size === 1) return 0;
  let i = index;
  // A loop rather than one formula: a crop is never small enough for this to
  // run more than once, and the formula for repeated reflection is unreadable.
  while (i < 0 || i >= size) {
    if (i < 0) i = -i;
    if (i >= size) i = 2 * size - 2 - i;
  }
  return i;
}

/** Normalized gray, 0..1, or null when the crop cannot be read. */
function toFloat(crop: GrayCrop): Float64Array | null {
  const n = crop.size;
  if (!Number.isInteger(n) || n < 3) return null;
  if (crop.data.length < n * n) return null;
  const out = new Float64Array(n * n);
  for (let i = 0; i < n * n; i += 1) out[i] = (crop.data[i] as number) / 255;
  return out;
}

/**
 * One separable pass: `rowKernel` along x, then `colKernel` along y, both with
 * `BORDER_REFLECT_101` — the order `cv2.sepFilter2D` uses, and the reason
 * `cv2.Sobel` is reproduced this way rather than as one 3×3 kernel.
 *
 * Separability is not an optimization here, it is correctness. Applied as a
 * single 3×3 kernel, the y-derivative of an image whose rows are identical
 * leaves a rounding residue of ~1e-16 instead of zero, and the sign of that
 * residue then decides which orientation bin a pixel lands in. Done
 * separably, the derivative pass differences two identical numbers and the
 * cancellation is exact.
 */
function separable(
  src: Float64Array,
  n: number,
  rowKernel: Kernel,
  colKernel: Kernel,
): Float64Array {
  return pass(pass(src, n, rowKernel, true), n, colKernel, false);
}

/** A 3- or 5-tap kernel, the only sizes used here. */
type Kernel = readonly [number, number, number] | readonly [number, number, number, number, number];

/**
 * One 1-D pass along x or y. Inside the border the taps are written out, and
 * the border reads `reflectedTaps`: without a JIT (Hermes) the per-tap loop
 * and lookup were most of the cost. Either way the products are summed from
 * 0 in tap order, so the result is the same to the bit.
 */
function pass(input: Float64Array, n: number, kernel: Kernel, alongX: boolean): Float64Array {
  const radius = (kernel.length - 1) / 2;
  const taps = reflectedTaps(n, radius);
  // Position p on line `line` is at `line * across + p * s`.
  const s = alongX ? 1 : n;
  const across = alongX ? n : 1;
  const [k0, k1, k2, k3 = 0, k4 = 0] = kernel;
  const out = new Float64Array(n * n);
  const edge = (base: number, p: number) => {
    let sum = 0;
    for (let k = 0; k < kernel.length; k += 1) {
      sum += (kernel[k] as number) * (input[base + (taps[k * n + p] as number) * s] as number);
    }
    out[base + p * s] = sum;
  };
  for (let line = 0; line < n; line += 1) {
    const base = line * across;
    // A crop under 2 * radius + 1 px is all border.
    for (let p = 0; p < radius; p += 1) edge(base, p);
    for (let p = Math.max(radius, n - radius); p < n; p += 1) edge(base, p);
    const end = base + (n - radius) * s;
    if (radius === 1) {
      for (let i = base + s; i < end; i += s) {
        out[i] =
          0 +
          k0 * (input[i - s] as number) +
          k1 * (input[i] as number) +
          k2 * (input[i + s] as number);
      }
    } else {
      for (let i = base + 2 * s; i < end; i += s) {
        out[i] =
          0 +
          k0 * (input[i - 2 * s] as number) +
          k1 * (input[i - s] as number) +
          k2 * (input[i] as number) +
          k3 * (input[i + s] as number) +
          k4 * (input[i + 2 * s] as number);
      }
    }
  }
  return out;
}

/** `reflectIndex(p + k - radius, n)` at `[k * n + p]`, for every tap k and position p. */
function reflectedTaps(n: number, radius: number): Int32Array {
  const taps = new Int32Array((2 * radius + 1) * n);
  for (let k = 0; k <= 2 * radius; k += 1) {
    for (let p = 0; p < n; p += 1) taps[k * n + p] = reflectIndex(p + k - radius, n);
  }
  return taps;
}

/** A 3×3 convolution, written out inside the border as `pass` is. */
function convolve3(
  src: Float64Array,
  n: number,
  kernel: readonly [number, number, number, number, number, number, number, number, number],
): Float64Array {
  const taps = reflectedTaps(n, 1);
  const [k0, k1, k2, k3, k4, k5, k6, k7, k8] = kernel;
  const out = new Float64Array(n * n);
  const edge = (y: number, x: number) => {
    let sum = 0;
    for (let ky = 0; ky < 3; ky += 1) {
      const row = (taps[ky * n + y] as number) * n;
      for (let kx = 0; kx < 3; kx += 1) {
        sum +=
          (kernel[ky * 3 + kx] as number) * (src[row + (taps[kx * n + x] as number)] as number);
      }
    }
    out[y * n + x] = sum;
  };
  for (let y = 0; y < n; y += 1) {
    if (y === 0 || y === n - 1) {
      for (let x = 0; x < n; x += 1) edge(y, x);
      continue;
    }
    edge(y, 0);
    edge(y, n - 1);
    const end = y * n + n - 1;
    for (let i = y * n + 1; i < end; i += 1) {
      out[i] =
        0 +
        k0 * (src[i - n - 1] as number) +
        k1 * (src[i - n] as number) +
        k2 * (src[i - n + 1] as number) +
        k3 * (src[i - 1] as number) +
        k4 * (src[i] as number) +
        k5 * (src[i + 1] as number) +
        k6 * (src[i + n - 1] as number) +
        k7 * (src[i + n] as number) +
        k8 * (src[i + n + 1] as number);
    }
  }
  return out;
}

/**
 * `cv2.GaussianBlur(src, (5, 5), 0)`'s kernel.
 *
 * Not a sampled Gaussian: for `ksize <= 7` with `sigma <= 0`, OpenCV's
 * `getGaussianKernel` returns a hardcoded binomial kernel — [1,4,6,4,1]/16
 * here — rather than evaluating `exp()` at the sigma it would otherwise
 * derive. Computing the Gaussian instead puts `hfEnergy` about 2.5% out,
 * which is far past any float32-versus-float64 difference.
 */
const GAUSSIAN_5 = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16] as const;

/** Separable 5×5 Gaussian blur, `BORDER_REFLECT_101`, as `cv2.GaussianBlur`. */
function blur5(src: Float64Array, n: number): Float64Array {
  return separable(src, n, GAUSSIAN_5, GAUSSIAN_5);
}

// `mean` and `variance` take no empty-array guard: `toFloat` has already
// refused anything under 3x3, so every array reaching them has length >= 9,
// and the center window of a 3x3 crop is 1x1.
function mean(values: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i] as number;
  return sum / values.length;
}

function variance(values: Float64Array): number {
  const m = mean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const d = (values[i] as number) - m;
    sum += d * d;
  }
  return sum / values.length;
}

/** Six texture descriptors of one hole-sized gray crop. */
export function holeFeatures(crop: GrayCrop): HoleFeatures {
  const g = toFloat(crop);
  if (!g) return ZERO_FEATURES;
  const n = crop.size;

  // cv2.Sobel(ksize=3): derivative along one axis, [1,2,1] smoothing across it.
  const gx = separable(g, n, [-1, 0, 1], [1, 2, 1]);
  const gy = separable(g, n, [1, 2, 1], [-1, 0, 1]);

  // A torn rim has gradients in every direction; a printed edge is a straight
  // line, so its gradients cluster in two.
  const histogram = new Float64Array(ORIENT_BINS);
  let magSum = 0;
  let gradTotal = 0;
  for (let i = 0; i < g.length; i += 1) {
    // A gradient this small is a rounding residue of the convolution, and its
    // sign would otherwise pick the orientation bin of an edge that is exactly
    // horizontal or vertical — differently in float64 here and float32 in the
    // reference. Snapped to zero on both sides.
    const x = Math.abs(gx[i] as number) < GRADIENT_EPSILON ? 0 : (gx[i] as number);
    const y = Math.abs(gy[i] as number) < GRADIENT_EPSILON ? 0 : (gy[i] as number);
    const magnitude = Math.hypot(x, y);
    gradTotal += magnitude;
    const angle = Math.atan2(y, x);
    // atan2 of finite inputs is in [-PI, PI], so only the top edge can fall
    // outside: an angle of exactly PI indexes one bin past the end. numpy's
    // histogram puts that value in the last bin, so this does too. There is no
    // matching guard below because no finite angle can index below zero.
    let bin = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * ORIENT_BINS);
    if (bin >= ORIENT_BINS) bin = ORIENT_BINS - 1;
    histogram[bin] = (histogram[bin] as number) + magnitude;
    magSum += magnitude;
  }
  let orientEntropy = 0;
  for (let b = 0; b < ORIENT_BINS; b += 1) {
    const p = (histogram[b] as number) / (magSum + 1e-9);
    orientEntropy -= p * Math.log(p + 1e-9);
  }

  const blurred = blur5(g, n);
  let hfSum = 0;
  for (let i = 0; i < g.length; i += 1) {
    const d = (g[i] as number) - (blurred[i] as number);
    hfSum += d * d;
  }

  const laplacian = convolve3(g, n, [0, 1, 0, 1, -4, 1, 0, 1, 0]);

  // The middle third, by floor division, exactly as the reference slices it.
  const lo = Math.floor(n / 3);
  const hi = Math.floor((2 * n) / 3);
  const centerSide = hi - lo;
  const center = new Float64Array(centerSide * centerSide);
  let c = 0;
  for (let y = lo; y < hi; y += 1) {
    for (let x = lo; x < hi; x += 1) center[c++] = g[y * n + x] as number;
  }

  return {
    orientEntropy,
    hfEnergy: (hfSum / g.length) * 1e3,
    laplacianVar: variance(laplacian) * 1e3,
    gradMean: gradTotal / g.length,
    centerDeviation: Math.abs(mean(center) - mean(g)),
    stdDev: Math.sqrt(variance(g)),
  };
}

/** Probability that a crop is a bullet hole, 0..1. */
export function holeProbability(features: HoleFeatures): number {
  const w = HOLE_FILTER_WEIGHTS;
  const z =
    HOLE_FILTER_BIAS +
    w.orientEntropy * features.orientEntropy +
    w.hfEnergy * features.hfEnergy +
    w.laplacianVar * features.laplacianVar +
    w.gradMean * features.gradMean +
    w.centerDeviation * features.centerDeviation +
    w.stdDev * features.stdDev;
  return 1 / (1 + Math.exp(-z));
}

/** Whether a crop clears the shipped threshold. */
export function isHoleLike(features: HoleFeatures): boolean {
  return holeProbability(features) >= HOLE_PROBABILITY_THRESHOLD;
}
