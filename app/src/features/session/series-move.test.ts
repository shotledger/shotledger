import { canMoveSeries, seriesDropPlan, seriesSwapTarget, type MovableSeries } from './series-move';

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

describe('seriesDropPlan', () => {
  const rows: MovableSeries[] = [
    { id: 'a', position: 1, isFinal: false },
    { id: 'b', position: 2, isFinal: false },
    { id: 'c', position: 3, isFinal: false },
    { id: 'd', position: 4, isFinal: true },
    { id: 'e', position: 5, isFinal: true },
  ];

  it('moves a series down and shuffles the rest up', () => {
    // a b c  ->  b c a
    expect(seriesDropPlan(rows, 'a', 2)).toEqual([
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
      { id: 'a', position: 3 },
    ]);
  });

  it('moves a series up', () => {
    // a b c  ->  c a b
    expect(seriesDropPlan(rows, 'c', 0)).toEqual([
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
      { id: 'b', position: 3 },
    ]);
  });

  it('writes nothing when the drop lands where it started', () => {
    expect(seriesDropPlan(rows, 'b', 1)).toEqual([]);
  });

  it('keeps the drop inside its own section', () => {
    // 'e' is the second final; index 5 is past the end of a 2-row section.
    const plan = seriesDropPlan(rows, 'e', 5);
    expect(plan.every((p) => ['d', 'e'].includes(p.id))).toBe(true);
    // Clamped to the last slot, which is where it already is.
    expect(plan).toEqual([]);
  });

  it('reorders within the final section without touching the main one', () => {
    expect(seriesDropPlan(rows, 'e', 0)).toEqual([
      { id: 'e', position: 4 },
      { id: 'd', position: 5 },
    ]);
  });

  it('clamps an overshoot rather than refusing the drop', () => {
    expect(seriesDropPlan(rows, 'a', 99)).toEqual(seriesDropPlan(rows, 'a', 2));
    expect(seriesDropPlan(rows, 'c', -5)).toEqual(seriesDropPlan(rows, 'c', 0));
  });

  it('is empty for an unknown id', () => {
    expect(seriesDropPlan(rows, 'nope', 0)).toEqual([]);
  });

  it('never invents or drops a position', () => {
    const plan = seriesDropPlan(rows, 'a', 2);
    const positions = plan.map((p) => p.position).sort();
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions.every((p) => [1, 2, 3].includes(p))).toBe(true);
  });
});
