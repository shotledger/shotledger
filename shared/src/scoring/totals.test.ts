import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  countInnerTens,
  sessionResults,
  shotVolume,
  sumValueTenths,
  tenthsToScore,
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
    });
  });

  it('T4: without final series the total is the main-round sum', () => {
    const results = sessionResults([main(90, 100, 80), main(70, 90, 100)]);
    expect(results).toEqual({
      beforeFinalTenths: 530,
      finalTenths: 0,
      totalTenths: 530,
      hasFinal: false,
    });
  });

  it('T5: with final series all three results are reported', () => {
    const results = sessionResults([main(90, 100), main(80, 80), final(100, 100)]);
    expect(results).toEqual({
      beforeFinalTenths: 350,
      finalTenths: 200,
      totalTenths: 550,
      hasFinal: true,
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
    });
  });

  it('T7b: a final sighter alone still marks the section', () => {
    const results = sessionResults([main(90), finalSighter(100)]);
    expect(results).toEqual({
      beforeFinalTenths: 90,
      finalTenths: 0,
      totalTenths: 90,
      hasFinal: true,
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
