import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CALIBER_MM } from '../target-scoring/score';
import { SPSF_PISTOL_25M_PRECISION } from '../target-scoring/targets';
import type { GroupPoint } from './group';
import { analyzeGroup, analyzePointsLost } from './group';

/** Coordinates a real target can hold, kept well inside float precision. */
const coord = fc.double({ min: -600, max: 600, noNaN: true, noDefaultInfinity: true });
const points = fc.array(fc.record({ xMm: coord, yMm: coord }), { minLength: 1, maxLength: 40 });

const CALIBER_22 = CALIBER_MM['.22'] as number;
const FACE = SPSF_PISTOL_25M_PRECISION;
const marks = fc
  .array(fc.record({ xMm: coord, yMm: coord }), { minLength: 1, maxLength: 40 })
  .map((ps) => ps.map((p) => ({ ...p, caliberMm: CALIBER_22 })));

function require_(points: readonly GroupPoint[]) {
  const result = analyzeGroup(points);
  if (!result) throw new Error('expected a non-null analysis for a non-empty group');
  return result;
}

describe('analyzeGroup properties', () => {
  it('GP1: translating the group shifts the MPI and leaves the spread alone', () => {
    fc.assert(
      fc.property(points, coord, coord, (ps, dx, dy) => {
        const base = require_(ps);
        const moved = require_(ps.map((p) => ({ xMm: p.xMm + dx, yMm: p.yMm + dy })));
        expect(moved.mpiMm.xMm).toBeCloseTo(base.mpiMm.xMm + dx, 6);
        expect(moved.mpiMm.yMm).toBeCloseTo(base.mpiMm.yMm + dy, 6);
        expect(moved.meanRadiusMm).toBeCloseTo(base.meanRadiusMm, 6);
        expect(moved.extremeSpreadMm).toBeCloseTo(base.extremeSpreadMm, 6);
      }),
    );
  });

  it('GP2: rotating the group about the origin leaves the spread alone', () => {
    fc.assert(
      fc.property(points, fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (ps, th) => {
        const cos = Math.cos(th);
        const sin = Math.sin(th);
        const base = require_(ps);
        const spun = require_(
          ps.map((p) => ({ xMm: p.xMm * cos - p.yMm * sin, yMm: p.xMm * sin + p.yMm * cos })),
        );
        expect(spun.meanRadiusMm).toBeCloseTo(base.meanRadiusMm, 6);
        expect(spun.extremeSpreadMm).toBeCloseTo(base.extremeSpreadMm, 6);
      }),
    );
  });

  it('GP3: scaling the group scales both spread measures by the same factor', () => {
    fc.assert(
      fc.property(points, fc.double({ min: 0.01, max: 100, noNaN: true }), (ps, k) => {
        const base = require_(ps);
        const scaled = require_(ps.map((p) => ({ xMm: p.xMm * k, yMm: p.yMm * k })));
        expect(scaled.meanRadiusMm).toBeCloseTo(base.meanRadiusMm * k, 6);
        expect(scaled.extremeSpreadMm).toBeCloseTo(base.extremeSpreadMm * k, 6);
      }),
    );
  });

  it('GP4: the analysis does not depend on the order of the shots', () => {
    fc.assert(
      fc.property(points, (ps) => {
        const base = require_(ps);
        const shuffled = require_([...ps].reverse());
        expect(shuffled.mpiMm.xMm).toBeCloseTo(base.mpiMm.xMm, 9);
        expect(shuffled.mpiMm.yMm).toBeCloseTo(base.mpiMm.yMm, 9);
        expect(shuffled.meanRadiusMm).toBeCloseTo(base.meanRadiusMm, 9);
        expect(shuffled.extremeSpreadMm).toBeCloseTo(base.extremeSpreadMm, 9);
      }),
    );
  });

  it('GP5: mean radius never exceeds extreme spread', () => {
    fc.assert(
      fc.property(points, (ps) => {
        const result = require_(ps);
        expect(result.meanRadiusMm).toBeLessThanOrEqual(result.extremeSpreadMm + 1e-9);
      }),
    );
  });
});

describe('analyzePointsLost properties', () => {
  it('PP1: points lost to size is never negative (spec §9.1)', () => {
    fc.assert(
      fc.property(marks, (ms) => {
        const result = analyzePointsLost(ms, FACE);
        if (!result) throw new Error('expected a non-null analysis for a non-empty group');
        expect(result.pointsLostToSize).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('PP2: actual + pointsLostToPosition + pointsLostToSize === maxScore (spec §9.3 PL8)', () => {
    fc.assert(
      fc.property(marks, (ms) => {
        const result = analyzePointsLost(ms, FACE);
        if (!result) throw new Error('expected a non-null analysis for a non-empty group');
        expect(
          result.actualScore + result.pointsLostToPosition + result.pointsLostToSize,
        ).toBeCloseTo(result.maxScore, 9);
      }),
    );
  });

  it('PP3: recenteredScore never exceeds maxScore', () => {
    fc.assert(
      fc.property(marks, (ms) => {
        const result = analyzePointsLost(ms, FACE);
        if (!result) throw new Error('expected a non-null analysis for a non-empty group');
        expect(result.recenteredScore).toBeLessThanOrEqual(result.maxScore);
      }),
    );
  });
});
