import { describe, expect, it } from 'vitest';
import {
  bestNSeries,
  bestSession,
  isOfficialPbEligible,
  officialPbGroupKey,
  parseStatsGroupKey,
  officialPbScore,
  officialPbCoverage,
  freeformPbCoverage,
  personalBests,
  UNGROUPED_KEY,
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

  it('is not eligible for an unrecognized competitionType even when totalSeriesCount coincidentally equals 12', () => {
    expect(
      isOfficialPbEligible(precisionResult({ competitionType: 'spsf-falt', totalSeriesCount: 12 })),
    ).toBe(false);
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
  it('is discipline and vapengrupp, without the klass', () => {
    expect(officialPbGroupKey(precisionResult())).toBe('spsf-precision:spsf:C');
  });

  // A personal best belongs to the gun, not to the klass the shooter happened
  // to be entered in (maintainer, 2026-09-15).
  it('keeps C2 and C3 in one group', () => {
    expect(officialPbGroupKey(precisionResult({ shooterClass: '2' }))).toBe(
      officialPbGroupKey(precisionResult({ shooterClass: '3' })),
    );
  });

  it('separates vapengrupper, and disciplines', () => {
    expect(officialPbGroupKey(precisionResult({ weaponGroup: 'spsf:C' }))).not.toBe(
      officialPbGroupKey(precisionResult({ weaponGroup: 'spsf:A' })),
    );
    expect(officialPbGroupKey(precisionResult({ competitionType: 'spsf-milsnabb' }))).not.toBe(
      officialPbGroupKey(precisionResult({ competitionType: 'spsf-precision' })),
    );
  });
});

describe('parseStatsGroupKey', () => {
  it('splits on the first colon only — the vapengrupp id carries one', () => {
    expect(parseStatsGroupKey('spsf-precision:spsf:C')).toEqual({
      disciplineId: 'spsf-precision',
      weaponGroupId: 'spsf:C',
    });
  });

  it('round-trips a built key', () => {
    const key = officialPbGroupKey(precisionResult());
    expect(parseStatsGroupKey(key)).toEqual({
      disciplineId: 'spsf-precision',
      weaponGroupId: 'spsf:C',
    });
  });

  it('gives an empty group for a key with no colon', () => {
    expect(parseStatsGroupKey('generic-rings')).toEqual({
      disciplineId: 'generic-rings',
      weaponGroupId: '',
    });
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
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('high');
  });

  it('breaks ties by figureHits, then innerTens', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'a', beforeFinalTenths: 300, figureHits: 1, innerTens: 5 }),
      precisionResult({ sessionId: 'b', beforeFinalTenths: 300, figureHits: 2, innerTens: 1 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('b');
  });

  it('breaks a figureHits tie by innerTens', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'a', beforeFinalTenths: 300, figureHits: 1, innerTens: 5 }),
      precisionResult({ sessionId: 'b', beforeFinalTenths: 300, figureHits: 1, innerTens: 9 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('b');
  });

  it('keeps the higher-score result when a lower-score one arrives later (does not blindly replace)', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'high', beforeFinalTenths: 330 }),
      precisionResult({ sessionId: 'low', beforeFinalTenths: 300 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('high');
  });

  it('keeps the higher-figureHits result when a lower one arrives later on an equal score', () => {
    const groups = personalBests([
      precisionResult({
        sessionId: 'higher-fh',
        beforeFinalTenths: 300,
        figureHits: 2,
        innerTens: 1,
      }),
      precisionResult({
        sessionId: 'lower-fh',
        beforeFinalTenths: 300,
        figureHits: 1,
        innerTens: 5,
      }),
    ]);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('higher-fh');
  });

  it('keeps the higher-innerTens result when a lower one arrives later on an equal score/figureHits', () => {
    const groups = personalBests([
      precisionResult({
        sessionId: 'higher-it',
        beforeFinalTenths: 300,
        figureHits: 1,
        innerTens: 9,
      }),
      precisionResult({
        sessionId: 'lower-it',
        beforeFinalTenths: 300,
        figureHits: 1,
        innerTens: 5,
      }),
    ]);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('higher-it');
  });

  it('a complete tie (score/figureHits/innerTens all equal) keeps the first-seen result', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'first', beforeFinalTenths: 300, figureHits: 1, innerTens: 5 }),
      precisionResult({ sessionId: 'second', beforeFinalTenths: 300, figureHits: 1, innerTens: 5 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('first');
  });

  it('per-year PB also keeps the higher-score result when a lower one arrives later in the same year', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'high', date: '2026-01-01', beforeFinalTenths: 330 }),
      precisionResult({ sessionId: 'low', date: '2026-06-01', beforeFinalTenths: 300 }),
    ]);
    expect(groups.get('spsf-precision:spsf:C')?.byYear.get(2026)?.sessionId).toBe('high');
  });

  it('maintains a separate per-year PB alongside the all-time PB', () => {
    const groups = personalBests([
      precisionResult({ sessionId: '2025-best', date: '2025-05-01', beforeFinalTenths: 300 }),
      precisionResult({ sessionId: '2026-best', date: '2026-05-01', beforeFinalTenths: 330 }),
    ]);
    const group = groups.get('spsf-precision:spsf:C')!;
    expect(group.allTime?.sessionId).toBe('2026-best');
    expect(group.byYear.get(2025)?.sessionId).toBe('2025-best');
    expect(group.byYear.get(2026)?.sessionId).toBe('2026-best');
  });

  it('groups precision and milsnabb results independently', () => {
    const groups = personalBests([precisionResult(), milsnabbResult()]);
    expect(groups.size).toBe(2);
    expect(groups.has('spsf-precision:spsf:C')).toBe(true);
    expect(groups.has('spsf-milsnabb:spsf:A')).toBe(true);
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
    expect(result.get('spsf-precision:spsf:C')?.totalTenths).toBe(420 + 430 + 440);
  });

  it('skips a session with fewer series than N, never zero-padding', () => {
    const result = bestNSeries([freeformSession({ seriesTenths: [400, 410] })], 5);
    expect(result.has('spsf-precision:spsf:C')).toBe(false);
  });

  it('keeps the best sum across multiple qualifying sessions in the same group', () => {
    const result = bestNSeries(
      [
        freeformSession({ sessionId: 'lower', seriesTenths: [100, 100, 100] }),
        freeformSession({ sessionId: 'higher', seriesTenths: [200, 200, 200] }),
      ],
      3,
    );
    expect(result.get('spsf-precision:spsf:C')?.sessionId).toBe('higher');
  });

  it('groups by discipline+weaponGroup independently (klass is not in the key)', () => {
    const result = bestNSeries(
      [freeformSession({ weaponGroup: 'spsf:C' }), freeformSession({ weaponGroup: 'spsf:A' })],
      3,
    );
    expect(result.size).toBe(2);
  });

  it('keeps the higher-scoring session when a lower one arrives later (does not blindly replace)', () => {
    const result = bestNSeries(
      [
        freeformSession({ sessionId: 'higher', seriesTenths: [200, 200, 200] }),
        freeformSession({ sessionId: 'lower', seriesTenths: [100, 100, 100] }),
      ],
      3,
    );
    expect(result.get('spsf-precision:spsf:C')?.sessionId).toBe('higher');
  });

  it('R2: a helmatch tie on the total goes to the higher C, then B (SHB I.6.11.2.1)', () => {
    const group = 'spsf-helmatch:spsf:C';
    const tied = (sessionId: string, tieBreakTenths: number[]) =>
      freeformSession({
        sessionId,
        disciplineId: 'spsf-helmatch',
        seriesTenths: [5600],
        tieBreakTenths,
      });
    expect(
      bestSession([tied('first', [1800, 1900]), tied('second', [1900, 1800])]).get(group)
        ?.sessionId,
    ).toBe('second');
    expect(
      bestSession([tied('first', [1900, 1800]), tied('second', [1900, 1810])]).get(group)
        ?.sessionId,
    ).toBe('second');
    expect(
      bestSession([tied('first', [1900, 1810]), tied('second', [1900, 1800])]).get(group)
        ?.sessionId,
    ).toBe('first');
  });

  it('an exact tie keeps the first-seen session', () => {
    const result = bestNSeries(
      [
        freeformSession({ sessionId: 'first', seriesTenths: [100, 100, 100] }),
        freeformSession({ sessionId: 'second', seriesTenths: [100, 100, 100] }),
      ],
      3,
    );
    expect(result.get('spsf-precision:spsf:C')?.sessionId).toBe('first');
  });
});

describe('bestSession', () => {
  it('sums all series regardless of count', () => {
    const result = bestSession([freeformSession({ seriesTenths: [1, 2, 3, 4] })]);
    expect(result.get('spsf-precision:spsf:C')?.totalTenths).toBe(10);
  });

  it('keeps the higher-total session per group', () => {
    const result = bestSession([
      freeformSession({ sessionId: 'lower', seriesTenths: [1, 1] }),
      freeformSession({ sessionId: 'higher', seriesTenths: [1, 1, 1] }),
    ]);
    expect(result.get('spsf-precision:spsf:C')?.sessionId).toBe('higher');
  });

  it('handles an empty series list as a 0 total, not an error', () => {
    const result = bestSession([freeformSession({ seriesTenths: [] })]);
    expect(result.get('spsf-precision:spsf:C')?.totalTenths).toBe(0);
  });

  it('keeps the higher-total session when a lower one arrives later (does not blindly replace)', () => {
    const result = bestSession([
      freeformSession({ sessionId: 'higher', seriesTenths: [1, 1, 1] }),
      freeformSession({ sessionId: 'lower', seriesTenths: [1, 1] }),
    ]);
    expect(result.get('spsf-precision:spsf:C')?.sessionId).toBe('higher');
  });

  it('an exact tie keeps the first-seen session', () => {
    const result = bestSession([
      freeformSession({ sessionId: 'first', seriesTenths: [1, 1] }),
      freeformSession({ sessionId: 'second', seriesTenths: [1, 1] }),
    ]);
    expect(result.get('spsf-precision:spsf:C')?.sessionId).toBe('first');
  });
});

// #318: Records reported confident personal bests from 6 of 267 real sessions
// because a session needed BOTH a vapengrupp and a klass to be considered.
// Klass is read by no function here — it was pure gatekeeping.
describe('klass is display-only (#318)', () => {
  it('R1: a result with no shooterClass still produces a personal best', () => {
    const groups = personalBests([precisionResult({ shooterClass: null })]);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('s1');
  });

  it('R2: results differing only in klass share one group and one best', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'klass2', shooterClass: '2', beforeFinalTenths: 3230 }),
      precisionResult({ sessionId: 'klass3', shooterClass: '3', beforeFinalTenths: 4480 }),
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('klass3');
  });

  it('R3: a null klass does not change the group key', () => {
    expect(officialPbGroupKey(precisionResult({ shooterClass: null }))).toBe(
      officialPbGroupKey(precisionResult({ shooterClass: '2' })),
    );
  });
});

describe('ungrouped bucket (#318)', () => {
  it('R4: a result with no weaponGroup groups under UNGROUPED_KEY, not dropped', () => {
    const groups = personalBests([precisionResult({ weaponGroup: null })]);
    expect(groups.has(`spsf-precision:${UNGROUPED_KEY}`)).toBe(true);
  });

  it('R5: ungrouped results do not merge with a real group', () => {
    const groups = personalBests([
      precisionResult({ sessionId: 'grouped', weaponGroup: 'spsf:C' }),
      precisionResult({ sessionId: 'ungrouped', weaponGroup: null, beforeFinalTenths: 4480 }),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get('spsf-precision:spsf:C')?.allTime?.sessionId).toBe('grouped');
  });

  it('R6: the freeform path buckets the same way', () => {
    const result = bestNSeries([freeformSession({ weaponGroup: null })], 3);
    expect(result.has(`spsf-precision:${UNGROUPED_KEY}`)).toBe(true);
  });
});

describe('coverage (#318)', () => {
  it('R7: official coverage counts eligibility, not klass', () => {
    const coverage = officialPbCoverage([
      precisionResult({ sessionId: 'eligible', shooterClass: null }),
      precisionResult({ sessionId: 'short', beforeFinalSeriesCount: 5 }),
    ]);
    expect(coverage).toEqual({ considered: 2, counted: 1, ungrouped: 0 });
  });

  it('R8: official coverage reports how many counted results are ungrouped', () => {
    const coverage = officialPbCoverage([
      precisionResult({ sessionId: 'a', weaponGroup: null }),
      precisionResult({ sessionId: 'b', weaponGroup: 'spsf:C' }),
    ]);
    expect(coverage.counted).toBe(2);
    expect(coverage.ungrouped).toBe(1);
  });

  it('R9: freeform coverage takes its denominator from every session, not the eligible ones', () => {
    const coverage = freeformPbCoverage(
      [freeformSession(), freeformSession({ sessionId: 'f2' })],
      267,
    );
    expect(coverage).toEqual({ considered: 267, counted: 2, ungrouped: 0 });
  });

  it('R10: a session with no scored series is considered but not counted', () => {
    const coverage = freeformPbCoverage([freeformSession({ seriesTenths: [] })], 10);
    expect(coverage.counted).toBe(0);
    expect(coverage.considered).toBe(10);
  });
});
