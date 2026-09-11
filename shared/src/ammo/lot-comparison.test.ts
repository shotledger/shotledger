import { describe, expect, it } from 'vitest';

import type { StatsSeries } from '../scoring/stats';
import {
  compareAmmoLots,
  compareTwoLots,
  isSampleImbalanced,
  MIN_COMPARABLE_SHOTS,
  summarizeAmmoLot,
  tCritical95,
  type AmmoLotGroupSample,
} from './lot-comparison';

let counter = 0;

function series(overrides: Partial<StatsSeries> & { shotValues?: number[] }): StatsSeries {
  const { shotValues, ...rest } = overrides;
  counter += 1;
  return {
    id: `series-${counter}`,
    sessionId: `session-${counter}`,
    startedAt: '2026-01-01T10:00:00.000Z',
    disciplineId: 'spsf-precision',
    ammoLotId: 'lot-a',
    isSighter: false,
    isFinal: false,
    shots: (shotValues ?? []).map((valueTenths) => ({ valueTenths, isInnerTen: false })),
    ...rest,
  };
}

/** n series of `perSeries` shots, all worth `value` tenths. */
function flatSeries(lotId: string, n: number, perSeries: number, value: number): StatsSeries[] {
  return Array.from({ length: n }, () =>
    series({ ammoLotId: lotId, shotValues: Array<number>(perSeries).fill(value) }),
  );
}

describe('tCritical95', () => {
  it('reads the small-df table, then flattens', () => {
    expect(tCritical95(1)).toBeCloseTo(12.706, 3);
    expect(tCritical95(10)).toBeCloseTo(2.228, 3);
    expect(tCritical95(30)).toBeCloseTo(2.042, 3);
    expect(tCritical95(45)).toBe(2.0);
    expect(tCritical95(500)).toBe(1.96);
  });

  it('truncates a fractional df and clamps df < 1 to the widest value', () => {
    expect(tCritical95(10.9)).toBe(tCritical95(10));
    expect(tCritical95(0.4)).toBeCloseTo(12.706, 3);
  });
});

describe('summarizeAmmoLot', () => {
  it('excludes sighters from the score but keeps them in the volume count', () => {
    const summary = summarizeAmmoLot('lot-a', [
      series({ shotValues: [100, 90], isSighter: true }),
      series({ shotValues: [80, 90] }),
    ]);

    expect(summary.scoredShotCount).toBe(2);
    expect(summary.volumeShotCount).toBe(4);
    expect(summary.meanShotTenths).toBe(85);
    expect(summary.scoredSeriesCount).toBe(1);
    expect(summary.sessionCount).toBe(2);
  });

  it('counts inner tens and their rate over scored shots only', () => {
    const scored = series({ shotValues: [100, 100, 90] });
    const summary = summarizeAmmoLot('lot-a', [
      { ...scored, shots: [...scored.shots].map((shot, i) => ({ ...shot, isInnerTen: i === 0 })) },
    ]);

    expect(summary.innerTenCount).toBe(1);
    expect(summary.innerTenRate).toBeCloseTo(1 / 3, 10);
  });

  it('gives no mean, no SD and no interval for a lot with nothing scored', () => {
    const summary = summarizeAmmoLot('lot-a', [series({ shotValues: [100], isSighter: true })]);

    expect(summary.meanShotTenths).toBeNull();
    expect(summary.shotSdTenths).toBeNull();
    expect(summary.meanShotCi95Tenths).toBeNull();
    expect(summary.meanSeriesTenths).toBeNull();
    expect(summary.innerTenRate).toBeNull();
    expect(summary.sampleBand).toBe('none');
  });

  it('gives no interval from a single shot (SD is undefined, not zero)', () => {
    expect(summarizeAmmoLot('lot-a', [series({ shotValues: [95] })]).meanShotCi95Tenths).toBeNull();
  });

  it('widens the interval as the sample shrinks', () => {
    const values = [100, 90, 80, 100, 90, 80, 100, 90, 80, 100];
    const wide = summarizeAmmoLot('lot-a', [series({ shotValues: values.slice(0, 4) })]);
    const narrow = summarizeAmmoLot('lot-a', [
      series({ shotValues: [...values, ...values, ...values, ...values] }),
    ]);

    expect(wide.meanShotCi95Tenths as number).toBeGreaterThan(narrow.meanShotCi95Tenths as number);
  });

  it('computes the interval half-width as t * sd / sqrt(n)', () => {
    // Four shots, mean 90, sample SD 10 exactly.
    const summary = summarizeAmmoLot('lot-a', [series({ shotValues: [80, 90, 90, 100] })]);

    expect(summary.shotSdTenths).toBeCloseTo(8.164965809, 6);
    expect(summary.meanShotCi95Tenths).toBeCloseTo((3.182 * 8.164965809) / 2, 6);
  });

  it('bands the sample at the 30-shot rule of thumb', () => {
    expect(
      summarizeAmmoLot('lot-a', flatSeries('lot-a', 1, MIN_COMPARABLE_SHOTS - 1, 90)).sampleBand,
    ).toBe('thin');
    expect(
      summarizeAmmoLot('lot-a', flatSeries('lot-a', 1, MIN_COMPARABLE_SHOTS, 90)).sampleBand,
    ).toBe('usable');
  });

  it('averages group size per series, ignoring one-mark series', () => {
    const samples: AmmoLotGroupSample[] = [
      // 6 mm spread, mean radius 3 mm.
      {
        ammoLotId: 'lot-a',
        seriesId: 's1',
        points: [
          { xMm: -3, yMm: 0 },
          { xMm: 3, yMm: 0 },
        ],
      },
      // 10 mm spread, mean radius 5 mm.
      {
        ammoLotId: 'lot-a',
        seriesId: 's2',
        points: [
          { xMm: 0, yMm: -5 },
          { xMm: 0, yMm: 5 },
        ],
      },
      { ammoLotId: 'lot-a', seriesId: 's3', points: [{ xMm: 0, yMm: 0 }] },
      { ammoLotId: 'lot-a', seriesId: 's4', points: [] },
    ];
    const summary = summarizeAmmoLot('lot-a', [series({ shotValues: [90] })], samples);

    expect(summary.groupSampleCount).toBe(2);
    expect(summary.meanExtremeSpreadMm).toBeCloseTo(8, 10);
    expect(summary.meanRadiusMm).toBeCloseTo(4, 10);
  });

  it('reports no group figures when no series was photo-scored', () => {
    const summary = summarizeAmmoLot('lot-a', [series({ shotValues: [90] })]);

    expect(summary.groupSampleCount).toBe(0);
    expect(summary.meanExtremeSpreadMm).toBeNull();
    expect(summary.meanRadiusMm).toBeNull();
  });

  it('counts an imported WebShooter series (no shot rows) as a scored series', () => {
    const summary = summarizeAmmoLot('lot-a', [
      series({ shotValues: [], totalOverride: { tenths: 480, shotCount: 5 } }),
    ]);

    expect(summary.scoredSeriesCount).toBe(1);
    expect(summary.scoredShotCount).toBe(0);
    expect(summary.meanSeriesTenths).toBe(480);
    expect(summary.volumeShotCount).toBe(5);
  });
});

describe('compareTwoLots', () => {
  const lotA = () => summarizeAmmoLot('lot-a', flatSeries('lot-a', 10, 10, 95));

  it('refuses a verdict below the minimum shot count, even on a huge gap', () => {
    const thin = summarizeAmmoLot('lot-b', [series({ ammoLotId: 'lot-b', shotValues: [10, 20] })]);
    const result = compareTwoLots(lotA(), thin);

    expect(result.leaderLotId).toBe('lot-a');
    expect(result.verdict).toBe('insufficient-data');
    expect(result.ci95LowTenths).toBeNull();
    expect(result.deltaTenths).toBeGreaterThan(0);
  });

  it('refuses a verdict when a lot has no SD at all', () => {
    const empty = summarizeAmmoLot('lot-b', []);

    expect(compareTwoLots(lotA(), empty).verdict).toBe('insufficient-data');
  });

  it('calls a small difference in noisy data inconclusive', () => {
    // Both lots alternate 80/100 — mean 90 — but lot-b is shifted by one
    // shot, so the means differ by a hair against a large spread.
    const a = summarizeAmmoLot('lot-a', [
      series({ shotValues: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 80 : 100)) }),
    ]);
    const b = summarizeAmmoLot('lot-b', [
      series({
        ammoLotId: 'lot-b',
        shotValues: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 80 : 99)),
      }),
    ]);
    const result = compareTwoLots(a, b);

    expect(result.deltaTenths).toBeCloseTo(0.5, 10);
    expect(result.verdict).toBe('inconclusive');
    expect(result.ci95LowTenths as number).toBeLessThan(0);
    expect(result.ci95HighTenths as number).toBeGreaterThan(0);
  });

  it('calls a large, consistent difference a real one', () => {
    const a = summarizeAmmoLot('lot-a', [
      series({ shotValues: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 98 : 100)) }),
    ]);
    const b = summarizeAmmoLot('lot-b', [
      series({
        ammoLotId: 'lot-b',
        shotValues: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 78 : 80)),
      }),
    ]);
    const result = compareTwoLots(a, b);

    expect(result.leaderLotId).toBe('lot-a');
    expect(result.verdict).toBe('difference');
    expect(result.ci95LowTenths as number).toBeGreaterThan(0);
    expect(result.deltaTenths).toBeCloseTo(20, 10);
  });

  it('handles two perfectly constant lots without dividing by zero', () => {
    const a = summarizeAmmoLot('lot-a', flatSeries('lot-a', 10, 10, 100));
    const b = summarizeAmmoLot('lot-b', flatSeries('lot-b', 10, 10, 90));
    const result = compareTwoLots(a, b);

    expect(result.verdict).toBe('difference');
    expect(result.ci95LowTenths).toBe(10);
    expect(result.ci95HighTenths).toBe(10);
  });

  it('is inconclusive when two constant lots are identical', () => {
    const a = summarizeAmmoLot('lot-a', flatSeries('lot-a', 10, 10, 95));
    const b = summarizeAmmoLot('lot-b', flatSeries('lot-b', 10, 10, 95));

    expect(compareTwoLots(a, b).verdict).toBe('inconclusive');
  });

  it('orders the pair by mean, whichever way round it is given', () => {
    const a = summarizeAmmoLot('lot-a', flatSeries('lot-a', 10, 10, 90));
    const b = summarizeAmmoLot('lot-b', flatSeries('lot-b', 10, 10, 95));

    expect(compareTwoLots(a, b).leaderLotId).toBe('lot-b');
    expect(compareTwoLots(b, a).leaderLotId).toBe('lot-b');
  });
});

describe('compareAmmoLots', () => {
  it('ranks by per-shot mean and ignores series with no lot', () => {
    const result = compareAmmoLots([
      ...flatSeries('lot-a', 1, 5, 90),
      ...flatSeries('lot-b', 1, 5, 95),
      series({ ammoLotId: null, shotValues: [100, 100, 100] }),
    ]);

    expect(result.lots.map((lot) => lot.ammoLotId)).toEqual(['lot-b', 'lot-a']);
  });

  it('sorts lots with no scored shots last and breaks ties by id', () => {
    const result = compareAmmoLots([
      series({ ammoLotId: 'lot-z', shotValues: [90] }),
      series({ ammoLotId: 'lot-a', shotValues: [90] }),
      series({ ammoLotId: 'lot-empty', shotValues: [100], isSighter: true }),
    ]);

    expect(result.lots.map((lot) => lot.ammoLotId)).toEqual(['lot-a', 'lot-z', 'lot-empty']);
  });

  it('has no head-to-head and no imbalance with fewer than two scored lots', () => {
    const result = compareAmmoLots(flatSeries('lot-a', 1, 5, 90));

    expect(result.headToHead).toBeNull();
    expect(result.sampleImbalance).toBeNull();
    expect(isSampleImbalanced(result)).toBe(false);
  });

  it('reports the shot-count imbalance between the busiest and quietest lot', () => {
    const result = compareAmmoLots([
      ...flatSeries('lot-a', 1, 40, 95),
      ...flatSeries('lot-b', 1, 10, 90),
    ]);

    expect(result.sampleImbalance).toBe(4);
    expect(isSampleImbalanced(result)).toBe(true);
  });

  it('does not flag a mild imbalance', () => {
    const result = compareAmmoLots([
      ...flatSeries('lot-a', 1, 20, 95),
      ...flatSeries('lot-b', 1, 10, 90),
    ]);

    expect(result.sampleImbalance).toBe(2);
    expect(isSampleImbalanced(result)).toBe(false);
  });

  it('compares the top two lots and routes each lot its own group samples', () => {
    const samples: AmmoLotGroupSample[] = [
      {
        ammoLotId: 'lot-a',
        seriesId: 's1',
        points: [
          { xMm: -3, yMm: 0 },
          { xMm: 3, yMm: 0 },
        ],
      },
      {
        ammoLotId: 'lot-b',
        seriesId: 's2',
        points: [
          { xMm: -10, yMm: 0 },
          { xMm: 10, yMm: 0 },
        ],
      },
      { ammoLotId: null as unknown as string, seriesId: 's3', points: [{ xMm: 0, yMm: 0 }] },
    ];
    const result = compareAmmoLots(
      [
        ...flatSeries('lot-a', 1, 40, 95),
        ...flatSeries('lot-b', 1, 40, 90),
        ...flatSeries('lot-c', 1, 5, 99),
      ],
      samples,
    );

    expect(result.headToHead?.leaderLotId).toBe('lot-c');
    expect(result.headToHead?.runnerUpLotId).toBe('lot-a');
    // lot-c only has 5 shots, so the leader is ranked but not declared better.
    expect(result.headToHead?.verdict).toBe('insufficient-data');
    expect(result.lots.find((lot) => lot.ammoLotId === 'lot-a')?.meanExtremeSpreadMm).toBe(6);
    expect(result.lots.find((lot) => lot.ammoLotId === 'lot-b')?.meanExtremeSpreadMm).toBe(20);
    expect(result.lots.find((lot) => lot.ammoLotId === 'lot-c')?.meanExtremeSpreadMm).toBeNull();
  });

  it('returns nothing at all for an empty log', () => {
    expect(compareAmmoLots([])).toEqual({ lots: [], headToHead: null, sampleImbalance: null });
  });
});
