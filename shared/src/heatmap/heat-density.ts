// A smooth shot-density heat map: a Gaussian kernel density over the holes,
// colored blue → cyan → green → yellow → red → white and laid over the target
// face like a football heat map over the pitch. The app's `ShotHeatmap` and
// the session report both draw it from `heatDensityCells`.
//
// Target-mm throughout, origin at the target center, y increasing downward.

/**
 * Below this the picture is noise: with a handful of holes the density is
 * just a blob per hole, and the group plot already says that.
 */
export const MIN_SHOTS_FOR_HEATMAP = 20;

export interface DensityGrid {
  resolution: number;
  /** Side of the square covered, centered on the target. */
  extentMm: number;
  cellSizeMm: number;
  /** Row-major, `resolution * resolution`, scaled so the peak is 1. */
  values: number[];
}

interface Point {
  xMm: number;
  yMm: number;
}

/**
 * Kernel width by Scott's rule for two dimensions (σ · n^(-1/6)), floored at
 * 2.5 % of the view so one or two holes still read as a blob, not a pixel.
 */
export function densityBandwidthMm(points: readonly Point[], extentMm: number): number {
  const floor = extentMm * 0.025;
  if (points.length < 2) return Math.max(floor, extentMm * 0.05);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const xs = points.map((p) => p.xMm);
  const ys = points.map((p) => p.yMm);
  const mx = mean(xs);
  const my = mean(ys);
  const variance =
    (xs.reduce((a, x) => a + (x - mx) ** 2, 0) + ys.reduce((a, y) => a + (y - my) ** 2, 0)) /
    (2 * (points.length - 1));
  return Math.max(floor, Math.sqrt(variance) * points.length ** (-1 / 6));
}

/** The density sampled at each cell center; null with no points. */
export function densityGrid(
  points: readonly Point[],
  extentMm: number,
  resolution = 60,
): DensityGrid | null {
  if (!(extentMm > 0)) throw new RangeError(`extentMm must be > 0, got ${extentMm}`);
  if (!Number.isInteger(resolution) || resolution < 1) {
    throw new RangeError(`resolution must be a positive integer, got ${resolution}`);
  }
  if (points.length === 0) return null;
  for (const p of points) {
    if (!Number.isFinite(p.xMm) || !Number.isFinite(p.yMm)) {
      throw new RangeError(`heat map coordinates must be finite, got (${p.xMm}, ${p.yMm})`);
    }
  }

  const h = densityBandwidthMm(points, extentMm);
  const twoHSquared = 2 * h * h;
  const cellSizeMm = extentMm / resolution;
  const half = extentMm / 2;
  const values = new Array<number>(resolution * resolution).fill(0);
  let peak = 0;
  for (let row = 0; row < resolution; row++) {
    const y = (row + 0.5) * cellSizeMm - half;
    for (let column = 0; column < resolution; column++) {
      const x = (column + 0.5) * cellSizeMm - half;
      let sum = 0;
      for (const p of points) sum += Math.exp(-((x - p.xMm) ** 2 + (y - p.yMm) ** 2) / twoHSquared);
      values[row * resolution + column] = sum;
      peak = Math.max(peak, sum);
    }
  }
  return { resolution, extentMm, cellSizeMm, values: values.map((v) => v / peak) };
}

/** The "jet" ramp, dark blue at 0 to full red at 0.9, then whitening to the peak. */
export function heatColor(value: number): string {
  const v = Math.min(1, Math.max(0, value));
  const t = Math.min(v, 0.9) * (0.875 / 0.9);
  const channel = (center: number) => Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - center)));
  let r = channel(3);
  let g = channel(2);
  let b = channel(1);
  const white = v > 0.9 ? ((v - 0.9) / 0.1) * 0.9 : 0;
  r += (1 - r) * white;
  g += (1 - g) * white;
  b += (1 - b) * white;
  const hex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** One drawn cell of the density, in target-mm. */
export interface HeatDensityCell {
  xMm: number;
  yMm: number;
  sizeMm: number;
  color: string;
  opacity: number;
}

export interface HeatDensityLayer {
  cells: HeatDensityCell[];
  /** Gaussian blur, in target-mm, that hides the cell edges. */
  blurMm: number;
}

/** Below this share of the peak a cell is left out, so empty ground stays clear. */
const MIN_DRAWN_VALUE = 0.04;

/**
 * The density as cells ready to draw under a blur, over a square of
 * `extentMm` centered on the target. Each cell overlaps its neighbors
 * slightly so the blur leaves no seams. Null with no points.
 */
export function heatDensityCells(
  points: readonly Point[],
  extentMm: number,
  resolution = 60,
): HeatDensityLayer | null {
  const grid = densityGrid(points, extentMm, resolution);
  if (!grid) return null;
  const half = extentMm / 2;
  const cells: HeatDensityCell[] = [];
  for (const [index, value] of grid.values.entries()) {
    if (value < MIN_DRAWN_VALUE) continue;
    cells.push({
      xMm: (index % resolution) * grid.cellSizeMm - half,
      yMm: Math.floor(index / resolution) * grid.cellSizeMm - half,
      sizeMm: grid.cellSizeMm * 1.05,
      color: heatColor(value),
      opacity: Math.min(0.9, 0.25 + value * 0.75),
    });
  }
  return { cells, blurMm: grid.cellSizeMm * 0.8 };
}
