// Executable spec: docs/specs/session-vs-usual-form-spec.md — UF1-UF15.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { StatsSeries, StatsShot } from './stats';
import {
  USUAL_FORM_BASELINE_SIZE,
  USUAL_FORM_MIN_VERDICT_SERIES,
  compareWithUsualForm,
  usualFormVerdict,
  usualFormZ,
  type UsualFormVerdict,
} from './usual-form';

const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * DAY).toISOString();

const shots = (...values: number[]): StatsShot[] =>
  values.map((valueTenths) => ({ valueTenths, isInnerTen: false }));

/** Five shots summing to `total` tenths: four of `total / 5` rounded down, the rest on the last. */
const fiveShotsOf = (total: number): StatsShot[] => {
  const each = Math.floor(total / 5);
  return shots(each, each, each, each, total - 4 * each);
};

let seq = 0;
function series(overrides: Partial<StatsSeries> & { sessionId: string }): StatsSeries {
  seq += 1;
  return {
    id: `series-${seq}`,
    startedAt: day(100),
    disciplineId: 'spsf-precision',
    shooterClass: '2',
    isSighter: false,
    isFinal: false,
    shots: [],
    ...overrides,
  };
}

/** The session being viewed, at day 100. */
const S = 'S';
const inS = (shotList: StatsShot[], extra: Partial<StatsSeries> = {}) =>
  series({ sessionId: S, startedAt: day(100), shots: shotList, ...extra });

/** One earlier series per earlier session, on days 0, 1, 2 … before S. */
const earlier = (totals: readonly number[], extra: Partial<StatsSeries> = {}): StatsSeries[] =>
  totals.map((total, index) =>
    series({
      sessionId: `E${index}`,
      startedAt: day(index - totals.length + 99),
      shots: fiveShotsOf(total),
      ...extra,
    }),
  );

const RANK: Record<UsualFormVerdict, number> = {
  clearlyWorse: 0,
  worse: 1,
  usual: 2,
  better: 3,
  clearlyBetter: 4,
};

describe('constants', () => {
  it('the baseline is 100 series and the verdict needs 20', () => {
    expect(USUAL_FORM_BASELINE_SIZE).toBe(100);
    expect(USUAL_FORM_MIN_VERDICT_SERIES).toBe(20);
  });
});

describe('compareWithUsualForm — the baseline', () => {
  it('UF1: the baseline is the 100 series before the session', () => {
    const old = earlier([...Array<number>(20).fill(250), ...Array<number>(100).fill(450)]);
    const later = Array.from({ length: 5 }, (_, i) =>
      series({ sessionId: 'L', startedAt: day(150 + i), shots: fiveShotsOf(500) }),
    );
    const result = compareWithUsualForm([...later, inS(fiveShotsOf(450)), ...old], S)!;
    expect(result.baseline.seriesCount).toBe(100);
    expect(result.baseline.seriesMeanTenths).toBe(450);
    expect(result.baseline.shotCount).toBe(500);
  });

  it('UF1: ties on startedAt keep input order, and baselineSize bounds the window', () => {
    const first = series({ sessionId: 'A', startedAt: day(10), shots: fiveShotsOf(400) });
    const second = series({ sessionId: 'B', startedAt: day(10), shots: fiveShotsOf(480) });
    const oldest = series({ sessionId: 'C', startedAt: day(5), shots: fiveShotsOf(300) });
    const result = compareWithUsualForm([first, second, oldest, inS(fiveShotsOf(450))], S, {
      baselineSize: 1,
    })!;
    expect(result.baseline.seriesCount).toBe(1);
    expect(result.baseline.seriesMeanTenths).toBe(480);
    const two = compareWithUsualForm([second, first, oldest, inS(fiveShotsOf(450))], S, {
      baselineSize: 2,
    })!;
    expect(two.baseline.seriesMeanTenths).toBe(440);
  });

  it('UF2: the baseline matches discipline and class, and leaves out sighters and empty series', () => {
    const result = compareWithUsualForm(
      [
        ...earlier([450]),
        series({
          sessionId: 'X1',
          startedAt: day(1),
          disciplineId: 'spsf-milsnabb',
          shots: fiveShotsOf(300),
        }),
        series({ sessionId: 'X2', startedAt: day(2), shooterClass: '3', shots: fiveShotsOf(300) }),
        series({ sessionId: 'X3', startedAt: day(3), isSighter: true, shots: fiveShotsOf(300) }),
        series({ sessionId: 'X4', startedAt: day(4), shots: [] }),
        inS(fiveShotsOf(450)),
      ],
      S,
    )!;
    expect(result.baseline.seriesCount).toBe(1);
    expect(result.baseline.seriesMeanTenths).toBe(450);
  });

  it('UF2: a missing class matches only a missing class', () => {
    const result = compareWithUsualForm(
      [
        series({ sessionId: 'N', startedAt: day(1), shooterClass: null, shots: fiveShotsOf(400) }),
        series({ sessionId: 'C', startedAt: day(2), shots: fiveShotsOf(300) }),
        inS(fiveShotsOf(450), { shooterClass: null }),
      ],
      S,
    )!;
    expect(result.baseline.seriesCount).toBe(1);
    expect(result.baseline.seriesMeanTenths).toBe(400);
  });

  it('UF14: the session itself and sessions at the same time are never its baseline', () => {
    const result = compareWithUsualForm(
      [
        series({ sessionId: 'T', startedAt: day(100), shots: fiveShotsOf(300) }),
        inS(fiveShotsOf(450)),
        inS(fiveShotsOf(470)),
      ],
      S,
    )!;
    expect(result.baseline.seriesCount).toBe(0);
    expect(result.session.seriesCount).toBe(2);
  });
});

describe('compareWithUsualForm — the figures', () => {
  it('UF3: per-series and per-shot figures', () => {
    const result = compareWithUsualForm(
      [...earlier([450, 470]), inS(shots(100, 100, 100, 90, 90)), inS(shots(100, 90, 90, 90, 90))],
      S,
    )!;
    expect(result.baseline.seriesMeanTenths).toBe(460);
    expect(result.session.seriesMeanTenths).toBe(470);
    expect(result.deltaSeriesMeanTenths).toBe(10);
    expect(result.baseline.shotMeanTenths).toBe(92);
    expect(result.session.shotMeanTenths).toBe(94);
    expect(result.deltaShotMeanTenths).toBe(2);
    expect(result.baseline.seriesSdTenths).toBeCloseTo(Math.sqrt(200), 9);
    // Shots 90×5 and 94×5: mean 92, squared deviations 4 × 10 = 40, ÷ 9.
    expect(result.baseline.shotSdTenths).toBeCloseTo(Math.sqrt(40 / 9), 9);
    expect(result.session.seriesCount).toBe(2);
    expect(result.session.shotCount).toBe(10);
    expect(result.session.totalTenths).toBe(940);
  });

  it('UF4: expected total and over/under', () => {
    const result = compareWithUsualForm(
      [...earlier([450, 470]), inS(fiveShotsOf(470)), inS(fiveShotsOf(470)), inS(fiveShotsOf(470))],
      S,
    )!;
    expect(result.session.totalTenths).toBe(1410);
    expect(result.expectedTotalTenths).toBe(1380);
    expect(result.overUnderTenths).toBe(30);
  });

  it('UF4: scoring under the expected total gives a negative over/under', () => {
    const result = compareWithUsualForm([...earlier([450, 470]), inS(fiveShotsOf(400))], S)!;
    expect(result.expectedTotalTenths).toBe(460);
    expect(result.overUnderTenths).toBe(-60);
  });

  it('UF5: shares of 10s and 9-or-better', () => {
    const result = compareWithUsualForm(
      [
        series({ sessionId: 'E', startedAt: day(1), shots: shots(90, 90, 90, 90, 100) }),
        inS([...shots(100, 104, 90, 80), { valueTenths: 100, isInnerTen: true }]),
      ],
      S,
    )!;
    expect(result.session.tenShare).toBeCloseTo(3 / 5, 12);
    expect(result.session.nineOrBetterShare).toBeCloseTo(4 / 5, 12);
    expect(result.baseline.tenShare).toBeCloseTo(1 / 5, 12);
    expect(result.baseline.nineOrBetterShare).toBe(1);
    expect(result.deltaTenShare).toBeCloseTo(2 / 5, 12);
    expect(result.deltaNineOrBetterShare).toBeCloseTo(-1 / 5, 12);
  });

  it('UF5: the boundaries are 10.0 and 9.0 exactly', () => {
    const result = compareWithUsualForm([inS(shots(99, 100, 89, 90))], S)!;
    expect(result.session.tenShare).toBe(1 / 4);
    expect(result.session.nineOrBetterShare).toBe(3 / 4);
  });

  it('UF6: stored totals count per series, not per shot', () => {
    const result = compareWithUsualForm(
      [inS([], { totalOverride: { tenths: 480, shotCount: 5 } }), inS(fiveShotsOf(450))],
      S,
    )!;
    expect(result.session.seriesCount).toBe(2);
    expect(result.session.seriesMeanTenths).toBe(465);
    expect(result.session.totalTenths).toBe(930);
    expect(result.session.shotCount).toBe(5);
    expect(result.session.shotMeanTenths).toBe(90);
    expect(result.session.tenShare).toBe(0);
    expect(result.session.nineOrBetterShare).toBe(1);
  });

  it('UF6: a side of stored totals only has no per-shot figures', () => {
    const result = compareWithUsualForm(
      [inS([], { totalOverride: { tenths: 480, shotCount: 5 } })],
      S,
    )!;
    expect(result.session.shotCount).toBe(0);
    expect(result.session.shotMeanTenths).toBeNull();
    expect(result.session.tenShare).toBeNull();
    expect(result.session.nineOrBetterShare).toBeNull();
  });

  it('UF7: a hits discipline has no shares', () => {
    const result = compareWithUsualForm(
      [
        ...earlier([450], { disciplineId: 'spsf-falt' }),
        inS(fiveShotsOf(450), { disciplineId: 'spsf-falt' }),
      ],
      S,
    )!;
    expect(result.baseline.seriesCount).toBe(1);
    expect(result.session.tenShare).toBeNull();
    expect(result.session.nineOrBetterShare).toBeNull();
    expect(result.baseline.tenShare).toBeNull();
    expect(result.baseline.nineOrBetterShare).toBeNull();
    expect(result.deltaTenShare).toBeNull();
    expect(result.deltaNineOrBetterShare).toBeNull();
  });

  it('UF7: a discipline the app does not know is treated as rings', () => {
    const result = compareWithUsualForm([inS(shots(100, 90), { disciplineId: 'unknown' })], S)!;
    expect(result.session.tenShare).toBe(1 / 2);
    expect(result.session.nineOrBetterShare).toBe(1);
  });

  it('UF8: no baseline', () => {
    const result = compareWithUsualForm([inS(fiveShotsOf(450)), inS(fiveShotsOf(470))], S)!;
    expect(result.baseline).toEqual({
      seriesCount: 0,
      shotCount: 0,
      seriesMeanTenths: null,
      shotMeanTenths: null,
      seriesSdTenths: null,
      shotSdTenths: null,
      tenShare: null,
      nineOrBetterShare: null,
    });
    expect(result.deltaSeriesMeanTenths).toBeNull();
    expect(result.deltaShotMeanTenths).toBeNull();
    expect(result.deltaTenShare).toBeNull();
    expect(result.deltaNineOrBetterShare).toBeNull();
    expect(result.expectedTotalTenths).toBeNull();
    expect(result.overUnderTenths).toBeNull();
    expect(result.verdict).toBeNull();
    expect(result.session.seriesMeanTenths).toBe(460);
    expect(result.session.totalTenths).toBe(920);
  });

  it('UF13: an unknown session is null', () => {
    expect(compareWithUsualForm(earlier([450]), S)).toBeNull();
    expect(compareWithUsualForm([], S)).toBeNull();
  });

  it('UF15: a session of only sighters has no figures and no verdict', () => {
    const result = compareWithUsualForm(
      [...earlier(Array<number>(25).fill(450)), inS(fiveShotsOf(470), { isSighter: true })],
      S,
    )!;
    expect(result.session).toEqual({
      seriesCount: 0,
      shotCount: 0,
      seriesMeanTenths: null,
      shotMeanTenths: null,
      tenShare: null,
      nineOrBetterShare: null,
      totalTenths: 0,
    });
    expect(result.baseline.seriesCount).toBe(25);
    expect(result.deltaSeriesMeanTenths).toBeNull();
    expect(result.deltaShotMeanTenths).toBeNull();
    expect(result.deltaTenShare).toBeNull();
    expect(result.expectedTotalTenths).toBeNull();
    expect(result.overUnderTenths).toBeNull();
    expect(result.verdict).toBeNull();
  });
});

describe('compareWithUsualForm — how unusual', () => {
  const alternating = (count: number) =>
    earlier(Array.from({ length: count }, (_, i) => (i % 2 === 0 ? 440 : 460)));

  it('UF9: 19 earlier series show figures but no verdict; 20 give one', () => {
    const short = compareWithUsualForm([...alternating(19), inS(fiveShotsOf(500))], S)!;
    expect(short.baseline.seriesCount).toBe(19);
    expect(short.deltaSeriesMeanTenths).not.toBeNull();
    expect(short.verdict).toBeNull();
    const enough = compareWithUsualForm([...alternating(20), inS(fiveShotsOf(500))], S)!;
    expect(enough.verdict).toBe('clearlyBetter');
  });

  it('UF11: the verdict weighs the session series count', () => {
    // Baseline mean 450, sample SD 10·√(20/19) ≈ 10.26; session mean 460.
    const of = (n: number) =>
      compareWithUsualForm(
        [...alternating(20), ...Array.from({ length: n }, () => inS(fiveShotsOf(460)))],
        S,
      )!.verdict;
    expect(of(1)).toBe('usual'); // z ≈ 0.97
    expect(of(4)).toBe('better'); // z ≈ 1.95
    expect(of(9)).toBe('clearlyBetter'); // z ≈ 2.92
  });

  it('UF11: worse sessions get the worse verdicts', () => {
    const of = (n: number) =>
      compareWithUsualForm(
        [...alternating(20), ...Array.from({ length: n }, () => inS(fiveShotsOf(440)))],
        S,
      )!.verdict;
    expect(of(1)).toBe('usual');
    expect(of(4)).toBe('worse');
    expect(of(9)).toBe('clearlyWorse');
  });

  it('UF12: a flat baseline', () => {
    const flat = earlier(Array<number>(20).fill(450));
    const of = (sessionShots: StatsShot[]) =>
      compareWithUsualForm([...flat, inS(sessionShots)], S)!.verdict;
    expect(of(fiveShotsOf(450))).toBe('usual');
    expect(of(fiveShotsOf(452))).toBe('clearlyBetter');
    expect(of(fiveShotsOf(448))).toBe('clearlyWorse');
  });
});

describe('usualFormZ', () => {
  it('UF11: z is the difference over the standard error', () => {
    expect(usualFormZ(470, 460, 20, 1)).toBe(0.5);
    expect(usualFormZ(470, 460, 20, 16)).toBe(2);
    expect(usualFormZ(450, 460, 20, 4)).toBe(-1);
  });

  it('UF12: a zero SD gives 0 for no difference, and an infinite z otherwise', () => {
    expect(usualFormZ(450, 450, 0, 5)).toBe(0);
    expect(usualFormZ(452, 450, 0, 5)).toBe(Number.POSITIVE_INFINITY);
    expect(usualFormZ(448, 450, 0, 5)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('usualFormVerdict', () => {
  it('UF10: the verdict follows the bands', () => {
    expect([-2, -1.99, -1, -0.99, 0, 0.99, 1, 1.99, 2].map(usualFormVerdict)).toEqual([
      'clearlyWorse',
      'worse',
      'worse',
      'usual',
      'usual',
      'usual',
      'better',
      'better',
      'clearlyBetter',
    ]);
    expect(usualFormVerdict(Number.POSITIVE_INFINITY)).toBe('clearlyBetter');
    expect(usualFormVerdict(Number.NEGATIVE_INFINITY)).toBe('clearlyWorse');
  });
});

describe('property', () => {
  it('raising every session series never makes the verdict worse', () => {
    const value = fc.integer({ min: 0, max: 109 });
    const fiveShots = fc.array(value, { minLength: 5, maxLength: 5 });
    fc.assert(
      fc.property(
        fc.array(fiveShots, { minLength: 20, maxLength: 30 }),
        fc.array(fiveShots, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 50 }),
        (baselineSeries, sessionSeries, raise) => {
          const baseline = baselineSeries.map((values, i) =>
            series({ sessionId: `B${i}`, startedAt: day(i), shots: shots(...values) }),
          );
          const verdictOf = (bump: number) =>
            compareWithUsualForm(
              [
                ...baseline,
                ...sessionSeries.map((values) => inS(shots(...values.map((v) => v + bump)))),
              ],
              S,
            )!.verdict!;
          expect(RANK[verdictOf(raise)]).toBeGreaterThanOrEqual(RANK[verdictOf(0)]);
        },
      ),
    );
  });
});
