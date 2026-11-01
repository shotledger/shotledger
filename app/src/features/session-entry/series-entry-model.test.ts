import type { SeriesRow } from '@/features/session/use-session-detail';

import { liveSessionTotals, nextSeriesTarget, seriesHeading } from './series-entry-model';

function row(position: number, values: number[], extra: Partial<SeriesRow> = {}): SeriesRow {
  const shots = values.map((valueTenths) => ({ valueTenths, isInnerTen: valueTenths === 100 }));
  return {
    id: `s${position}`,
    position,
    number: position,
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

describe('seriesHeading (#922)', () => {
  const current = (position: number, isSighter = false, isFinal = false) => ({
    rowId: `s${position}`,
    position,
    isFinal,
    isSighter,
  });

  it("counts the section's non-sighter series of a fixed format only", () => {
    const rows = [
      row(1, [], { isSighter: true }),
      row(2, []),
      row(3, []),
      row(4, [], { isFinal: true }),
    ];
    expect(seriesHeading(rows, current(3), 'spsf-milsnabb', true)).toEqual({ number: 2, count: 2 });
    expect(seriesHeading(rows, current(3), null, false)).toEqual({ number: 2, count: null });
  });

  it("reads the keypad's sighter toggle, not the saved flag", () => {
    const rows = [row(1, [], { isSighter: true }), row(2, []), row(3, [])];
    expect(seriesHeading(rows, current(1, false), 'spsf-milsnabb', true)).toEqual({
      number: 1,
      count: 3,
    });
    expect(seriesHeading(rows, current(2, true), 'spsf-milsnabb', true)).toEqual({
      number: null,
      count: 1,
    });
  });
});
