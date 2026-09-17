import { describe, expect, it } from 'vitest';

import { buildHeatmap, MIN_SHOTS_FOR_HEATMAP } from './heatmap';

const p = (xMm: number, yMm: number) => ({ xMm, yMm });

describe('buildHeatmap', () => {
  it('is null for no shots, so the caller hides the view', () => {
    expect(buildHeatmap([], 100)).toBeNull();
  });

  it('puts a centre shot in the middle cell', () => {
    const map = buildHeatmap([p(0, 0)], 100, 10)!;
    expect(map.cells).toHaveLength(1);
    expect(map.cells[0]).toMatchObject({ column: 5, row: 5, count: 1, intensity: 1 });
  });

  it('bins y downward, matching the rest of the scoring convention', () => {
    // A shot below centre must land in a LOWER row (larger index), not upper.
    const map = buildHeatmap([p(0, 40)], 100, 10)!;
    expect(map.cells[0]!.row).toBeGreaterThan(5);
    expect(buildHeatmap([p(0, -40)], 100, 10)!.cells[0]!.row).toBeLessThan(5);
  });

  it('reports a cell centre that round-trips back to its own cell', () => {
    const map = buildHeatmap([p(23, -11)], 100, 10)!;
    const cell = map.cells[0]!;
    const again = buildHeatmap([p(cell.xMm, cell.yMm)], 100, 10)!;
    expect(again.cells[0]).toMatchObject({ column: cell.column, row: cell.row });
  });

  it('counts repeated shots in one cell and scales intensity against the peak', () => {
    const map = buildHeatmap([p(0, 0), p(1, 1), p(2, 2), p(40, 40)], 100, 10)!;
    expect(map.peakCount).toBe(3);
    expect(map.cells[0]).toMatchObject({ count: 3, intensity: 1 });
    expect(map.cells[1]).toMatchObject({ count: 1, intensity: 1 / 3 });
  });

  it('clamps a flier into the edge cell rather than losing it', () => {
    // Silently dropping it would make the heatmap disagree with the total.
    const map = buildHeatmap([p(5000, -5000)], 100, 10)!;
    expect(map.shotCount).toBe(1);
    expect(map.cells[0]).toMatchObject({ column: 9, row: 0 });
  });

  it('keeps every shot, however they fall', () => {
    const points = [p(0, 0), p(0, 0), p(-200, 30), p(10, -10)];
    const map = buildHeatmap(points, 100, 8)!;
    expect(map.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(points.length);
  });

  it('omits empty cells rather than returning a dense grid', () => {
    expect(buildHeatmap([p(0, 0)], 100, 20)!.cells).toHaveLength(1);
  });

  it('orders hottest first, and breaks ties stably', () => {
    const map = buildHeatmap([p(-40, -40), p(40, 40), p(0, 0), p(0, 1)], 100, 10)!;
    expect(map.cells[0]!.count).toBe(2);
    const ties = map.cells.slice(1);
    expect(ties.map((c) => [c.row, c.column])).toEqual(
      [...ties].sort((a, b) => a.row - b.row || a.column - b.column).map((c) => [c.row, c.column]),
    );
  });

  it('breaks a same-row tie by column, not by the order shots arrived', () => {
    // Two equally hot cells on the same row: the row tiebreak cannot separate
    // them, so column has to. Feeding the right-hand cell first means a
    // comparator that stopped at `row` would leave it first.
    const map = buildHeatmap([p(45, 0), p(-45, 0)], 100, 10)!;
    expect(map.cells.map((c) => [c.row, c.column])).toEqual([
      [5, 0],
      [5, 9],
    ]);
  });

  it('rejects a nonsensical grid rather than guessing', () => {
    expect(() => buildHeatmap([p(0, 0)], 0)).toThrow(RangeError);
    expect(() => buildHeatmap([p(0, 0)], -1)).toThrow(RangeError);
    expect(() => buildHeatmap([p(0, 0)], 100, 0)).toThrow(RangeError);
    expect(() => buildHeatmap([p(0, 0)], 100, 2.5)).toThrow(RangeError);
  });

  it('rejects a non-finite coordinate', () => {
    expect(() => buildHeatmap([p(Number.NaN, 0)], 100)).toThrow(RangeError);
    expect(() => buildHeatmap([p(0, Number.POSITIVE_INFINITY)], 100)).toThrow(RangeError);
  });

  it('has a threshold low enough for one precision series but not a handful', () => {
    expect(MIN_SHOTS_FOR_HEATMAP).toBeGreaterThan(10);
    expect(MIN_SHOTS_FOR_HEATMAP).toBeLessThanOrEqual(30);
  });
});
