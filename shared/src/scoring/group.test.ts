import { describe, expect, it } from 'vitest';

import { CALIBER_MM } from '../target-scoring/score';
import { SPSF_PISTOL_25M_PRECISION } from '../target-scoring/targets';
import { analyzeGroup, analyzePointsLost } from './group';

const CALIBER_22 = CALIBER_MM['.22'] as number;
const FACE = SPSF_PISTOL_25M_PRECISION;

function mark(xMm: number, yMm: number, caliberMm = CALIBER_22) {
  return { xMm, yMm, caliberMm };
}

describe('analyzeGroup', () => {
  it('GR1: returns null for an empty group', () => {
    expect(analyzeGroup([])).toBeNull();
  });

  it('GR2: a single shot is its own MPI with zero spread', () => {
    const result = analyzeGroup([{ xMm: 3, yMm: -4 }]);
    expect(result).toEqual({
      shotCount: 1,
      mpiMm: { xMm: 3, yMm: -4 },
      windageMm: 3,
      elevationMm: 4,
      meanRadiusMm: 0,
      extremeSpreadMm: 0,
    });
  });

  it('GR3: a group symmetric about the origin has a zero MPI', () => {
    const result = analyzeGroup([
      { xMm: 10, yMm: 0 },
      { xMm: -10, yMm: 0 },
      { xMm: 0, yMm: 10 },
      { xMm: 0, yMm: -10 },
    ]);
    expect(result?.mpiMm).toEqual({ xMm: 0, yMm: 0 });
    expect(result?.windageMm).toBe(0);
    expect(result?.elevationMm).toBe(0);
  });

  it('GR4: mean radius is the mean distance from the MPI', () => {
    const result = analyzeGroup([
      { xMm: 10, yMm: 0 },
      { xMm: -10, yMm: 0 },
      { xMm: 0, yMm: 10 },
      { xMm: 0, yMm: -10 },
    ]);
    expect(result?.meanRadiusMm).toBeCloseTo(10, 12);
    expect(result?.extremeSpreadMm).toBeCloseTo(20, 12);
  });

  it('GR5: extreme spread is the max PAIRWISE distance, not the max from the MPI', () => {
    const result = analyzeGroup([
      { xMm: 0, yMm: 0 },
      { xMm: 10, yMm: 0 },
      { xMm: 30, yMm: 0 },
    ]);
    expect(result?.extremeSpreadMm).toBeCloseTo(30, 12);
    expect(result?.mpiMm.xMm).toBeCloseTo(40 / 3, 12);
    // distances from the MPI: 40/3, 10/3, 50/3 -> mean 100/9
    expect(result?.meanRadiusMm).toBeCloseTo(100 / 9, 12);
    // and the max-from-MPI (50/3 = 16.67) is emphatically not the spread
    expect(result?.extremeSpreadMm).not.toBeCloseTo(50 / 3, 6);
  });

  it('GR6: elevation is positive above the center (input y increases downward)', () => {
    expect(analyzeGroup([{ xMm: 0, yMm: -5 }])?.elevationMm).toBe(5);
    expect(analyzeGroup([{ xMm: 0, yMm: 5 }])?.elevationMm).toBe(-5);
  });

  it('GR7: windage is positive to the right of the center', () => {
    expect(analyzeGroup([{ xMm: 7, yMm: 0 }])?.windageMm).toBe(7);
    expect(analyzeGroup([{ xMm: -7, yMm: 0 }])?.windageMm).toBe(-7);
  });

  it('GR8: a degenerate group of identical shots is legal, not an error', () => {
    const shots = Array.from({ length: 5 }, () => ({ xMm: 2, yMm: 2 }));
    const result = analyzeGroup(shots);
    expect(result?.meanRadiusMm).toBe(0);
    expect(result?.extremeSpreadMm).toBe(0);
    expect(result?.shotCount).toBe(5);
  });

  it('GR9: shotCount is the input length', () => {
    expect(analyzeGroup([{ xMm: 1, yMm: 1 }])?.shotCount).toBe(1);
    expect(
      analyzeGroup([
        { xMm: 1, yMm: 1 },
        { xMm: 2, yMm: 2 },
        { xMm: 3, yMm: 3 },
      ])?.shotCount,
    ).toBe(3);
  });

  it('GR10: a non-finite coordinate throws rather than poisoning every statistic', () => {
    expect(() => analyzeGroup([{ xMm: Number.NaN, yMm: 0 }])).toThrow(RangeError);
    // the message names the offending pair — that is what makes a bug report
    // from the field actionable
    expect(() => analyzeGroup([{ xMm: Number.NaN, yMm: 0 }])).toThrow(
      'group coordinates must be finite, got (NaN, 0)',
    );
    expect(() => analyzeGroup([{ xMm: 0, yMm: Number.POSITIVE_INFINITY }])).toThrow(RangeError);
    expect(() =>
      analyzeGroup([
        { xMm: 1, yMm: 1 },
        { xMm: 0, yMm: Number.NEGATIVE_INFINITY },
      ]),
    ).toThrow(RangeError);
  });
});

describe('analyzePointsLost', () => {
  it('PL1: returns null for an empty group', () => {
    expect(analyzePointsLost([], FACE)).toBeNull();
  });

  it('PL2: a single mark dead center scores actual = recentered = max', () => {
    const result = analyzePointsLost([mark(0, 0)], FACE);
    expect(result).toEqual({
      actualScore: 10,
      recenteredScore: 10,
      maxScore: 10,
      pointsLostToPosition: 0,
      pointsLostToSize: 0,
    });
  });

  it('PL3: recentering a single-mark group always lands it on center', () => {
    // 60,80 is ring 7 (radius 100, minus caliber) off-center, actual = 7 -
    // but a lone mark's MPI IS the mark, so recentering it always yields 0,0.
    const result = analyzePointsLost([mark(60, 80)], FACE);
    expect(result?.actualScore).toBe(7);
    expect(result?.recenteredScore).toBe(result?.maxScore);
    expect(result?.pointsLostToSize).toBe(0);
  });

  it('PL4: a group whose MPI is already at target center has recentered === actual', () => {
    const marks = [mark(100, 0), mark(-100, 0), mark(0, 100), mark(0, -100)];
    const result = analyzePointsLost(marks, FACE);
    expect(result?.recenteredScore).toBe(result?.actualScore);
  });

  it('PL5: a tight off-center group loses mostly to position, nothing to size', () => {
    const marks = [mark(95, 5), mark(100, -5), mark(105, 0)];
    const result = analyzePointsLost(marks, FACE);
    expect(result).toEqual({
      actualScore: 20,
      recenteredScore: 30,
      maxScore: 30,
      pointsLostToPosition: 10,
      pointsLostToSize: 0,
    });
  });

  it('PL6: a loose group already centered loses nothing to position, only to size', () => {
    const marks = [mark(100, 0), mark(-100, 0), mark(0, 100), mark(0, -100)];
    const result = analyzePointsLost(marks, FACE);
    expect(result).toEqual({
      actualScore: 28,
      recenteredScore: 28,
      maxScore: 40,
      pointsLostToPosition: 0,
      pointsLostToSize: 12,
    });
  });

  it('PL7: points lost to size is never negative', () => {
    for (const marks of [
      [mark(0, 0)],
      [mark(95, 5), mark(100, -5), mark(105, 0)],
      [mark(100, 0), mark(-100, 0), mark(0, 100), mark(0, -100)],
      [mark(0, 0), mark(0, 0), mark(300, 0)],
    ]) {
      expect(analyzePointsLost(marks, FACE)?.pointsLostToSize).toBeGreaterThanOrEqual(0);
    }
  });

  it('PL8: actual + pointsLostToPosition + pointsLostToSize === maxScore', () => {
    for (const marks of [
      [mark(0, 0)],
      [mark(95, 5), mark(100, -5), mark(105, 0)],
      [mark(0, 0), mark(0, 0), mark(300, 0)],
    ]) {
      const result = analyzePointsLost(marks, FACE);
      if (!result) throw new Error('expected a result');
      expect(result.actualScore + result.pointsLostToPosition + result.pointsLostToSize).toBe(
        result.maxScore,
      );
    }
  });

  it('PL9: a called flier can make points lost to position negative', () => {
    // two marks dead center, one 300mm out: recentering pulls the MPI toward
    // the flier and drags the two centered marks off the X ring.
    const marks = [mark(0, 0), mark(0, 0), mark(300, 0)];
    const result = analyzePointsLost(marks, FACE);
    expect(result).toEqual({
      actualScore: 20,
      recenteredScore: 17,
      maxScore: 30,
      pointsLostToPosition: -3,
      pointsLostToSize: 13,
    });
  });
});
