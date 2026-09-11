import { canMoveSeries, seriesSwapTarget, type MovableSeries } from './series-move';

const main = (id: string, position: number): MovableSeries => ({ id, position, isFinal: false });
const final = (id: string, position: number): MovableSeries => ({ id, position, isFinal: true });

describe('seriesSwapTarget', () => {
  const rows = [main('a', 1), main('b', 2), main('c', 3)];

  it('swaps with the neighbour above or below', () => {
    expect(seriesSwapTarget(rows, 'b', 'up')?.id).toBe('a');
    expect(seriesSwapTarget(rows, 'b', 'down')?.id).toBe('c');
  });

  it('is a no-op at each end of the section', () => {
    expect(seriesSwapTarget(rows, 'a', 'up')).toBeNull();
    expect(seriesSwapTarget(rows, 'c', 'down')).toBeNull();
  });

  it('never crosses the main/final boundary', () => {
    // A main series moved into the final would change what it counts towards.
    const mixed = [main('a', 1), main('b', 2), final('f', 3), final('g', 4)];
    expect(seriesSwapTarget(mixed, 'b', 'down')).toBeNull();
    expect(seriesSwapTarget(mixed, 'f', 'up')).toBeNull();
    expect(seriesSwapTarget(mixed, 'f', 'down')?.id).toBe('g');
  });

  it('uses position order, not array order', () => {
    // listSeriesForSession orders by position, but nothing guarantees a
    // caller does — the rule must not depend on it.
    const shuffled = [main('c', 3), main('a', 1), main('b', 2)];
    expect(seriesSwapTarget(shuffled, 'b', 'up')?.id).toBe('a');
    expect(seriesSwapTarget(shuffled, 'c', 'up')?.id).toBe('b');
  });

  it('works across the gaps deletion leaves behind', () => {
    // Deleting a series deliberately leaves a hole in `position`.
    const gapped = [main('a', 1), main('b', 4), main('c', 9)];
    expect(seriesSwapTarget(gapped, 'c', 'up')?.id).toBe('b');
  });

  it('returns null for an unknown id', () => {
    expect(seriesSwapTarget(rows, 'nope', 'up')).toBeNull();
  });
});

describe('canMoveSeries', () => {
  it('is false exactly where the press would do nothing', () => {
    const rows = [main('a', 1), main('b', 2)];
    expect(canMoveSeries(rows, 'a', 'up')).toBe(false);
    expect(canMoveSeries(rows, 'a', 'down')).toBe(true);
    expect(canMoveSeries(rows, 'b', 'up')).toBe(true);
    expect(canMoveSeries(rows, 'b', 'down')).toBe(false);
  });

  it('a lone series cannot move at all', () => {
    expect(canMoveSeries([main('a', 1)], 'a', 'up')).toBe(false);
    expect(canMoveSeries([main('a', 1)], 'a', 'down')).toBe(false);
  });
});
