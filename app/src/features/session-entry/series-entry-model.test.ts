import type { SeriesRow } from '@/features/session/use-session-detail';

import { liveSessionTotals, nextSeriesTarget, seriesCountOf } from './series-entry-model';

function row(position: number, values: number[], extra: Partial<SeriesRow> = {}): SeriesRow {
  const shots = values.map((valueTenths) => ({ valueTenths, isInnerTen: valueTenths === 100 }));
  return {
    id: `s${position}`,
    position,
    isSighter: false,
    isFinal: false,
    isShootOff: false,
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
      isShootOff: false,
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
      isShootOff: false,
      shots: [{ valueTenths: 100, isInnerTen: true }],
    };
    expect(liveSessionTotals(rows, current)).toEqual({ totalTenths: 490, innerTens: 4 });
  });

  it('leaves a shoot-off out of the total and the inner tens (#727 PR C, S1)', () => {
    const shootOff = row(5, [100, 100], { isShootOff: true });
    const current = {
      rowId: null,
      position: 6,
      isFinal: false,
      isSighter: false,
      isShootOff: false,
      shots: [],
    };
    expect(liveSessionTotals([...rows, shootOff], current)).toEqual({
      totalTenths: 390,
      innerTens: 3,
    });
    const keyed = { ...current, rowId: 's5', position: 5, isShootOff: true, shots: shootOff.shots };
    expect(liveSessionTotals([...rows, shootOff], keyed)).toEqual({
      totalTenths: 390,
      innerTens: 3,
    });
  });

  it('counts a total-only series by its stored total', () => {
    const override = row(5, [], { isTotalOverride: true, totalTenths: 450 });
    const current = {
      rowId: null,
      position: 6,
      isFinal: false,
      isSighter: false,
      isShootOff: false,
      shots: [],
    };
    expect(liveSessionTotals([override], current).totalTenths).toBe(450);
  });
});

describe('nextSeriesTarget', () => {
  it('appends a new series to a free format, after the last one', () => {
    expect(
      nextSeriesTarget(
        [row(1, []), row(2, [])],
        { position: 3, isFinal: false, isShootOff: false },
        false,
      ),
    ).toEqual({ position: 3 + 0 + 1, isFinal: false, isNew: true });
  });

  it('opens the next saved series of the same section first', () => {
    const rows = [row(1, []), row(2, []), row(4, [])];
    expect(
      nextSeriesTarget(rows, { position: 2, isFinal: false, isShootOff: false }, false),
    ).toEqual({
      position: 4,
      isFinal: false,
      isNew: false,
    });
  });

  it('stops at the last series of a fixed format', () => {
    const rows = [row(1, []), row(2, [])];
    expect(
      nextSeriesTarget(rows, { position: 1, isFinal: false, isShootOff: false }, true)?.position,
    ).toBe(2);
    expect(
      nextSeriesTarget(rows, { position: 2, isFinal: false, isShootOff: false }, true),
    ).toBeNull();
  });

  it('ends the main round once a final has begun, and keeps adding to the final', () => {
    const rows = [row(1, []), row(2, [], { isFinal: true })];
    expect(
      nextSeriesTarget(rows, { position: 1, isFinal: false, isShootOff: false }, false),
    ).toBeNull();
    expect(
      nextSeriesTarget(rows, { position: 2, isFinal: true, isShootOff: false }, false),
    ).toEqual({
      position: 3,
      isFinal: true,
      isNew: true,
    });
  });
});

describe('nextSeriesTarget with a shoot-off (#727 PR C, S5)', () => {
  const shootOff = { isShootOff: true };

  it('never makes a shoot-off the next series of the main round', () => {
    const rows = [row(1, []), row(2, [], shootOff)];
    expect(
      nextSeriesTarget(rows, { position: 1, isFinal: false, isShootOff: false }, true),
    ).toBeNull();
    expect(
      nextSeriesTarget(rows, { position: 1, isFinal: false, isShootOff: false }, false),
    ).toEqual({ position: 3, isFinal: false, isNew: true });
  });

  it('steps through the shoot-off and never adds to it', () => {
    const rows = [row(1, []), row(2, [], shootOff), row(3, [], shootOff)];
    expect(
      nextSeriesTarget(rows, { position: 2, isFinal: false, isShootOff: true }, false),
    ).toEqual({ position: 3, isFinal: false, isNew: false });
    expect(
      nextSeriesTarget(rows, { position: 3, isFinal: false, isShootOff: true }, false),
    ).toBeNull();
  });

  it('a shoot-off flagged final is not part of the final', () => {
    const rows = [row(1, []), row(2, [], { isFinal: true, isShootOff: true })];
    expect(
      nextSeriesTarget(rows, { position: 1, isFinal: false, isShootOff: false }, false),
    ).toEqual({ position: 3, isFinal: false, isNew: true });
  });
});

describe('seriesCountOf', () => {
  const main = { isFinal: false, isShootOff: false };

  it('knows the count of a fixed format only', () => {
    const rows = [row(1, []), row(2, []), row(3, [], { isFinal: true })];
    expect(seriesCountOf(rows, main, true)).toBe(2);
    expect(seriesCountOf(rows, main, false)).toBeNull();
  });

  it('counts the shoot-off as its own section', () => {
    const rows = [row(1, []), row(2, []), row(3, [], { isShootOff: true })];
    expect(seriesCountOf(rows, main, true)).toBe(2);
    expect(seriesCountOf(rows, { isFinal: false, isShootOff: true }, true)).toBe(1);
  });
});
