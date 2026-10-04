import { describe, expect, it } from 'vitest';

import {
  densityBandwidthMm,
  densityGrid,
  heatColor,
  heatDensityCells,
  MIN_SHOTS_FOR_HEATMAP,
} from './heat-density';

describe('heatColor', () => {
  it('runs dark blue → cyan → green → yellow → red → near white', () => {
    expect(heatColor(0)).toBe('#000080');
    expect(heatColor(0.9)).toBe('#ff0000');
    expect(heatColor(1)).toBe('#ffe5e5');
    // Green dominates mid-ramp.
    const mid = heatColor(0.45);
    expect(parseInt(mid.slice(3, 5), 16)).toBe(255);
  });

  it('clamps out-of-range values', () => {
    expect(heatColor(-1)).toBe(heatColor(0));
    expect(heatColor(2)).toBe(heatColor(1));
  });
});

describe('densityBandwidthMm', () => {
  it('follows the spread, shrinking slowly with more holes', () => {
    const ring = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        xMm: 30 * Math.cos((2 * Math.PI * i) / n),
        yMm: 30 * Math.sin((2 * Math.PI * i) / n),
      }));
    expect(densityBandwidthMm(ring(64), 400)).toBeLessThan(densityBandwidthMm(ring(8), 400));
    expect(densityBandwidthMm(ring(8), 400)).toBeGreaterThan(10);
  });

  it('never drops below the floor, even for one hole', () => {
    expect(densityBandwidthMm([{ xMm: 0, yMm: 0 }], 200)).toBe(10);
    expect(
      densityBandwidthMm(
        [
          { xMm: 1, yMm: 1 },
          { xMm: 1, yMm: 1 },
        ],
        200,
      ),
    ).toBe(5);
  });
});

describe('densityGrid', () => {
  it('peaks at 1 in the cell under a tight cluster', () => {
    const grid = densityGrid(
      [
        { xMm: 25, yMm: -25 },
        { xMm: 26, yMm: -24 },
        { xMm: 24, yMm: -26 },
      ],
      100,
      10,
    )!;
    expect(grid.values).toHaveLength(100);
    const peak = grid.values.indexOf(1);
    // Centered on (25, -25): column 7, row 2 of a 10 mm grid from -50.
    expect(peak).toBe(2 * 10 + 7);
    expect(Math.min(...grid.values)).toBeGreaterThanOrEqual(0);
  });

  it('returns null with no points and rejects a bad grid', () => {
    expect(densityGrid([], 100)).toBeNull();
    expect(() => densityGrid([{ xMm: 0, yMm: 0 }], 0)).toThrow(RangeError);
    expect(() => densityGrid([{ xMm: 0, yMm: 0 }], 100, 0)).toThrow(RangeError);
  });
});

describe('densityGrid input', () => {
  it('rejects a non-finite coordinate', () => {
    expect(() => densityGrid([{ xMm: Number.NaN, yMm: 0 }], 100)).toThrow(RangeError);
    expect(() => densityGrid([{ xMm: 0, yMm: Number.POSITIVE_INFINITY }], 100)).toThrow(RangeError);
  });
});

describe('heatDensityCells', () => {
  const cluster = [
    { xMm: 25, yMm: -25 },
    { xMm: 26, yMm: -24 },
    { xMm: 24, yMm: -26 },
  ];

  it('draws the hottest cell under the cluster, in the peak color', () => {
    const layer = heatDensityCells(cluster, 100, 10)!;
    const hottest = layer.cells.find((c) => c.color === heatColor(1))!;
    // Column 7, row 2 of a 10 mm grid from -50: its top-left corner.
    expect(hottest).toMatchObject({ xMm: 20, yMm: -30, opacity: 0.9 });
    expect(hottest.sizeMm).toBeCloseTo(10.5);
    expect(layer.blurMm).toBeCloseTo(8);
  });

  it('leaves ground nobody shot at clear', () => {
    const layer = heatDensityCells(cluster, 100, 10)!;
    expect(layer.cells.length).toBeLessThan(100);
    expect(layer.cells.some((c) => c.xMm === -50 && c.yMm === 40)).toBe(false);
    for (const cell of layer.cells) {
      expect(cell.opacity).toBeGreaterThanOrEqual(0.25);
      expect(cell.opacity).toBeLessThanOrEqual(0.9);
    }
  });

  it('returns null with no points', () => {
    expect(heatDensityCells([], 100)).toBeNull();
  });
});

it('shows a heat map from 20 shots', () => {
  expect(MIN_SHOTS_FOR_HEATMAP).toBe(20);
});
