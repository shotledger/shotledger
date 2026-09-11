// Where a session's shots actually land, as a density grid rather than a
// scatter of dots.
//
// A group plot answers "how tight", which `analyzeGroup` already quantifies.
// This answers a different question: "where do I keep putting them" — and it
// is only worth asking once there are enough shots that a scatter turns into
// an unreadable smear. A 60-shot precision session is exactly that.
//
// Input is target-mm in the same convention as everything else here (origin
// at the target centre, y increasing DOWNWARD), so the grid can be drawn
// straight over the ring overlay.

import type { GroupPoint } from './group';

export interface HeatmapCell {
  /** Grid column and row, 0-based from the top-left of the covered square. */
  readonly column: number;
  readonly row: number;
  /** Centre of the cell, in target-mm. */
  readonly xMm: number;
  readonly yMm: number;
  /** Shots in this cell. */
  readonly count: number;
  /**
   * `count` over the busiest cell's count, so 1 is always the hottest cell
   * and the renderer needs no knowledge of the session's size. A session with
   * one shot is entirely "hottest", which is why `shotCount` is exposed —
   * the caller decides when a heatmap is worth showing at all.
   */
  readonly intensity: number;
}

export interface Heatmap {
  /** Cells with at least one shot, hottest first. Empty cells are omitted. */
  readonly cells: readonly HeatmapCell[];
  readonly resolution: number;
  /** Side of the square the grid covers, in mm, centred on the target. */
  readonly extentMm: number;
  readonly cellSizeMm: number;
  readonly shotCount: number;
  /** Shots in the busiest cell. */
  readonly peakCount: number;
}

/**
 * Below this the picture is noise: with six shots every occupied cell is
 * either 1 or 2 and the colour scale says nothing a scatter plot did not.
 */
export const MIN_SHOTS_FOR_HEATMAP = 20;

/**
 * Bins `points` into a `resolution` x `resolution` grid covering a square of
 * `extentMm` centred on the target.
 *
 * A shot outside the square is clamped into the edge cell rather than
 * dropped — a flier is information, and silently losing it would make the
 * counts disagree with the session total.
 */
export function buildHeatmap(
  points: readonly GroupPoint[],
  extentMm: number,
  resolution = 12,
): Heatmap | null {
  if (!(extentMm > 0)) throw new RangeError(`extentMm must be > 0, got ${extentMm}`);
  if (!Number.isInteger(resolution) || resolution < 1) {
    throw new RangeError(`resolution must be a positive integer, got ${resolution}`);
  }
  if (points.length === 0) return null;

  const cellSizeMm = extentMm / resolution;
  const half = extentMm / 2;
  const counts = new Map<string, number>();

  for (const point of points) {
    if (!Number.isFinite(point.xMm) || !Number.isFinite(point.yMm)) {
      throw new RangeError(`heatmap coordinates must be finite, got (${point.xMm}, ${point.yMm})`);
    }
    const column = clampIndex(Math.floor((point.xMm + half) / cellSizeMm), resolution);
    const row = clampIndex(Math.floor((point.yMm + half) / cellSizeMm), resolution);
    const key = `${column},${row}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let peakCount = 0;
  for (const count of counts.values()) peakCount = Math.max(peakCount, count);

  const cells: HeatmapCell[] = [];
  for (const [key, count] of counts) {
    const [column, row] = key.split(',').map(Number) as [number, number];
    cells.push({
      column,
      row,
      xMm: (column + 0.5) * cellSizeMm - half,
      yMm: (row + 0.5) * cellSizeMm - half,
      count,
      intensity: count / peakCount,
    });
  }

  // Hottest first, then a stable order so two equally hot cells never swap
  // between renders.
  cells.sort((a, b) => b.count - a.count || a.row - b.row || a.column - b.column);

  return {
    cells,
    resolution,
    extentMm,
    cellSizeMm,
    shotCount: points.length,
    peakCount,
  };
}

function clampIndex(index: number, resolution: number): number {
  return Math.min(resolution - 1, Math.max(0, index));
}
