import { describe, expect, it } from 'vitest';

import type { StatsSeries } from '../scoring/stats';
import { monthsOfLoggedActivity, pistolskyttemarkeGuldFulfillment } from './indicators';

const NOW = new Date('2026-09-01T00:00:00Z');

function guldSeries(overrides: Partial<StatsSeries> = {}): StatsSeries {
  return {
    id: 's1',
    sessionId: 'sess1',
    startedAt: '2026-01-01T00:00:00Z',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: null,
    firearmId: null,
    ammoLotId: null,
    isSighter: false,
    isFinal: false,
    // 5 shots of value_tenths 100 (i.e. a perfect "10" each) -> 50 points, clears guld C (46).
    shots: Array.from({ length: 5 }, () => ({ valueTenths: 100, isInnerTen: false })),
    ...overrides,
  };
}

describe('monthsOfLoggedActivity', () => {
  it('I1: no sessions', () => {
    expect(monthsOfLoggedActivity([], NOW)).toEqual({ months: 0, firstSessionIso: null });
  });

  it('I2: 6mo 3d ago -> 6', () => {
    const result = monthsOfLoggedActivity([{ startedAt: '2026-03-01T00:00:00Z' }], NOW);
    expect(result.months).toBe(6);
  });

  it('I3: 5mo 29d ago -> 5', () => {
    const result = monthsOfLoggedActivity([{ startedAt: '2026-03-03T00:00:00Z' }], NOW);
    expect(result.months).toBe(5);
  });

  it('I4: earliest of several sessions used', () => {
    const result = monthsOfLoggedActivity(
      [
        { startedAt: '2026-08-01T00:00:00Z' },
        { startedAt: '2026-01-01T00:00:00Z' },
        { startedAt: '2026-05-01T00:00:00Z' }, // not earlier than the running min -> false branch
      ],
      NOW,
    );
    expect(result.firstSessionIso).toBe('2026-01-01T00:00:00Z');
  });
});

describe('pistolskyttemarkeGuldFulfillment', () => {
  it('I5: one guldserie 10 months ago -> fulfilled', () => {
    const result = pistolskyttemarkeGuldFulfillment({
      seriesList: [guldSeries({ startedAt: '2025-11-01T00:00:00Z' })],
      now: NOW,
    });
    expect(result.fulfilled).toBe(true);
    expect(result.goldSeriesCountLast24Months).toBe(1);
    expect(result.ruleVerified).toBe(false);
  });

  it('a series exactly at the window start is included (inclusive lower bound)', () => {
    const result = pistolskyttemarkeGuldFulfillment({
      seriesList: [guldSeries({ startedAt: '2024-09-01T00:00:00.000Z' })], // NOW - 24mo exactly
      now: NOW,
    });
    expect(result.goldSeriesCountLast24Months).toBe(1);
  });

  it('a series exactly at `now` is included (inclusive upper bound)', () => {
    const result = pistolskyttemarkeGuldFulfillment({
      seriesList: [guldSeries({ startedAt: NOW.toISOString() })],
      now: NOW,
    });
    expect(result.goldSeriesCountLast24Months).toBe(1);
  });

  it('a series after `now` (future) is excluded', () => {
    const result = pistolskyttemarkeGuldFulfillment({
      seriesList: [guldSeries({ startedAt: '2026-09-15T00:00:00Z' })],
      now: NOW,
    });
    expect(result.goldSeriesCountLast24Months).toBe(0);
  });

  it('I6: guldserie 25 months ago -> not fulfilled', () => {
    const result = pistolskyttemarkeGuldFulfillment({
      seriesList: [guldSeries({ startedAt: '2024-08-01T00:00:00Z' })],
      now: NOW,
    });
    expect(result.fulfilled).toBe(false);
    expect(result.goldSeriesCountLast24Months).toBe(0);
  });

  it('defaults `now` to the current date when omitted', () => {
    const result = pistolskyttemarkeGuldFulfillment({ seriesList: [] });
    expect(result.goldSeriesCountLast24Months).toBe(0);
  });

  it('I7: no series at all', () => {
    const result = pistolskyttemarkeGuldFulfillment({ seriesList: [], now: NOW });
    expect(result.fulfilled).toBe(false);
    expect(result.goldSeriesCountLast24Months).toBe(0);
  });

  it('I8: series below guld threshold not counted', () => {
    const below = guldSeries({
      startedAt: '2026-01-01T00:00:00Z',
      shots: Array.from({ length: 5 }, () => ({ valueTenths: 50, isInnerTen: false })), // 25 pts
    });
    const result = pistolskyttemarkeGuldFulfillment({ seriesList: [below], now: NOW });
    expect(result.fulfilled).toBe(false);
  });

  it('I9: respects age-reduced threshold via marke.ts (delegated, not reimplemented)', () => {
    // Age 66+ gets -2/series -> guld C threshold 44. A 44-point series only
    // clears the age-reduced threshold, not the base 46.
    const justUnderBase = guldSeries({
      startedAt: '2026-01-01T00:00:00Z',
      shots: [
        { valueTenths: 90, isInnerTen: false },
        { valueTenths: 90, isInnerTen: false },
        { valueTenths: 90, isInnerTen: false },
        { valueTenths: 90, isInnerTen: false },
        { valueTenths: 80, isInnerTen: false }, // total 440 tenths = 44 points
      ],
    });
    const withoutAge = pistolskyttemarkeGuldFulfillment({
      seriesList: [justUnderBase],
      now: NOW,
    });
    expect(withoutAge.fulfilled).toBe(false);

    const withAge = pistolskyttemarkeGuldFulfillment({
      seriesList: [justUnderBase],
      birthYear: 1958, // turns 68 in 2026 -> -2 reduction
      now: NOW,
    });
    expect(withAge.fulfilled).toBe(true);
  });
});
