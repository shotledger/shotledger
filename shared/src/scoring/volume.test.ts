import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SHOTS_PER_STATION } from './falt';
import { seriesVolume, sessionVolume, type VolumeSeries } from './volume';

const rows = (shotCount: number): VolumeSeries => ({ shotCount, overrideShotCount: null });
const totalOnly = (overrideShotCount: number | null): VolumeSeries => ({
  shotCount: 0,
  overrideShotCount,
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_010
 */
it('U1: a session counts shot rows, sighters, total-only series, extra rounds and six per station', () => {
  expect(
    sessionVolume({
      series: [rows(5), rows(5), rows(5), totalOnly(10)],
      extraRounds: 7,
      stationCount: 2,
    }),
  ).toBe(44);
});

describe('seriesVolume (U2)', () => {
  it('counts a total-only series by its stored count, not its zero shot rows', () => {
    expect(seriesVolume(totalOnly(10))).toBe(10);
  });

  it('counts a total-only series with no stored count as 0', () => {
    expect(seriesVolume(totalOnly(null))).toBe(0);
  });

  it('counts an ordinary series by its shot rows', () => {
    expect(seriesVolume(rows(7))).toBe(7);
  });
});

describe('sessionVolume (U3)', () => {
  it('treats null extra rounds as none', () => {
    expect(sessionVolume({ series: [rows(4)], extraRounds: null, stationCount: 0 })).toBe(4);
  });

  it('is 0 for an empty session', () => {
    expect(sessionVolume({ series: [], extraRounds: null, stationCount: 0 })).toBe(0);
  });

  it('counts a fält session from its stations alone', () => {
    expect(sessionVolume({ series: [], extraRounds: null, stationCount: 3 })).toBe(18);
  });
});

describe('rejects impossible counts (U4)', () => {
  const bad = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];

  it.each(bad)('shot rows %s', (value) => {
    expect(() => seriesVolume(rows(value))).toThrow(RangeError);
  });

  it.each(bad)('override count %s', (value) => {
    expect(() => seriesVolume(totalOnly(value))).toThrow(RangeError);
  });

  it.each(bad)('extra rounds %s', (value) => {
    expect(() => sessionVolume({ series: [], extraRounds: value, stationCount: 0 })).toThrow(
      RangeError,
    );
  });

  it.each(bad)('station count %s', (value) => {
    expect(() => sessionVolume({ series: [], extraRounds: 0, stationCount: value })).toThrow(
      RangeError,
    );
  });

  it('names the offending field', () => {
    expect(() => sessionVolume({ series: [], extraRounds: 0, stationCount: -2 })).toThrow(
      /stationCount/,
    );
    expect(() => sessionVolume({ series: [], extraRounds: -2, stationCount: 0 })).toThrow(
      /extraRounds/,
    );
    expect(() => seriesVolume(rows(-2))).toThrow(/shotCount/);
    expect(() => seriesVolume(totalOnly(-2))).toThrow(/overrideShotCount/);
  });
});

describe('sessionVolume properties (U5)', () => {
  const count = fc.nat({ max: 500 });
  const arbSeries: fc.Arbitrary<VolumeSeries> = fc.record({
    shotCount: count,
    overrideShotCount: fc.option(count, { nil: null }),
  });
  const arbSession = fc.record({
    series: fc.array(arbSeries, { maxLength: 12 }),
    extraRounds: fc.option(count, { nil: null }),
    stationCount: fc.nat({ max: 40 }),
  });

  it('is the sum of its parts', () => {
    fc.assert(
      fc.property(arbSession, (session) => {
        const parts =
          session.series.reduce((sum, series) => sum + seriesVolume(series), 0) +
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
          base + seriesVolume(added),
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
});
