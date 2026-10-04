import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SHOTS_PER_STATION } from './falt';
import {
  seriesVolume,
  sessionVolume,
  totalOnlyShotCount,
  toVolumeSeries,
  volumeOfSeries,
  type VolumeSeries,
} from './volume';

const rows = (shotCount: number): VolumeSeries => ({
  shotCount,
  totalOnly: false,
  overrideShotCount: null,
});
const totalOnly = (overrideShotCount: number | null): VolumeSeries => ({
  shotCount: 0,
  totalOnly: true,
  overrideShotCount,
});
const empty = { series: [], extraRounds: null, stationCount: 0, seriesLength: 5 };

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_010
 */
it('U1: a session counts shot rows, sighters, total-only series, extra rounds and six per station', () => {
  expect(
    sessionVolume({
      series: [rows(5), rows(5), rows(5), totalOnly(10), totalOnly(null)],
      extraRounds: 7,
      stationCount: 2,
      seriesLength: 5,
    }),
  ).toBe(49);
});

describe('seriesVolume (U2)', () => {
  it('counts a total-only series by its stored count, not its zero shot rows', () => {
    expect(seriesVolume(totalOnly(10), 5)).toBe(10);
  });

  it('counts a total-only series with no stored count as the series length', () => {
    expect(seriesVolume(totalOnly(null), 5)).toBe(5);
    expect(seriesVolume(totalOnly(null), 6)).toBe(6);
  });

  it('counts a stored count of 0 as 0, not the series length', () => {
    expect(seriesVolume(totalOnly(0), 5)).toBe(0);
  });

  it('counts an ordinary series by its shot rows, whatever the series length', () => {
    expect(seriesVolume(rows(7), 5)).toBe(7);
    expect(seriesVolume(rows(0), 5)).toBe(0);
  });

  it('never reads the series length for an ordinary series', () => {
    expect(seriesVolume(rows(3), 0)).toBe(3);
  });

  it('a session passes its series length to every total-only series', () => {
    expect(
      sessionVolume({ ...empty, series: [totalOnly(null), totalOnly(null)], seriesLength: 6 }),
    ).toBe(12);
  });
});

describe('totalOnlyShotCount (U2)', () => {
  it('is the stored count when there is one', () => {
    expect(totalOnlyShotCount(4, 5)).toBe(4);
  });

  it('is the series length when none was stored', () => {
    expect(totalOnlyShotCount(null, 6)).toBe(6);
  });

  it('rejects a series length that is not a positive integer', () => {
    expect(() => totalOnlyShotCount(null, 0)).toThrow(/seriesLength must be positive/);
    expect(() => totalOnlyShotCount(null, -1)).toThrow(/seriesLength/);
    expect(() => totalOnlyShotCount(null, 2.5)).toThrow(RangeError);
  });
});

describe('the scoring modules’ shape (U6)', () => {
  it('counts a series by its shot rows', () => {
    expect(volumeOfSeries({ shots: { length: 4 } })).toBe(4);
    expect(toVolumeSeries({ shots: { length: 4 } })).toEqual(rows(4));
  });

  it('counts an override by its shot count', () => {
    const series = { shots: { length: 0 }, totalOverride: { shotCount: 5 } };
    expect(volumeOfSeries(series)).toBe(5);
    expect(toVolumeSeries(series)).toEqual(totalOnly(5));
  });

  it('counts a volume-only series (ShotLog) by its resolved count', () => {
    const series = { shots: { length: 0 }, totalOverride: null, volumeOnlyShotCount: 6 };
    expect(volumeOfSeries(series)).toBe(6);
    expect(toVolumeSeries(series)).toEqual(totalOnly(6));
  });

  it('rejects an impossible count', () => {
    expect(() =>
      volumeOfSeries({ shots: { length: 0 }, totalOverride: { shotCount: -1 } }),
    ).toThrow(/overrideShotCount/);
    expect(() => volumeOfSeries({ shots: { length: 1.5 } })).toThrow(/shotCount/);
  });
});

describe('sessionVolume (U3)', () => {
  it('treats null extra rounds as none', () => {
    expect(sessionVolume({ ...empty, series: [rows(4)] })).toBe(4);
  });

  it('is 0 for an empty session', () => {
    expect(sessionVolume(empty)).toBe(0);
  });

  it('counts a fält session from its stations alone', () => {
    expect(sessionVolume({ ...empty, stationCount: 3 })).toBe(18);
  });
});

describe('rejects impossible counts (U4)', () => {
  const bad = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];

  it.each(bad)('shot rows %s', (value) => {
    expect(() => seriesVolume(rows(value), 5)).toThrow(RangeError);
  });

  it.each(bad)('override count %s', (value) => {
    expect(() => seriesVolume(totalOnly(value), 5)).toThrow(RangeError);
  });

  it.each([...bad, 0])('series length %s, when a total-only series needs it', (value) => {
    expect(() => seriesVolume(totalOnly(null), value)).toThrow(RangeError);
  });

  it.each(bad)('extra rounds %s', (value) => {
    expect(() => sessionVolume({ ...empty, extraRounds: value })).toThrow(RangeError);
  });

  it.each(bad)('station count %s', (value) => {
    expect(() => sessionVolume({ ...empty, stationCount: value })).toThrow(RangeError);
  });

  it('names the offending field', () => {
    expect(() => sessionVolume({ ...empty, stationCount: -2 })).toThrow(/stationCount/);
    expect(() => sessionVolume({ ...empty, extraRounds: -2 })).toThrow(/extraRounds/);
    expect(() => seriesVolume(rows(-2), 5)).toThrow(/shotCount/);
    expect(() => seriesVolume(totalOnly(-2), 5)).toThrow(/overrideShotCount/);
    expect(() => seriesVolume(totalOnly(null), -2)).toThrow(/seriesLength/);
  });
});

describe('sessionVolume properties (U5)', () => {
  const count = fc.nat({ max: 500 });
  const arbSeries: fc.Arbitrary<VolumeSeries> = fc.oneof(
    count.map(rows),
    fc.option(count, { nil: null }).map(totalOnly),
  );
  const arbSession = fc.record({
    series: fc.array(arbSeries, { maxLength: 12 }),
    extraRounds: fc.option(count, { nil: null }),
    stationCount: fc.nat({ max: 40 }),
    seriesLength: fc.integer({ min: 1, max: 10 }),
  });

  it('is the sum of its parts', () => {
    fc.assert(
      fc.property(arbSession, (session) => {
        const parts =
          session.series.reduce(
            (sum, series) => sum + seriesVolume(series, session.seriesLength),
            0,
          ) +
          (session.extraRounds ?? 0) +
          session.stationCount * SHOTS_PER_STATION;
        expect(sessionVolume(session)).toBe(parts);
      }),
    );
  });

  it('rises by exactly what is added', () => {
    fc.assert(
      fc.property(arbSession, arbSeries, (session, added) => {
        const base = sessionVolume(session);
        expect(sessionVolume({ ...session, series: [...session.series, added] })).toBe(
          base + seriesVolume(added, session.seriesLength),
        );
        expect(sessionVolume({ ...session, extraRounds: (session.extraRounds ?? 0) + 1 })).toBe(
          base + 1,
        );
        expect(sessionVolume({ ...session, stationCount: session.stationCount + 1 })).toBe(
          base + SHOTS_PER_STATION,
        );
      }),
    );
  });

  it('a total-only series with no stored count adds exactly the series length', () => {
    fc.assert(
      fc.property(arbSession, (session) => {
        expect(sessionVolume({ ...session, series: [...session.series, totalOnly(null)] })).toBe(
          sessionVolume(session) + session.seriesLength,
        );
      }),
    );
  });
});
