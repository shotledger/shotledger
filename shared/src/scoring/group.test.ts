import { describe, expect, it } from 'vitest';

import { analyzeGroup } from './group';

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

  it('GR6: elevation is positive above the centre (input y increases downward)', () => {
    expect(analyzeGroup([{ xMm: 0, yMm: -5 }])?.elevationMm).toBe(5);
    expect(analyzeGroup([{ xMm: 0, yMm: 5 }])?.elevationMm).toBe(-5);
  });

  it('GR7: windage is positive to the right of the centre', () => {
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
