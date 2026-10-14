import { countCellsLayout, MIN_CELL } from '@/features/forms/count-cells-layout';

describe('countCellsLayout', () => {
  it('puts every cell on one row when they fit at 48dp', () => {
    expect(countCellsLayout(400, 7, 2)).toEqual({ columns: 7, cellWidth: (400 - 12) / 7 });
  });

  it('wraps onto evened-out rows when they do not', () => {
    // 290dp holds five 48dp cells; seven become two rows of four and three.
    const layout = countCellsLayout(290, 7, 2);
    expect(layout.columns).toBe(4);
    expect(layout.cellWidth).toBeGreaterThanOrEqual(MIN_CELL);
  });

  it('never draws a cell under 48dp', () => {
    for (const width of [120, 200, 296, 328]) {
      expect(countCellsLayout(width, 7, 2).cellWidth).toBeGreaterThanOrEqual(MIN_CELL);
    }
  });

  it('falls back to one row before the width is known', () => {
    expect(countCellsLayout(0, 5, 2).columns).toBe(5);
  });
});
