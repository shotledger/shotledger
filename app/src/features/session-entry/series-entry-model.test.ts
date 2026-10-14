import type { SeriesRow } from '@/features/session/use-session-detail';

import { liveSessionTotals, nextSeriesTarget, seriesCountOf } from './series-entry-model';

function row(position: number, values: number[], extra: Partial<SeriesRow> = {}): SeriesRow {
  const shots = values.map((valueTenths) => ({ valueTenths, isInnerTen: valueTenths === 100 }));
  return {
    id: `s${position}`,
    position,
    isSighter: false,
    isFinal: false,
    photoUri: null,
    shots,
    totalTenths: values.reduce((a, b) => a + b, 0),
    guldThreshold: null,
    isGoldSeries: false,
    timeLimitSeconds: null,
    stage: null,
    isTotalOverride: false,
    totalOverrideShotCount: null,
    ...extra,
  };
}

describe('liveSessionTotals', () => {
  const rows = [row(1, [80, 80], { isSighter: true }), row(2, [100, 90]), row(3, [100, 100])];

  it('counts the keypad in place of the stored copy of the same series', () => {
    const current = {
      rowId: 's3',
      position: 3,
      isFinal: false,
      isSighter: false,
      shots: [{ valueTenths: 50, isInnerTen: false }],
    };
    expect(liveSessionTotals(rows, current)).toEqual({ totalTenths: 240, innerTens: 1 });
  });

  it('adds a new series and leaves sighters out', () => {
    const current = {
      rowId: null,
      position: 4,
      isFinal: false,
      isSighter: false,
      shots: [{ valueTenths: 100, isInnerTen: true }],
    };
    expect(liveSessionTotals(rows, current)).toEqual({ totalTenths: 490, innerTens: 4 });
  });

  it('counts a total-only series by its stored total', () => {
    const override = row(5, [], { isTotalOverride: true, totalTenths: 450 });
    const current = { rowId: null, position: 6, isFinal: false, isSighter: false, shots: [] };
    expect(liveSessionTotals([override], current).totalTenths).toBe(450);
  });
});

describe('nextSeriesTarget', () => {
  it('appends a new series to a free format, after the last one', () => {
    expect(
      nextSeriesTarget([row(1, []), row(2, [])], { position: 3, isFinal: false }, false),
    ).toEqual({ position: 3 + 0 + 1, isFinal: false, isNew: true });
  });

  it('opens the next saved series of the same section first', () => {
    const rows = [row(1, []), row(2, []), row(4, [])];
    expect(nextSeriesTarget(rows, { position: 2, isFinal: false }, false)).toEqual({
      position: 4,
      isFinal: false,
      isNew: false,
    });
  });

  it('stops at the last series of a fixed format', () => {
    const rows = [row(1, []), row(2, [])];
    expect(nextSeriesTarget(rows, { position: 1, isFinal: false }, true)?.position).toBe(2);
    expect(nextSeriesTarget(rows, { position: 2, isFinal: false }, true)).toBeNull();
  });

  it('ends the main round once a final has begun, and keeps adding to the final', () => {
    const rows = [row(1, []), row(2, [], { isFinal: true })];
    expect(nextSeriesTarget(rows, { position: 1, isFinal: false }, false)).toBeNull();
    expect(nextSeriesTarget(rows, { position: 2, isFinal: true }, false)).toEqual({
      position: 3,
      isFinal: true,
      isNew: true,
    });
  });
});

describe('seriesCountOf', () => {
  it('knows the count of a fixed format only', () => {
    const rows = [row(1, []), row(2, []), row(3, [], { isFinal: true })];
    expect(seriesCountOf(rows, false, true)).toBe(2);
    expect(seriesCountOf(rows, false, false)).toBeNull();
  });
});
