import { describe, expect, it } from 'vitest';
import type { CompetitionResultForStats } from './pb';
import {
  twoPointTrend,
  yearOverYearChange,
  yearOverYearGroupKey,
  yearStats,
  yearsWithData,
  type YearStat,
} from './yearOverYear';

function result(overrides: Partial<CompetitionResultForStats> = {}): CompetitionResultForStats {
  return {
    sessionId: 's',
    competitionType: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    date: '2026-06-13',
    beforeFinalTenths: 3000,
    beforeFinalSeriesCount: 6,
    totalTenths: 3000,
    totalSeriesCount: 6,
    figureHits: 0,
    innerTens: 2,
    ...overrides,
  };
}

describe('yearOverYearGroupKey', () => {
  it('groups by competitionType and weaponGroup only (coarser than PB grouping)', () => {
    expect(yearOverYearGroupKey(result({ shooterClass: '2' }))).toBe(
      yearOverYearGroupKey(result({ shooterClass: '3' })),
    );
  });

  it('differs across weaponGroup', () => {
    expect(yearOverYearGroupKey(result({ weaponGroup: 'spsf:C' }))).not.toBe(
      yearOverYearGroupKey(result({ weaponGroup: 'spsf:A' })),
    );
  });
});

describe('yearStats', () => {
  it('computes count/mean/median/min/max/meanInnerTens for one year', () => {
    const stats = yearStats([
      result({ date: '2026-01-01', totalTenths: 300, innerTens: 1 }),
      result({ date: '2026-06-01', totalTenths: 320, innerTens: 3 }),
      result({ date: '2026-09-01', totalTenths: 340, innerTens: 5 }),
    ]);
    const year2026 = stats.get('spsf-precision:spsf:C')?.get(2026);
    expect(year2026).toEqual({
      year: 2026,
      count: 3,
      meanTenths: 320,
      medianTenths: 320,
      sampleStdevTenths: 20,
      minTenths: 300,
      maxTenths: 340,
      meanInnerTens: 3,
    });
  });

  it('sampleStdevTenths is null for a single-result year', () => {
    const stats = yearStats([result({ date: '2026-01-01', totalTenths: 300 })]);
    expect(stats.get('spsf-precision:spsf:C')?.get(2026)?.sampleStdevTenths).toBeNull();
  });

  it('median averages the two middle values for an even count', () => {
    const stats = yearStats([
      result({ date: '2026-01-01', totalTenths: 100 }),
      result({ date: '2026-02-01', totalTenths: 200 }),
      result({ date: '2026-03-01', totalTenths: 300 }),
      result({ date: '2026-04-01', totalTenths: 400 }),
    ]);
    expect(stats.get('spsf-precision:spsf:C')?.get(2026)?.medianTenths).toBe(250);
  });

  it('splits results into separate years within the same group', () => {
    const stats = yearStats([
      result({ date: '2025-06-01', totalTenths: 300 }),
      result({ date: '2026-06-01', totalTenths: 320 }),
    ]);
    const group = stats.get('spsf-precision:spsf:C')!;
    expect(group.get(2025)?.count).toBe(1);
    expect(group.get(2026)?.count).toBe(1);
  });
});

describe('yearsWithData', () => {
  it('returns the sorted list of years present in a group', () => {
    const stats = yearStats([
      result({ date: '2026-01-01' }),
      result({ date: '2024-01-01' }),
      result({ date: '2025-01-01' }),
    ]);
    expect(yearsWithData(stats.get('spsf-precision:spsf:C')!)).toEqual([2024, 2025, 2026]);
  });
});

function yearStat(overrides: Partial<YearStat> = {}): YearStat {
  return {
    year: 2026,
    count: 1,
    meanTenths: 300,
    medianTenths: 300,
    sampleStdevTenths: null,
    minTenths: 300,
    maxTenths: 300,
    meanInnerTens: 1,
    ...overrides,
  };
}

describe('yearOverYearChange', () => {
  it('is null when there is no preceding year with data', () => {
    expect(yearOverYearChange(yearStat(), null)).toBeNull();
  });

  it('computes absolute and percentage change against the preceding year', () => {
    const current = yearStat({ year: 2026, meanTenths: 330 });
    const previous = yearStat({ year: 2024, meanTenths: 300 });
    expect(yearOverYearChange(current, previous)).toEqual({ absoluteTenths: 30, percentage: 10 });
  });

  it('handles a zero previous mean without dividing by zero', () => {
    const current = yearStat({ meanTenths: 30 });
    const previous = yearStat({ meanTenths: 0 });
    expect(yearOverYearChange(current, previous)).toEqual({ absoluteTenths: 30, percentage: 0 });
  });
});

describe('twoPointTrend', () => {
  it('is null for fewer than 2 years', () => {
    expect(twoPointTrend([yearStat()])).toBeNull();
    expect(twoPointTrend([])).toBeNull();
  });

  it('computes (last mean - first mean) / (last year - first year)', () => {
    const trend = twoPointTrend([
      yearStat({ year: 2020, meanTenths: 300 }),
      yearStat({ year: 2026, meanTenths: 330 }),
    ]);
    expect(trend).toEqual({ slopePerYear: 5 });
  });

  it('ignores intermediate points (literal two-point slope, not a regression)', () => {
    const trend = twoPointTrend([
      yearStat({ year: 2020, meanTenths: 300 }),
      yearStat({ year: 2023, meanTenths: 999 }),
      yearStat({ year: 2026, meanTenths: 330 }),
    ]);
    expect(trend).toEqual({ slopePerYear: 5 });
  });

  it('is null when first and last share the same year', () => {
    expect(twoPointTrend([yearStat({ year: 2026 }), yearStat({ year: 2026 })])).toBeNull();
  });
});
