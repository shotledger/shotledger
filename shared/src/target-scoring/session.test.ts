import { describe, expect, it } from 'vitest';

import { createKeypadState } from '../scoring/entry';
import { CALIBER_MM, type Hole, type ScoreResult } from './score';
import {
  scoreResultToEntryShot,
  scoreSeries,
  seriesNeedsReview,
  seriesToEntryShots,
} from './session';
import { SPSF_PISTOL_25M_PRECISION } from './targets';

const CALIBER_22 = CALIBER_MM['.22'] as number; // known-present preset key

function result(value: number, isInnerTen: boolean, edgeCall = false): ScoreResult {
  return { ringLabel: String(value), value, isInnerTen, marginMm: edgeCall ? 0.5 : 5, edgeCall };
}

function holeAtRadius(radiusMm: number): Hole {
  return { centerMm: { x: radiusMm, y: 0 }, caliberMm: CALIBER_22 };
}

describe('scoreResultToEntryShot', () => {
  it('SE1: a ring-7 shot maps to {70, false}', () => {
    expect(scoreResultToEntryShot(result(7, false))).toEqual({
      valueTenths: 70,
      isInnerTen: false,
    });
  });

  it('SE2: an X shot maps to {100, true}', () => {
    expect(scoreResultToEntryShot(result(10, true))).toEqual({
      valueTenths: 100,
      isInnerTen: true,
    });
  });

  it('SE3: a miss maps to {0, false}', () => {
    expect(scoreResultToEntryShot(result(0, false))).toEqual({ valueTenths: 0, isInnerTen: false });
  });
});

describe('scoreSeries', () => {
  it('SE4: scores every hole, in input order', () => {
    const holes: Hole[] = [holeAtRadius(0), holeAtRadius(100), holeAtRadius(600)];
    const results = scoreSeries(holes, SPSF_PISTOL_25M_PRECISION);
    // Ring 7 is 200 mm across; a .22 hole centred 100 mm out reaches 97.2 mm.
    expect(results.map((r) => r.ringLabel)).toEqual(['X', '7', '0']);
  });
});

describe('seriesToEntryShots', () => {
  it('SE5: every output satisfies entry.ts own valueTenths invariant', () => {
    const holes: Hole[] = [holeAtRadius(0), holeAtRadius(60), holeAtRadius(150), holeAtRadius(600)];
    const shots = seriesToEntryShots(holes, SPSF_PISTOL_25M_PRECISION);
    // Nearest hole edges at 0, 57.2, 147.2 and 597.2 mm against ring radii X 12.5,
    // 8 75, 5 150 and 1 250 (SHB F.7.1).
    expect(shots).toEqual([
      { valueTenths: 100, isInnerTen: true },
      { valueTenths: 80, isInnerTen: false },
      { valueTenths: 50, isInnerTen: false },
      { valueTenths: 0, isInnerTen: false },
    ]);
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: shots.length, shots }),
    ).not.toThrow();
  });
});

describe('seriesNeedsReview', () => {
  it('SE6: empty series never needs review', () => {
    expect(seriesNeedsReview([])).toBe(false);
  });

  it('SE7: one edge call among several is enough', () => {
    const results = [result(9, false, false), result(8, false, true), result(7, false, false)];
    expect(seriesNeedsReview(results)).toBe(true);
  });

  it('SE8: no edge calls at all', () => {
    const results = [result(9, false, false), result(8, false, false)];
    expect(seriesNeedsReview(results)).toBe(false);
  });
});
