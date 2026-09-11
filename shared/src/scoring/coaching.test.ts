import { describe, expect, it } from 'vitest';

import { coachingHint, MIN_SHOTS_FOR_COACHING } from './coaching';
import type { GroupAnalysis, PointsLostAnalysis } from './group';

const group = (patch: Partial<GroupAnalysis> = {}): GroupAnalysis => ({
  shotCount: 20,
  mpiMm: { xMm: 0, yMm: 0 },
  windageMm: 0,
  elevationMm: 0,
  meanRadiusMm: 10,
  extremeSpreadMm: 30,
  ...patch,
});

const lost = (position: number, size: number): PointsLostAnalysis => ({
  actualScore: 0,
  recenteredScore: 0,
  maxScore: 0,
  pointsLostToPosition: position,
  pointsLostToSize: size,
});

describe('coachingHint', () => {
  it('says nothing without a group or a breakdown', () => {
    expect(coachingHint(null, lost(5, 5))).toBeNull();
    expect(coachingHint(group(), null)).toBeNull();
  });

  it('refuses to advise on too few shots', () => {
    const hint = coachingHint(group({ shotCount: MIN_SHOTS_FOR_COACHING - 1 }), lost(9, 1))!;
    expect(hint.kind).toBe('sample');
    // No numbers offered — there is nothing to base them on.
    expect(hint.pointsToPosition).toBeUndefined();
  });

  it('names the sights when position dominates', () => {
    expect(coachingHint(group(), lost(9, 2))!.kind).toBe('adjustSights');
  });

  it('names the group when spread dominates', () => {
    expect(coachingHint(group(), lost(2, 9))!.kind).toBe('tightenGroup');
  });

  it('refuses to pick when the two are close', () => {
    // 5 vs 6 — either answer would be arbitrary.
    expect(coachingHint(group(), lost(5, 6))!.kind).toBe('balanced');
  });

  it('says the shooting is fine when almost nothing was lost', () => {
    expect(coachingHint(group(), lost(0.3, 0.4))!.kind).toBe('onTarget');
  });

  it('does not send you to the sights on a flier-dragged MPI', () => {
    // pointsLostToPosition goes negative when recentring would score WORSE
    // (group.ts §9.1). Recovering nothing by moving means the spread is the
    // story, not the sights.
    const hint = coachingHint(group(), lost(-3, 8))!;
    expect(hint.kind).toBe('tightenGroup');
    expect(hint.pointsToPosition).toBe(0);
  });

  it('carries the offset so the advice can say which way', () => {
    const hint = coachingHint(group({ windageMm: -12, elevationMm: -20 }), lost(9, 2))!;
    expect(hint.windageMm).toBe(-12);
    expect(hint.elevationMm).toBe(-20);
  });

  it('is stable either side of the sample threshold', () => {
    expect(coachingHint(group({ shotCount: MIN_SHOTS_FOR_COACHING }), lost(9, 2))!.kind).toBe(
      'adjustSights',
    );
    expect(coachingHint(group({ shotCount: MIN_SHOTS_FOR_COACHING - 1 }), lost(9, 2))!.kind).toBe(
      'sample',
    );
  });
});
