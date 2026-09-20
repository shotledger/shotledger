// Executable spec: docs/specs/m5-stats-spec.md — behaviors B13-B31.
import { describe, expect, it } from 'vitest';

import {
  aggregateByAmmoLot,
  aggregateByFirearm,
  bestWorstSeries,
  compareRecentSeries,
  goldSeriesCount,
  meanTenths,
  sampleStandardDeviationTenths,
  scoredSeriesTotalsTenths,
  scoredShots,
  seriesMeanTenths,
  seriesSdTenths,
  sessionTrend,
  volumeShotCount,
  xCount,
  xRate,
  type StatsSeries,
  type StatsShot,
} from './stats';

function shot(valueTenths: number, isInnerTen = false): StatsShot {
  return { valueTenths, isInnerTen };
}

function series(
  overrides: Partial<StatsSeries> & { id: string; shots: readonly StatsShot[] },
): StatsSeries {
  return {
    sessionId: overrides.sessionId ?? 'session-1',
    startedAt: overrides.startedAt ?? '2026-01-01T00:00:00.000Z',
    disciplineId: overrides.disciplineId ?? 'spsf-precision',
    weaponGroup: overrides.weaponGroup ?? 'spsf:C',
    shooterClass: overrides.shooterClass ?? '2',
    firearmId: overrides.firearmId ?? null,
    ammoLotId: overrides.ammoLotId ?? null,
    isSighter: overrides.isSighter ?? false,
    isFinal: overrides.isFinal ?? false,
    ...overrides,
  };
}

describe('meanTenths', () => {
  it('B13: simple mean', () => {
    expect(meanTenths([shot(90), shot(80), shot(100, true)])).toBe(90);
  });

  it('B14: empty input is null, not 0/NaN', () => {
    expect(meanTenths([])).toBeNull();
  });
});

describe('sampleStandardDeviationTenths', () => {
  it('B15: hand-computed sample SD', () => {
    expect(sampleStandardDeviationTenths([shot(80), shot(90), shot(100)])).toBe(10);
  });

  it('B16: fewer than 2 values is null', () => {
    expect(sampleStandardDeviationTenths([shot(90)])).toBeNull();
    expect(sampleStandardDeviationTenths([])).toBeNull();
  });

  it('exactly 2 values computes a sample SD (boundary, not null)', () => {
    // mean=90, deviations 10/-10, sum sq=200, variance=200/(2-1)=200
    expect(sampleStandardDeviationTenths([shot(80), shot(100)])).toBeCloseTo(Math.sqrt(200), 6);
  });
});

describe('xCount / xRate', () => {
  const shots = [shot(90, true), shot(90), shot(90), shot(100, true), shot(80)];

  it('B17: counts and rate', () => {
    expect(xCount(shots)).toBe(2);
    expect(xRate(shots)).toBe(0.4);
    expect(xRate([])).toBeNull();
  });
});

describe('sighter exclusion (B18)', () => {
  const sighterSeries = series({
    id: 'sighter',
    isSighter: true,
    shots: [shot(90), shot(90), shot(90), shot(90), shot(90)],
  });
  const scoredOne = series({
    id: 'scored',
    shots: [shot(90), shot(90), shot(90), shot(90), shot(90)],
  });

  it('scoredShots excludes sighter series', () => {
    expect(scoredShots([sighterSeries, scoredOne])).toHaveLength(5);
  });

  it('volumeShotCount includes sighter series', () => {
    expect(volumeShotCount([sighterSeries, scoredOne])).toBe(10);
  });

  it('WS1: volumeShotCount uses an override series stored shot count, not shots.length', () => {
    const override = series({
      id: 'override',
      shots: [],
      totalOverride: { tenths: 470, shotCount: 5 },
    });
    expect(volumeShotCount([override, scoredOne])).toBe(10);
  });

  it('meanTenths over scoredShots ignores the sighter series', () => {
    expect(meanTenths(scoredShots([sighterSeries, scoredOne]))).toBe(90);
  });
});

describe('bestWorstSeries', () => {
  it('B19: picks by total, sighters excluded despite the highest total', () => {
    const s1 = series({ id: 's1', shots: Array(5).fill(shot(80)) }); // 400
    const s2 = series({ id: 's2', shots: Array(5).fill(shot(92)) }); // 460
    const s3 = series({ id: 's3', shots: Array(5).fill(shot(86)) }); // 430
    const sighter = series({ id: 'sighter', isSighter: true, shots: Array(5).fill(shot(100)) }); // 500

    expect(bestWorstSeries([s1, s2, s3, sighter])).toEqual({
      best: { id: 's2', totalTenths: 460 },
      worst: { id: 's1', totalTenths: 400 },
    });
  });

  it('B20: ties keep the first occurrence', () => {
    const s1 = series({ id: 's1', shots: Array(5).fill(shot(90)) }); // 450
    const s2 = series({ id: 's2', shots: Array(5).fill(shot(90)) }); // 450

    expect(bestWorstSeries([s1, s2])).toEqual({
      best: { id: 's1', totalTenths: 450 },
      worst: { id: 's1', totalTenths: 450 },
    });
  });

  it('worst updates mid-loop when a later series is lower than the running worst', () => {
    const s1 = series({ id: 's1', shots: Array(5).fill(shot(100)) }); // 500, initial best/worst
    const s2 = series({ id: 's2', shots: Array(5).fill(shot(80)) }); // 400, new worst
    const s3 = series({ id: 's3', shots: Array(5).fill(shot(90)) }); // 450

    expect(bestWorstSeries([s1, s2, s3])).toEqual({
      best: { id: 's1', totalTenths: 500 },
      worst: { id: 's2', totalTenths: 400 },
    });
  });

  it('excludes a non-sighter series with zero shots from best/worst', () => {
    const s1 = series({ id: 's1', shots: Array(5).fill(shot(80)) }); // 400
    const empty = series({ id: 'empty', shots: [] }); // would be 0 if not filtered
    expect(bestWorstSeries([s1, empty])).toEqual({
      best: { id: 's1', totalTenths: 400 },
      worst: { id: 's1', totalTenths: 400 },
    });
  });

  it('B21: no scored series at all', () => {
    const sighter = series({ id: 'sighter', isSighter: true, shots: [shot(90)] });
    expect(bestWorstSeries([sighter])).toEqual({ best: null, worst: null });
    expect(bestWorstSeries([])).toEqual({ best: null, worst: null });
  });

  it('WS1: an override series (no shots) is included using its stored total', () => {
    const s1 = series({ id: 's1', shots: Array(5).fill(shot(80)) }); // 400
    const override = series({
      id: 'override',
      shots: [],
      totalOverride: { tenths: 470, shotCount: 5 },
    });
    expect(bestWorstSeries([s1, override])).toEqual({
      best: { id: 'override', totalTenths: 470 },
      worst: { id: 's1', totalTenths: 400 },
    });
  });
});

describe('sessionTrend', () => {
  it('B22: chronological per-session mean, input order sorted by startedAt', () => {
    const s1 = series({
      id: 's1',
      sessionId: 'session-a',
      startedAt: '2026-01-10T00:00:00.000Z',
      shots: [shot(88)],
    });
    const s2 = series({
      id: 's2',
      sessionId: 'session-b',
      startedAt: '2026-01-05T00:00:00.000Z',
      shots: [shot(92)],
    });

    expect(sessionTrend([s1, s2])).toEqual([
      { sessionId: 'session-b', startedAt: '2026-01-05T00:00:00.000Z', meanTenths: 92 },
      { sessionId: 'session-a', startedAt: '2026-01-10T00:00:00.000Z', meanTenths: 88 },
    ]);
  });

  it('B23: a session with only sighter shots is omitted', () => {
    const onlySighter = series({
      id: 's1',
      sessionId: 'session-a',
      isSighter: true,
      shots: [shot(90)],
    });
    expect(sessionTrend([onlySighter])).toEqual([]);
  });

  it('a non-sighter series with no shots yet contributes no trend point', () => {
    const empty = series({ id: 's1', sessionId: 'session-a', shots: [] });
    expect(sessionTrend([empty])).toEqual([]);
  });
});

describe('per-series score math', () => {
  const fiveShots = (perShotTenths: number) => Array(5).fill(shot(perShotTenths));

  it('averages series totals, not shot values', () => {
    // 45p and 43p (in tenths) — mean 44.0p, which is what the session
    // header's "Avg/Series" shows and what the Stats tab must lead with.
    const list = [
      series({ id: 's1', shots: [...fiveShots(90)] }),
      series({ id: 's2', shots: [shot(90), shot(90), shot(90), shot(80), shot(80)] }),
    ];
    expect(scoredSeriesTotalsTenths(list)).toEqual([450, 430]);
    expect(seriesMeanTenths(list)).toBe(440);
  });

  it('excludes sighter series', () => {
    const list = [
      series({ id: 'sighter', isSighter: true, shots: fiveShots(20) }),
      series({ id: 's1', shots: fiveShots(90) }),
    ];
    expect(scoredSeriesTotalsTenths(list)).toEqual([450]);
    expect(seriesMeanTenths(list)).toBe(450);
  });

  it('includes final series alongside the main round', () => {
    const list = [
      series({ id: 's1', shots: fiveShots(90) }),
      series({ id: 'f1', isFinal: true, shots: fiveShots(80) }),
    ];
    expect(seriesMeanTenths(list)).toBe(425);
  });

  it('omits a scored series with no shots entered yet rather than counting it as 0', () => {
    const list = [series({ id: 's1', shots: fiveShots(90) }), series({ id: 'empty', shots: [] })];
    expect(scoredSeriesTotalsTenths(list)).toEqual([450]);
    expect(seriesMeanTenths(list)).toBe(450);
  });

  it('uses an override series stored total (WS1), which has no shot rows', () => {
    const list = [
      series({ id: 'ws', shots: [], totalOverride: { tenths: 470, shotCount: 5 } }),
      series({ id: 's1', shots: fiveShots(90) }),
    ];
    expect(scoredSeriesTotalsTenths(list)).toEqual([470, 450]);
    expect(seriesMeanTenths(list)).toBe(460);
  });

  it('is null when nothing qualifies', () => {
    expect(scoredSeriesTotalsTenths([])).toEqual([]);
    expect(seriesMeanTenths([])).toBeNull();
    expect(
      seriesMeanTenths([series({ id: 'sighter', isSighter: true, shots: fiveShots(90) })]),
    ).toBeNull();
  });

  it('seriesSdTenths is the sample SD of the series totals', () => {
    // Totals 400, 450, 500 -> sample SD 50 (n-1 denominator), which is a
    // different number from the SD of the pooled shot values.
    const list = [
      series({ id: 's1', shots: fiveShots(80) }),
      series({ id: 's2', shots: fiveShots(90) }),
      series({ id: 's3', shots: fiveShots(100) }),
    ];
    expect(seriesSdTenths(list)).toBe(50);
    expect(sampleStandardDeviationTenths(scoredShots(list))).toBeCloseTo(8.4515, 3);
  });

  it('seriesSdTenths is null with fewer than two series', () => {
    expect(seriesSdTenths([])).toBeNull();
    expect(seriesSdTenths([series({ id: 's1', shots: fiveShots(90) })])).toBeNull();
  });
});

describe('compareRecentSeries', () => {
  // 10 series, one shot each, chronological, values 80..98 step 2.
  const values = [80, 82, 84, 86, 88, 90, 92, 94, 96, 98];
  const tenSeries = values.map((v, i) =>
    series({
      id: `s${i}`,
      startedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      shots: [shot(v)],
    }),
  );

  it('B24: recent vs previous with n=4', () => {
    const result = compareRecentSeries(
      tenSeries,
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      4,
    );
    expect(result).toEqual({
      recentMeanTenths: 95,
      previousMeanTenths: 87,
      deltaTenths: 8,
      // One shot per series in this fixture, so the series-level figures
      // coincide with the per-shot ones — the windowing is what is under
      // test here; the series/shot split has its own cases below.
      recentSeriesMeanTenths: 95,
      previousSeriesMeanTenths: 87,
      deltaSeriesTenths: 8,
      recentCount: 4,
      previousCount: 4,
    });
  });

  it('B25: excludes non-matching discipline/class before windowing', () => {
    const decoys = [
      series({
        id: 'd1',
        shooterClass: '3',
        startedAt: '2026-01-11T00:00:00.000Z',
        shots: [shot(999)],
      }),
      series({
        id: 'd2',
        disciplineId: 'spsf-milsnabb',
        startedAt: '2026-01-12T00:00:00.000Z',
        shots: [shot(1)],
      }),
    ];
    const result = compareRecentSeries(
      [...tenSeries, ...decoys],
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      4,
    );
    expect(result).toEqual({
      recentMeanTenths: 95,
      previousMeanTenths: 87,
      deltaTenths: 8,
      // One shot per series in this fixture, so the series-level figures
      // coincide with the per-shot ones — the windowing is what is under
      // test here; the series/shot split has its own cases below.
      recentSeriesMeanTenths: 95,
      previousSeriesMeanTenths: 87,
      deltaSeriesTenths: 8,
      recentCount: 4,
      previousCount: 4,
    });
  });

  it('B26: fewer than N series never fabricates a baseline', () => {
    const three = tenSeries.slice(0, 3);
    const result = compareRecentSeries(
      three,
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      100,
    );
    expect(result.recentCount).toBe(3);
    expect(result.previousCount).toBe(0);
    expect(result.previousMeanTenths).toBeNull();
    expect(result.deltaTenths).toBeNull();
    expect(result.previousSeriesMeanTenths).toBeNull();
    expect(result.deltaSeriesTenths).toBeNull();
  });

  it('compares series scores, not shot values, at series level', () => {
    // Four 5-shot series: two old at 40p, two recent at 45p. The per-shot
    // mean moves 80 -> 90 tenths; the per-series mean moves 400 -> 450.
    const fiveShots = (perShotTenths: number) => Array(5).fill(shot(perShotTenths));
    const four = [80, 80, 90, 90].map((v, i) =>
      series({
        id: `p${i}`,
        startedAt: `2026-02-0${i + 1}T00:00:00.000Z`,
        shots: fiveShots(v),
      }),
    );
    const result = compareRecentSeries(
      four,
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      2,
    );
    expect(result.recentMeanTenths).toBe(90);
    expect(result.previousMeanTenths).toBe(80);
    expect(result.recentSeriesMeanTenths).toBe(450);
    expect(result.previousSeriesMeanTenths).toBe(400);
    expect(result.deltaSeriesTenths).toBe(50);
  });

  it('windows of unequal series length shift the two means differently', () => {
    // A 10-shot series and a 5-shot series at the same per-shot average:
    // identical per-shot means, but the series means differ 2:1 — the case
    // the per-shot reading was hiding.
    const long = series({
      id: 'long',
      startedAt: '2026-03-01T00:00:00.000Z',
      shots: Array(10).fill(shot(90)),
    });
    const short = series({
      id: 'short',
      startedAt: '2026-03-02T00:00:00.000Z',
      shots: Array(5).fill(shot(90)),
    });
    const result = compareRecentSeries(
      [long, short],
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      1,
    );
    expect(result.recentMeanTenths).toBe(90);
    expect(result.previousMeanTenths).toBe(90);
    expect(result.deltaTenths).toBe(0);
    expect(result.recentSeriesMeanTenths).toBe(450);
    expect(result.previousSeriesMeanTenths).toBe(900);
    expect(result.deltaSeriesTenths).toBe(-450);
  });

  it('sorts input chronologically regardless of array order', () => {
    // Same 10 series as B24 but scrambled in the input array — the
    // function must sort by startedAt before windowing, not trust input order.
    const shuffled = [...tenSeries].reverse();
    const result = compareRecentSeries(
      shuffled,
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      4,
    );
    expect(result).toEqual({
      recentMeanTenths: 95,
      previousMeanTenths: 87,
      deltaTenths: 8,
      // One shot per series in this fixture, so the series-level figures
      // coincide with the per-shot ones — the windowing is what is under
      // test here; the series/shot split has its own cases below.
      recentSeriesMeanTenths: 95,
      previousSeriesMeanTenths: 87,
      deltaSeriesTenths: 8,
      recentCount: 4,
      previousCount: 4,
    });
  });

  it('B27: default n is 100', () => {
    const five = tenSeries.slice(0, 5);
    const withDefault = compareRecentSeries(five, {
      disciplineId: 'spsf-precision',
      shooterClass: '2',
    });
    const withExplicit100 = compareRecentSeries(
      five,
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      100,
    );
    expect(withDefault).toEqual(withExplicit100);
  });

  it('B27b: a recent window with no scored data yields no delta, both per-shot and per-series', () => {
    // scoredSeries() drops only sighters, so a series with no shots still
    // reaches the recent window while the previous window has scores. Both
    // sides of the delta need guarding, not just the previous one.
    const pair = [
      series({ id: 'r0', startedAt: '2026-03-01T00:00:00.000Z', shots: [shot(90), shot(90)] }),
      series({ id: 'r1', startedAt: '2026-03-02T00:00:00.000Z', shots: [] }),
    ];
    const result = compareRecentSeries(
      pair,
      { disciplineId: 'spsf-precision', shooterClass: '2' },
      1,
    );
    expect(result.recentMeanTenths).toBeNull();
    expect(result.previousMeanTenths).toBe(90);
    expect(result.deltaTenths).toBeNull();
    expect(result.recentSeriesMeanTenths).toBeNull();
    expect(result.previousSeriesMeanTenths).toBe(180);
    expect(result.deltaSeriesTenths).toBeNull();
  });
});

describe('goldSeriesCount', () => {
  // Amended 2026-09-17 (maintainer: "a sighter always counts towards
  // guldserie"): the sighter below qualifies, so the count is 3, not 2.
  it('B28: sighters included, only totals meeting the C threshold (46) count', () => {
    const make = (id: string, perShot: number, isSighter = false) =>
      series({ id, isSighter, shots: Array(5).fill(shot(perShot * 10)) });

    const s44 = make('s44', 44 / 5); // 44 total, below threshold
    const s46 = make('s46', 46 / 5); // 46 total, meets threshold
    const s47 = make('s47', 47 / 5); // 47 total, above threshold
    const s40 = make('s40', 40 / 5);
    const sighter50 = make('sighter50', 50 / 5, true);

    expect(goldSeriesCount([s44, s46, s47, s40, sighter50], { birthYear: null })).toBe(3);
  });

  it('counts every qualifying series, not a coincidental match to the total', () => {
    // Asymmetric fixture (all three qualify) to distinguish >= from a
    // flipped comparison, which a symmetric split around the threshold
    // cannot: an equal split above/below the line produces the same count
    // either way the comparison is flipped.
    const make = (id: string) => series({ id, shots: Array(5).fill(shot(100)) }); // 50 pts each
    expect(goldSeriesCount([make('a'), make('b'), make('c')], { birthYear: null })).toBe(3);
  });

  it('B29: non-precision discipline never counts, regardless of points', () => {
    const milsnabb50 = series({
      id: 'm1',
      disciplineId: 'spsf-milsnabb',
      shots: Array(5).fill(shot(100)),
    });
    expect(goldSeriesCount([milsnabb50], { birthYear: null })).toBe(0);
  });
});

describe('per-firearm / per-ammo-lot aggregates', () => {
  const sighterF1 = series({
    id: 'sighter-f1',
    sessionId: 'session-1',
    firearmId: 'f1',
    isSighter: true,
    shots: Array(5).fill(shot(90)),
  });
  const scoredF1 = series({
    id: 'scored-f1',
    sessionId: 'session-1',
    firearmId: 'f1',
    shots: [shot(90), shot(90), shot(90), shot(90), shot(100, true)],
  });
  const scoredF2 = series({
    id: 'scored-f2',
    sessionId: 'session-2',
    firearmId: 'f2',
    shots: Array(5).fill(shot(80)),
  });
  const unassigned = series({
    id: 'unassigned',
    firearmId: null,
    shots: Array(5).fill(shot(70)),
  });

  it('B30: groups by firearm, volume includes sighters, score excludes them', () => {
    const result = aggregateByFirearm([sighterF1, scoredF1, scoredF2, unassigned], {
      birthYear: null,
    });
    const byKey = Object.fromEntries(result.map((bucket) => [bucket.key, bucket]));

    expect(Object.keys(byKey).sort()).toEqual(['f1', 'f2']);
    expect(byKey.f1).toMatchObject({
      volumeShotCount: 10,
      scoredShotCount: 5,
      meanTenths: 92,
      xCount: 1,
      xRate: 0.2,
      sessionCount: 1,
    });
    expect(byKey.f1!.sdTenths).toBeCloseTo(4.47213595, 5);
    expect(byKey.f2).toMatchObject({
      volumeShotCount: 5,
      scoredShotCount: 5,
      meanTenths: 80,
      sdTenths: 0,
      xCount: 0,
      xRate: 0,
      sessionCount: 1,
    });
  });

  it('sessionCount counts distinct sessions, not just series', () => {
    const sameFirearmTwoSessions = [
      series({ id: 's1', sessionId: 'session-x', firearmId: 'f9', shots: Array(5).fill(shot(80)) }),
      series({ id: 's2', sessionId: 'session-y', firearmId: 'f9', shots: Array(5).fill(shot(80)) }),
    ];
    const result = aggregateByFirearm(sameFirearmTwoSessions, { birthYear: null });
    expect(result).toHaveLength(1);
    expect(result[0]!.sessionCount).toBe(2);
  });

  it('a series with firearmId entirely absent (undefined, not null) is excluded too', () => {
    const noFirearmField: StatsSeries = {
      id: 'no-field',
      sessionId: 'session-z',
      startedAt: '2026-01-01T00:00:00.000Z',
      disciplineId: 'spsf-precision',
      isSighter: false,
      isFinal: false,
      shots: Array(5).fill(shot(80)),
      // firearmId intentionally omitted (undefined), not set to null
    };
    expect(aggregateByFirearm([noFirearmField], { birthYear: null })).toEqual([]);
  });

  it('B31: aggregateByAmmoLot is the same contract keyed by ammoLotId', () => {
    const lotA = series({ id: 'lot-a', ammoLotId: 'lot-a', shots: Array(5).fill(shot(85)) });
    const lotB = series({ id: 'lot-b', ammoLotId: 'lot-b', shots: Array(5).fill(shot(75)) });
    const result = aggregateByAmmoLot([lotA, lotB], { birthYear: null });
    const byKey = Object.fromEntries(result.map((bucket) => [bucket.key, bucket]));

    expect(byKey['lot-a']).toMatchObject({
      meanTenths: 85,
      volumeShotCount: 5,
      scoredShotCount: 5,
    });
    expect(byKey['lot-b']).toMatchObject({
      meanTenths: 75,
      volumeShotCount: 5,
      scoredShotCount: 5,
    });
  });
});
