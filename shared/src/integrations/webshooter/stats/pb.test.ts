import { describe, expect, it } from 'vitest';
import {
  bestNSeries,
  bestSession,
  isOfficialPbEligible,
  officialPbGroupKey,
  officialPbScore,
  personalBests,
  type CompetitionResultForStats,
  type FreeformSessionForPb,
} from './pb';

function precisionResult(
  overrides: Partial<CompetitionResultForStats> = {},
): CompetitionResultForStats {
  return {
    sessionId: 's1',
    competitionType: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    date: '2026-06-13',
    beforeFinalTenths: 3230,
    beforeFinalSeriesCount: 7,
    totalTenths: 3230,
    totalSeriesCount: 7,
    figureHits: 0,
    innerTens: 3,
    ...overrides,
  };
}

function milsnabbResult(
  overrides: Partial<CompetitionResultForStats> = {},
): CompetitionResultForStats {
  return {
    sessionId: 'm1',
    competitionType: 'spsf-milsnabb',
    weaponGroup: 'spsf:A',
    shooterClass: '2',
    date: '2026-06-13',
    beforeFinalTenths: 5400,
    beforeFinalSeriesCount: 12,
    totalTenths: 5400,
    totalSeriesCount: 12,
    figureHits: 0,
    innerTens: 5,
    ...overrides,
  };
}

describe('isOfficialPbEligible', () => {
  it('is eligible for exactly 7 precision grundomgång series', () => {
    expect(isOfficialPbEligible(precisionResult({ beforeFinalSeriesCount: 7 }))).toBe(true);
  });

  it('is not eligible for 6 or 10 precision series', () => {
    expect(isOfficialPbEligible(precisionResult({ beforeFinalSeriesCount: 6 }))).toBe(false);
    expect(isOfficialPbEligible(precisionResult({ beforeFinalSeriesCount: 10 }))).toBe(false);
  });

  it('is eligible for exactly 12 milsnabb series', () => {
    expect(isOfficialPbEligible(milsnabbResult({ totalSeriesCount: 12 }))).toBe(true);
  });

  it('is not eligible for 11 milsnabb series', () => {
    expect(isOfficialPbEligible(milsnabbResult({ totalSeriesCount: 11 }))).toBe(false);
  });

  it('is not eligible for an unrecognized competitionType', () => {
    expect(isOfficialPbEligible(precisionResult({ competitionType: 'spsf-falt' }))).toBe(false);
  });
});

describe('officialPbScore', () => {
  it('uses beforeFinalTenths for precision (finals excluded)', () => {
    const result = precisionResult({ beforeFinalTenths: 300, totalTenths: 348 });
    expect(officialPbScore(result)).toBe(300);
  });

  it('uses totalTenths for milsnabb (no final section)', () => {
    const result = milsnabbResult({ totalTenths: 540 });
    expect(officialPbScore(result)).toBe(540);
  });
});

describe('officialPbGroupKey', () => {
  it('concatenates weaponGroup and shooterClass (full class string, not either alone)', () => {
    expect(officialPbGroupKey(precisionResult())).toBe('spsf-precision:spsf:C2');
  });

  it('tracks C2 and C3 as separate groups', () => {
    expect(officialPbGroupKey(precisionResult({ shooterClass: '2' }))).not.toBe(
      officialPbGroupKey(precisionResult({ shooterClass: '3' })),
    );
  });
});

describe('personalBests', () => {
  it('ignores ineligible results entirely', () => {
    const groups = personalBests([precisionResult({ beforeFinalSeriesCount: 6 })]);
    expect(groups.size).toBe(0);
  });

  it('finds the all-time best by score', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'low', beforeFinalTenths: 300 }),
      precisionResult({ sessionId: 'high', beforeFinalTenths: 330 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C2')?.allTime?.sessionId).toBe('high');
  });

  it('breaks ties by figureHits, then innerTens', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'a', beforeFinalTenths: 300, figureHits: 1, innerTens: 5 }),
      precisionResult({ sessionId: 'b', beforeFinalTenths: 300, figureHits: 2, innerTens: 1 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C2')?.allTime?.sessionId).toBe('b');
  });

  it('breaks a figureHits tie by innerTens', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'a', beforeFinalTenths: 300, figureHits: 1, innerTens: 5 }),
      precisionResult({ sessionId: 'b', beforeFinalTenths: 300, figureHits: 1, innerTens: 9 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C2')?.allTime?.sessionId).toBe('b');
  });

  it('maintains a separate per-year PB alongside the all-time PB', () => {
    const groups = personalBests([
      precisionResult({ sessionId: '2025-best', date: '2025-05-01', beforeFinalTenths: 300 }),
      precisionResult({ sessionId: '2026-best', date: '2026-05-01', beforeFinalTenths: 330 }),
    ]);
    const group = groups.get('spsf-precision:spsf:C2')!;
    expect(group.allTime?.sessionId).toBe('2026-best');
    expect(group.byYear.get(2025)?.sessionId).toBe('2025-best');
    expect(group.byYear.get(2026)?.sessionId).toBe('2026-best');
  });

  it('groups precision and milsnabb results independently', () => {
    const groups = personalBests([precisionResult(), milsnabbResult()]);
    expect(groups.size).toBe(2);
    expect(groups.has('spsf-precision:spsf:C2')).toBe(true);
    expect(groups.has('spsf-milsnabb:spsf:A2')).toBe(true);
  });
});

function freeformSession(overrides: Partial<FreeformSessionForPb> = {}): FreeformSessionForPb {
  return {
    sessionId: 'f1',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    date: '2026-06-13',
    seriesTenths: [400, 410, 420, 430, 440],
    ...overrides,
  };
}

describe('bestNSeries', () => {
  it('sums the N highest-scoring series in a session', () => {
    const result = bestNSeries([freeformSession({ seriesTenths: [400, 410, 420, 430, 440] })], 3);
    expect(result.get('spsf-precision:spsf:C2')?.totalTenths).toBe(420 + 430 + 440);
  });

  it('skips a session with fewer series than N, never zero-padding', () => {
    const result = bestNSeries([freeformSession({ seriesTenths: [400, 410] })], 5);
    expect(result.has('spsf-precision:spsf:C2')).toBe(false);
  });

  it('keeps the best sum across multiple qualifying sessions in the same group', () => {
    const result = bestNSeries(
      [
        freeformSession({ sessionId: 'lower', seriesTenths: [100, 100, 100] }),
        freeformSession({ sessionId: 'higher', seriesTenths: [200, 200, 200] }),
      ],
      3,
    );
    expect(result.get('spsf-precision:spsf:C2')?.sessionId).toBe('higher');
  });

  it('groups by discipline+weaponGroup+shooterClass independently', () => {
    const result = bestNSeries(
      [freeformSession({ weaponGroup: 'spsf:C' }), freeformSession({ weaponGroup: 'spsf:A' })],
      3,
    );
    expect(result.size).toBe(2);
  });
});

describe('bestSession', () => {
  it('sums all series regardless of count', () => {
    const result = bestSession([freeformSession({ seriesTenths: [1, 2, 3, 4] })]);
    expect(result.get('spsf-precision:spsf:C2')?.totalTenths).toBe(10);
  });

  it('keeps the higher-total session per group', () => {
    const result = bestSession([
      freeformSession({ sessionId: 'lower', seriesTenths: [1, 1] }),
      freeformSession({ sessionId: 'higher', seriesTenths: [1, 1, 1] }),
    ]);
    expect(result.get('spsf-precision:spsf:C2')?.sessionId).toBe('higher');
  });

  it('handles an empty series list as a 0 total, not an error', () => {
    const result = bestSession([freeformSession({ seriesTenths: [] })]);
    expect(result.get('spsf-precision:spsf:C2')?.totalTenths).toBe(0);
  });
});
