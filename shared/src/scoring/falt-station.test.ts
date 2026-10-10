// docs/specs/web-falt-entry-spec.md S1–S5: the phone's station rules, moved.
import { describe, expect, it } from 'vitest';

import {
  clampFiguresHit,
  figuresHitRange,
  isBlankStation,
  stationPoints,
  stationProblem,
} from './falt-station';

const station = (patch: Partial<Parameters<typeof stationProblem>[0]> = {}) => ({
  position: 3,
  hits: 0,
  figuresHit: 0,
  figureCount: null,
  points: null,
  pointsMax: null,
  ...patch,
});

describe('stationProblem', () => {
  it('S1 stationProblem: null for a possible station, the phone’s message for each impossible one', () => {
    expect(stationProblem(station({ hits: 6, figuresHit: 3 }))).toBeNull();
    expect(stationProblem(station())).toBeNull();
    expect(stationProblem({ position: 1, hits: 0, figuresHit: 0 })).toBeNull();
    expect(
      stationProblem(
        station({ hits: 6, figuresHit: 6, figureCount: 6, points: 10, pointsMax: 10 }),
      ),
    ).toBeNull();
    expect(stationProblem(station({ hits: 1, figuresHit: 1, figureCount: 1 }))).toBeNull();
    expect(stationProblem(station({ points: 0 }))).toBeNull();
    expect(stationProblem(station({ points: 4 }))).toBeNull();

    expect(stationProblem(station({ hits: 7 }))).toBe(
      'station 3: hits must be an integer 0-6, got 7',
    );
    expect(stationProblem(station({ hits: -1 }))).toBe(
      'station 3: hits must be an integer 0-6, got -1',
    );
    expect(stationProblem(station({ hits: 1.5, figuresHit: 1 }))).toBe(
      'station 3: hits must be an integer 0-6, got 1.5',
    );
    expect(stationProblem(station({ hits: 3, figuresHit: 4 }))).toBe(
      'station 3: figuresHit must be an integer 0-3, got 4',
    );
    expect(stationProblem(station({ hits: 3, figuresHit: -1 }))).toBe(
      'station 3: figuresHit must be an integer 0-3, got -1',
    );
    expect(stationProblem(station({ hits: 3, figuresHit: 1.5 }))).toBe(
      'station 3: figuresHit must be an integer 0-3, got 1.5',
    );
    expect(stationProblem(station({ hits: 2, figuresHit: 0 }))).toBe(
      'station 3: 2 hits cannot be spread over 0 figures',
    );
    expect(stationProblem(station({ figureCount: 0 }))).toBe(
      'station 3: figureCount must be an integer 1-6 or null, got 0',
    );
    expect(stationProblem(station({ figureCount: 7 }))).toBe(
      'station 3: figureCount must be an integer 1-6 or null, got 7',
    );
    expect(stationProblem(station({ figureCount: 2.5 }))).toBe(
      'station 3: figureCount must be an integer 1-6 or null, got 2.5',
    );
    expect(stationProblem(station({ hits: 4, figuresHit: 3, figureCount: 2 }))).toBe(
      'station 3: 3 figures hit of 2',
    );
    expect(stationProblem(station({ points: -1 }))).toBe(
      'station 3: points must be a non-negative integer or null, got -1',
    );
    expect(stationProblem(station({ points: 1.5 }))).toBe(
      'station 3: points must be a non-negative integer or null, got 1.5',
    );
    expect(stationProblem(station({ points: 12, pointsMax: 10 }))).toBe(
      'station 3: 12 points on a poängmål worth 10',
    );

    // Struck out: whatever was written stays a record.
    expect(stationProblem(station({ hits: 9, figuresHit: 12, isScratched: true }))).toBeNull();
    expect(stationProblem(station({ hits: 9, isScratched: false }))).not.toBeNull();
  });
});

describe('figuresHitRange', () => {
  it('S2 figuresHitRange: 0..0 without hits, 1..min(hits, figures) with', () => {
    expect(figuresHitRange(0, null)).toEqual({ min: 0, max: 0 });
    expect(figuresHitRange(0, 4)).toEqual({ min: 0, max: 0 });
    expect(figuresHitRange(4, null)).toEqual({ min: 1, max: 4 });
    expect(figuresHitRange(6, null)).toEqual({ min: 1, max: 6 });
    expect(figuresHitRange(5, 3)).toEqual({ min: 1, max: 3 });
    expect(figuresHitRange(2, 6)).toEqual({ min: 1, max: 2 });
  });
});

describe('clampFiguresHit', () => {
  it('S3 clampFiguresHit moves Figures Hit as the phone’s screen does', () => {
    expect(clampFiguresHit(3, 1, null)).toBe(1);
    expect(clampFiguresHit(0, 4, null)).toBe(1);
    expect(clampFiguresHit(5, 6, 2)).toBe(2);
    expect(clampFiguresHit(3, 0, null)).toBe(0);
    expect(clampFiguresHit(3, 0, 5)).toBe(0);
    // Inside the range, nothing moves.
    expect(clampFiguresHit(2, 4, null)).toBe(2);
    expect(clampFiguresHit(2, 4, 3)).toBe(2);
    expect(clampFiguresHit(0, 0, null)).toBe(0);
  });
});

describe('stationPoints', () => {
  it('S4 stationPoints: blank is null, whole numbers parse, the rest is invalid, a max without points is dropped', () => {
    expect(stationPoints('', '')).toEqual({ ok: true, points: null, pointsMax: null });
    expect(stationPoints('  ', ' ')).toEqual({ ok: true, points: null, pointsMax: null });
    expect(stationPoints('12', '20')).toEqual({ ok: true, points: 12, pointsMax: 20 });
    expect(stationPoints(' 12 ', ' 20 ')).toEqual({ ok: true, points: 12, pointsMax: 20 });
    expect(stationPoints('0', '')).toEqual({ ok: true, points: 0, pointsMax: null });
    expect(stationPoints('10', '10')).toEqual({ ok: true, points: 10, pointsMax: 10 });
    expect(stationPoints('', '20')).toEqual({ ok: true, points: null, pointsMax: null });

    expect(stationPoints('x', '')).toEqual({ ok: false });
    expect(stationPoints('1.5', '')).toEqual({ ok: false });
    expect(stationPoints('-1', '')).toEqual({ ok: false });
    expect(stationPoints('1 2', '')).toEqual({ ok: false });
    expect(stationPoints('12', '10')).toEqual({ ok: false });
    expect(stationPoints('', 'x')).toEqual({ ok: false });
    expect(stationPoints('3', 'x')).toEqual({ ok: false });
  });
});

describe('isBlankStation', () => {
  it('S5 isBlankStation: only 0 hits, no figure count, no points and no flag is blank', () => {
    const blank = {
      hits: 0,
      figureCount: null,
      points: null,
      isScratched: false,
      isShootOff: false,
    };
    expect(isBlankStation(blank)).toBe(true);
    expect(isBlankStation({ ...blank, hits: 1 })).toBe(false);
    expect(isBlankStation({ ...blank, figureCount: 4 })).toBe(false);
    expect(isBlankStation({ ...blank, points: 0 })).toBe(false);
    expect(isBlankStation({ ...blank, isScratched: true })).toBe(false);
    expect(isBlankStation({ ...blank, isShootOff: true })).toBe(false);
  });
});
