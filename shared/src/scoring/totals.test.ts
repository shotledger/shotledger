import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  countInnerTens,
  isScoringSeries,
  SERIES_SECTION_ORDER,
  seriesAverageTenths,
  seriesInnerTenAverage,
  seriesSectionOf,
  sessionInnerTenCount,
  sessionResults,
  shotVolume,
  sumValueTenths,
  tenthsToScore,
  type FlaggedSeriesForResults,
  type SeriesForResults,
} from './totals';

describe('sumValueTenths', () => {
  it('sums an empty list to 0', () => {
    expect(sumValueTenths([])).toBe(0);
  });

  it('sums integer-mode shots (value x10)', () => {
    expect(sumValueTenths([{ valueTenths: 90 }, { valueTenths: 100 }, { valueTenths: 80 }])).toBe(
      270,
    );
  });

  it('sums decimal-mode shots (tenths)', () => {
    expect(sumValueTenths([{ valueTenths: 103 }, { valueTenths: 98 }])).toBe(201);
  });
});

describe('tenthsToScore', () => {
  it('converts tenths to a display score', () => {
    expect(tenthsToScore(470)).toBe(47);
    expect(tenthsToScore(103)).toBe(10.3);
    expect(tenthsToScore(0)).toBe(0);
  });
});

// --- M3: result model (spec docs/specs/m3-scoring-spec.md §5) ---

const shots = (...values: number[]) => values.map((valueTenths) => ({ valueTenths }));

const main = (...values: number[]): SeriesForResults => ({
  isSighter: false,
  isFinal: false,
  shots: shots(...values),
});
const mainSighter = (...values: number[]): SeriesForResults => ({
  ...main(...values),
  isSighter: true,
});
const final = (...values: number[]): SeriesForResults => ({ ...main(...values), isFinal: true });
const finalSighter = (...values: number[]): SeriesForResults => ({
  ...main(...values),
  isSighter: true,
  isFinal: true,
});

describe('countInnerTens (spec T2)', () => {
  it('counts X only, never the decimal (X)', () => {
    expect(
      countInnerTens([
        { valueTenths: 100, isInnerTen: true },
        { valueTenths: 109, isInnerTen: false },
        { valueTenths: 100, isInnerTen: true },
        { valueTenths: 90, isInnerTen: false },
      ]),
    ).toBe(2);
  });

  it('counts nothing in an empty list', () => {
    expect(countInnerTens([])).toBe(0);
  });
});

describe('sessionResults (spec T3-T8)', () => {
  it('T3: an empty session is all zeros with no final', () => {
    expect(sessionResults([])).toEqual({
      beforeFinalTenths: 0,
      finalTenths: 0,
      totalTenths: 0,
      hasFinal: false,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });

  it('T4: without final series the total is the main-round sum', () => {
    const results = sessionResults([main(90, 100, 80), main(70, 90, 100)]);
    expect(results).toEqual({
      beforeFinalTenths: 530,
      finalTenths: 0,
      totalTenths: 530,
      hasFinal: false,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });

  it('T5: with final series all three results are reported', () => {
    const results = sessionResults([main(90, 100), main(80, 80), final(100, 100)]);
    expect(results).toEqual({
      beforeFinalTenths: 350,
      finalTenths: 200,
      totalTenths: 550,
      hasFinal: true,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });

  it('T6: a main sighter series scores nothing', () => {
    const results = sessionResults([mainSighter(100, 100, 100), main(90, 90)]);
    expect(results.beforeFinalTenths).toBe(180);
    expect(results.totalTenths).toBe(180);
    expect(results.hasFinal).toBe(false);
  });

  it('T7: a final sighter series scores nothing but marks the final section', () => {
    const results = sessionResults([main(90), finalSighter(100, 100), final(80)]);
    expect(results).toEqual({
      beforeFinalTenths: 90,
      finalTenths: 80,
      totalTenths: 170,
      hasFinal: true,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });

  it('T7b: a final sighter alone still marks the section', () => {
    const results = sessionResults([main(90), finalSighter(100)]);
    expect(results).toEqual({
      beforeFinalTenths: 90,
      finalTenths: 0,
      totalTenths: 90,
      hasFinal: true,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });

  it('WS1: an override series contributes its stored total, not shots (which are empty)', () => {
    const overrideMain: SeriesForResults = {
      isSighter: false,
      isFinal: false,
      shots: [],
      totalOverride: { tenths: 470, shotCount: 5 },
    };
    const results = sessionResults([overrideMain, main(90, 90)]);
    expect(results).toEqual({
      beforeFinalTenths: 650,
      finalTenths: 0,
      totalTenths: 650,
      hasFinal: false,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });

  it('WS1: an override final series contributes to finalTenths', () => {
    const overrideFinal: SeriesForResults = {
      isSighter: false,
      isFinal: true,
      shots: [],
      totalOverride: { tenths: 480, shotCount: 5 },
    };
    const results = sessionResults([main(90), overrideFinal]);
    expect(results).toEqual({
      beforeFinalTenths: 90,
      finalTenths: 480,
      totalTenths: 570,
      hasFinal: true,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });
});

describe('shotVolume (spec T9)', () => {
  it('counts every shot, sighters included', () => {
    expect(shotVolume([mainSighter(100, 100), main(90, 90, 90), final(80)])).toBe(6);
  });

  it('is zero for a session with no shots', () => {
    expect(shotVolume([])).toBe(0);
    expect(shotVolume([main()])).toBe(0);
  });

  it('WS1: an override series contributes its stored shot count, not shots.length', () => {
    const overrideMain: SeriesForResults = {
      isSighter: false,
      isFinal: false,
      shots: [],
      totalOverride: { tenths: 470, shotCount: 5 },
    };
    expect(shotVolume([overrideMain, main(90, 90)])).toBe(7);
  });
});

describe('result-model properties (spec T8)', () => {
  const arbSeries: fc.Arbitrary<SeriesForResults> = fc.record({
    isSighter: fc.boolean(),
    isFinal: fc.boolean(),
    shots: fc.array(fc.record({ valueTenths: fc.integer({ min: 0, max: 109 }) }), {
      maxLength: 10,
    }),
  });

  it('T8: total always equals beforeFinal + final', () => {
    fc.assert(
      fc.property(fc.array(arbSeries, { maxLength: 20 }), (list) => {
        const r = sessionResults(list);
        expect(r.totalTenths).toBe(r.beforeFinalTenths + r.finalTenths);
      }),
    );
  });

  it('T6/T9: adding a sighter series never changes any score, only volume', () => {
    fc.assert(
      fc.property(
        fc.array(arbSeries, { maxLength: 10 }),
        fc.array(fc.integer({ min: 0, max: 109 }), { maxLength: 5 }),
        fc.boolean(),
        (list, sighterValues, inFinal) => {
          const before = sessionResults(list);
          const extra: SeriesForResults = {
            isSighter: true,
            isFinal: inFinal,
            shots: shots(...sighterValues),
          };
          const after = sessionResults([...list, extra]);
          expect(after.beforeFinalTenths).toBe(before.beforeFinalTenths);
          expect(after.finalTenths).toBe(before.finalTenths);
          expect(after.totalTenths).toBe(before.totalTenths);
          expect(shotVolume([...list, extra])).toBe(shotVolume(list) + sighterValues.length);
        },
      ),
    );
  });
});

// --- Amendment A1 §A1.2: session-header stats ---

describe('seriesAverageTenths (spec A-S1..A-S6)', () => {
  const series = (
    values: number[],
    opts: { isSighter?: boolean; isFinal?: boolean } = {},
  ): SeriesForResults => ({
    isSighter: opts.isSighter ?? false,
    isFinal: opts.isFinal ?? false,
    shots: shots(...values),
  });

  it('A-S1: an empty session has no average', () => {
    expect(seriesAverageTenths([])).toBeNull();
  });

  it('A-S2: averages the SERIES totals, not the shots', () => {
    // series totals 430, 440, 450 tenths
    const list = [
      series([90, 90, 90, 80, 80]),
      series([90, 90, 90, 90, 80]),
      series([90, 90, 90, 90, 90]),
    ];
    expect(seriesAverageTenths(list)).toBe(440);
  });

  it('A-S3: sighter series are excluded from the average', () => {
    const list = [
      series([100, 100, 100, 100, 100], { isSighter: true }),
      series([90, 90, 90, 80, 80]),
    ];
    expect(seriesAverageTenths(list)).toBe(430);
  });

  it('A-S4: final series are included in the average', () => {
    const list = [series([90, 90, 90, 80, 80]), series([90, 90, 90, 90, 90], { isFinal: true })];
    expect(seriesAverageTenths(list)).toBe(440);
  });

  it('A-S5: a scored series with no shots yet does not drag the average down', () => {
    const list = [series([90, 90, 90, 80, 80]), series([])];
    expect(seriesAverageTenths(list)).toBe(430);
  });

  it('A-S6: only sighters or only empty series means no average', () => {
    expect(seriesAverageTenths([series([100], { isSighter: true })])).toBeNull();
    expect(seriesAverageTenths([series([])])).toBeNull();
  });

  it('WS1: an override series is averaged in using its stored total', () => {
    const overrideMain: SeriesForResults = {
      isSighter: false,
      isFinal: false,
      shots: [],
      totalOverride: { tenths: 450, shotCount: 5 },
    };
    // 430 and 450 -> 440
    expect(seriesAverageTenths([series([90, 90, 90, 80, 80]), overrideMain])).toBe(440);
  });

  it('WS1: an override series alone produces its own total as the average', () => {
    const overrideMain: SeriesForResults = {
      isSighter: false,
      isFinal: false,
      shots: [],
      totalOverride: { tenths: 450, shotCount: 5 },
    };
    expect(seriesAverageTenths([overrideMain])).toBe(450);
  });
});

describe('sessionInnerTenCount (spec A-S7)', () => {
  const flagged = (values: [number, boolean][], isSighter = false) => ({
    isSighter,
    isFinal: false,
    shots: values.map(([valueTenths, isInnerTen]) => ({ valueTenths, isInnerTen })),
  });

  it('A-S7: counts (X) shots in scored series only', () => {
    const list = [
      flagged([
        [100, true],
        [100, false],
        [90, false],
      ]),
      flagged([[100, true]], true),
      flagged([
        [109, true],
        [98, false],
      ]),
    ];
    expect(sessionInnerTenCount(list)).toBe(2);
  });

  it('A-S7b: no inner tens at all counts 0', () => {
    expect(sessionInnerTenCount([flagged([[100, false]])])).toBe(0);
    expect(sessionInnerTenCount([])).toBe(0);
  });
});

describe('seriesInnerTenAverage (spec docs/specs/session-stats-inner-tens-spec.md IT-1..IT-10)', () => {
  const series = (
    innerTenFlags: boolean[],
    opts: { isSighter?: boolean; isFinal?: boolean; valueTenths?: number } = {},
  ): FlaggedSeriesForResults => ({
    isSighter: opts.isSighter ?? false,
    isFinal: opts.isFinal ?? false,
    shots: innerTenFlags.map((isInnerTen) => ({
      valueTenths: opts.valueTenths ?? (isInnerTen ? 100 : 90),
      isInnerTen,
    })),
  });

  it('IT-1: no series at all means no average', () => {
    expect(seriesInnerTenAverage([])).toBeNull();
  });

  it('IT-2: averages the per-series inner-ten counts', () => {
    const list = [
      series([true, true, false]),
      series([true, false, false]),
      series([false, false, false]),
    ];
    expect(seriesInnerTenAverage(list)).toBe(1);
  });

  it('IT-3: a sighter series is in neither the numerator nor the denominator', () => {
    const list = [series([true, false]), series([true, true, true], { isSighter: true })];
    expect(seriesInnerTenAverage(list)).toBe(1);
  });

  it('IT-4: final series are included', () => {
    const list = [series([false, false]), series([true, true], { isFinal: true })];
    expect(seriesInnerTenAverage(list)).toBe(1);
  });

  it('IT-5: a scored series with no shots yet is not a zero in the denominator', () => {
    expect(seriesInnerTenAverage([series([true]), series([])])).toBe(1);
  });

  it('IT-6: only sighters, or only empty scored series, means no average', () => {
    expect(seriesInnerTenAverage([series([true], { isSighter: true })])).toBeNull();
    expect(seriesInnerTenAverage([series([])])).toBeNull();
  });

  it('IT-7: scored series with no flagged shot average a real 0, not null', () => {
    expect(seriesInnerTenAverage([series([false, false]), series([false])])).toBe(0);
  });

  it('IT-8: decimal shot values count identically — the flag decides, never the value', () => {
    const list = [
      series([true, false], { valueTenths: 109 }),
      series([true, true], { valueTenths: 104 }),
    ];
    expect(seriesInnerTenAverage(list)).toBe(1.5);
  });

  it('IT-9: a WS1 override series counts in the denominator with 0 inner tens', () => {
    const override: FlaggedSeriesForResults = {
      isSighter: false,
      isFinal: false,
      shots: [],
      totalOverride: { tenths: 450, shotCount: 5 },
    };
    expect(seriesInnerTenAverage([series([true, true]), override])).toBe(1);
  });

  it('IT-10: a non-integer average is returned exactly, unrounded', () => {
    const list = [series([true]), series([]), series([false]), series([false])];
    expect(seriesInnerTenAverage(list)).toBe(1 / 3);
  });

  it('IT-P1: equals sessionInnerTenCount over the count of qualifying series', () => {
    const seriesArb = fc.record({
      isSighter: fc.boolean(),
      isFinal: fc.boolean(),
      shots: fc.array(
        fc.record({ valueTenths: fc.integer({ min: 0, max: 109 }), isInnerTen: fc.boolean() }),
        { maxLength: 10 },
      ),
    });

    fc.assert(
      fc.property(fc.array(seriesArb, { maxLength: 12 }), (list) => {
        const qualifying = list.filter((s) => !s.isSighter && s.shots.length > 0);
        const average = seriesInnerTenAverage(list);
        if (qualifying.length === 0) {
          expect(average).toBeNull();
          return;
        }
        expect(average).toBe(sessionInnerTenCount(list) / qualifying.length);
      }),
    );
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_003
 */
it('excludes a sighter from the scored result and counts its shots in volume', () => {
  const shots = (n: number) => Array.from({ length: n }, () => ({ valueTenths: 100 }));
  const series = [
    { isSighter: true, isFinal: false, shots: shots(5) },
    { isSighter: false, isFinal: false, shots: shots(5) },
  ];
  expect(sessionResults(series).totalTenths).toBe(500);
  expect(shotVolume(series)).toBe(10);
});

// --- #727 PR C: a shoot-off decides placement only (spec shoot-off-and-ten-counts-727) ---

describe('shoot-off series (spec S1-S4)', () => {
  const shootOff = (...values: number[]): SeriesForResults => ({
    ...main(...values),
    isShootOff: true,
  });
  const flagged = (
    over: Partial<FlaggedSeriesForResults>,
    ...inner: boolean[]
  ): FlaggedSeriesForResults => ({
    isSighter: false,
    isFinal: false,
    shots: inner.map((isInnerTen) => ({ valueTenths: 100, isInnerTen })),
    ...over,
  });

  it('S1: a shoot-off is summed apart and never enters before-final, final or total', () => {
    expect(sessionResults([main(100, 90), shootOff(100, 100)])).toEqual({
      beforeFinalTenths: 190,
      finalTenths: 0,
      totalTenths: 190,
      hasFinal: false,
      shootOffTenths: 200,
      hasShootOff: true,
    });
  });

  it('S1: with a final, the shoot-off stays out of all three results', () => {
    expect(sessionResults([main(90), final(100), shootOff(80), shootOff(70)])).toEqual({
      beforeFinalTenths: 90,
      finalTenths: 100,
      totalTenths: 190,
      hasFinal: true,
      shootOffTenths: 150,
      hasShootOff: true,
    });
  });

  it('S1: a shoot-off flagged final is still a shoot-off, and does not open a final', () => {
    const r = sessionResults([main(90), { ...shootOff(80), isFinal: true }]);
    expect(r).toMatchObject({ finalTenths: 0, hasFinal: false, shootOffTenths: 80 });
    expect(r.totalTenths).toBe(90);
  });

  it('S1: an override shoot-off contributes its stored total to the shoot-off sum only', () => {
    const override: SeriesForResults = {
      isSighter: false,
      isFinal: false,
      isShootOff: true,
      shots: [],
      totalOverride: { tenths: 470, shotCount: 5 },
    };
    expect(sessionResults([main(100), override])).toMatchObject({
      totalTenths: 100,
      shootOffTenths: 470,
      hasShootOff: true,
    });
  });

  it('S1: a shoot-off sighter marks the section and scores nothing', () => {
    expect(sessionResults([{ ...shootOff(100), isSighter: true }])).toMatchObject({
      shootOffTenths: 0,
      hasShootOff: true,
      totalTenths: 0,
    });
  });

  it('S1: isShootOff false or absent is an ordinary series', () => {
    expect(sessionResults([{ ...main(100), isShootOff: false }, main(90)])).toMatchObject({
      totalTenths: 190,
      shootOffTenths: 0,
      hasShootOff: false,
    });
  });

  it('S2: isScoringSeries is false for a sighter or a shoot-off only', () => {
    expect(isScoringSeries({ isSighter: false })).toBe(true);
    expect(isScoringSeries({ isSighter: false, isShootOff: false })).toBe(true);
    expect(isScoringSeries({ isSighter: true })).toBe(false);
    expect(isScoringSeries({ isSighter: false, isShootOff: true })).toBe(false);
    expect(isScoringSeries({ isSighter: true, isShootOff: true })).toBe(false);
  });

  it('S2: the series average leaves a shoot-off out', () => {
    expect(seriesAverageTenths([main(100), main(80), shootOff(10)])).toBe(90);
    expect(seriesAverageTenths([shootOff(100)])).toBeNull();
  });

  it('S2: inner tens and X per series leave a shoot-off out', () => {
    const list = [
      flagged({}, true, false),
      flagged({ isShootOff: true }, true, true, true),
      flagged({ isShootOff: false }, true),
    ];
    expect(sessionInnerTenCount(list)).toBe(2);
    expect(seriesInnerTenAverage(list)).toBe(1);
    expect(seriesInnerTenAverage([flagged({ isShootOff: true }, true)])).toBeNull();
  });

  it('S3: a shoot-off still counts as volume', () => {
    expect(shotVolume([main(100), shootOff(90, 80)])).toBe(3);
  });

  it('S4: a shoot-off is its own section, after the main round and the final', () => {
    expect(seriesSectionOf({ isFinal: false })).toBe('main');
    expect(seriesSectionOf({ isFinal: false, isShootOff: false })).toBe('main');
    expect(seriesSectionOf({ isFinal: true })).toBe('final');
    expect(seriesSectionOf({ isFinal: false, isShootOff: true })).toBe('shootOff');
    expect(seriesSectionOf({ isFinal: true, isShootOff: true })).toBe('shootOff');
    expect(SERIES_SECTION_ORDER).toEqual(['main', 'final', 'shootOff']);
  });

  const arbAny: fc.Arbitrary<SeriesForResults> = fc.record({
    isSighter: fc.boolean(),
    isFinal: fc.boolean(),
    isShootOff: fc.boolean(),
    shots: fc.array(fc.record({ valueTenths: fc.integer({ min: 0, max: 109 }) }), {
      maxLength: 8,
    }),
  });

  it('S1-P: removing every shoot-off leaves before-final, final and total unchanged', () => {
    fc.assert(
      fc.property(fc.array(arbAny, { maxLength: 15 }), (list) => {
        const all = sessionResults(list);
        const without = sessionResults(list.filter((s) => s.isShootOff !== true));
        expect(all.beforeFinalTenths).toBe(without.beforeFinalTenths);
        expect(all.finalTenths).toBe(without.finalTenths);
        expect(all.totalTenths).toBe(without.totalTenths);
        expect(all.hasFinal).toBe(without.hasFinal);
      }),
    );
  });

  it('S1-P: shootOffTenths is the sum of the non-sighter shoot-off series', () => {
    fc.assert(
      fc.property(fc.array(arbAny, { maxLength: 15 }), (list) => {
        const expected = list
          .filter((s) => s.isShootOff === true && !s.isSighter)
          .reduce((sum, s) => sum + sumValueTenths(s.shots), 0);
        const r = sessionResults(list);
        expect(r.shootOffTenths).toBe(expected);
        expect(r.hasShootOff).toBe(list.some((s) => s.isShootOff === true));
      }),
    );
  });

  it('S2-P: shoot-off series never move the average or the inner-ten figures', () => {
    const arbFlagged: fc.Arbitrary<FlaggedSeriesForResults> = fc.record({
      isSighter: fc.boolean(),
      isFinal: fc.boolean(),
      isShootOff: fc.boolean(),
      shots: fc.array(
        fc.record({ valueTenths: fc.integer({ min: 0, max: 109 }), isInnerTen: fc.boolean() }),
        { maxLength: 8 },
      ),
    });
    fc.assert(
      fc.property(fc.array(arbFlagged, { maxLength: 15 }), (list) => {
        const without = list.filter((s) => s.isShootOff !== true);
        expect(seriesAverageTenths(list)).toBe(seriesAverageTenths(without));
        expect(sessionInnerTenCount(list)).toBe(sessionInnerTenCount(without));
        expect(seriesInnerTenAverage(list)).toBe(seriesInnerTenAverage(without));
      }),
    );
  });
});
