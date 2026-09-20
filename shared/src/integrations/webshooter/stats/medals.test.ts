import { describe, expect, it } from 'vitest';
import type { CompetitionResultForStats } from './pb';
import {
  betterMedal,
  dualPathMedal,
  fixedThresholdMedal,
  MEDAL_RANK,
  relativePlacementMedal,
} from './medals';

function result(overrides: Partial<CompetitionResultForStats> = {}): CompetitionResultForStats {
  return {
    sessionId: 's',
    competitionType: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    date: '2026-06-13',
    beforeFinalTenths: 3300,
    beforeFinalSeriesCount: 7,
    totalTenths: 3300,
    totalSeriesCount: 7,
    figureHits: 0,
    innerTens: 0,
    ...overrides,
  };
}

describe('fixedThresholdMedal', () => {
  it('reuses standardMedalForSession for a precision 7-series result meeting silver (330)', () => {
    expect(fixedThresholdMedal(result({ beforeFinalTenths: 3300, totalTenths: 3300 }))).toBe(
      'silver',
    );
  });

  it('returns brons for a score between brons (322) and silver (330), weapon group C', () => {
    expect(fixedThresholdMedal(result({ beforeFinalTenths: 3250, totalTenths: 3250 }))).toBe(
      'brons',
    );
  });

  it('returns null below brons', () => {
    expect(fixedThresholdMedal(result({ beforeFinalTenths: 1000, totalTenths: 1000 }))).toBeNull();
  });

  it('derives hasFinal from series counts and evaluates the grundomgång when a final exists', () => {
    const withFinal = result({
      beforeFinalTenths: 3300,
      beforeFinalSeriesCount: 7,
      totalTenths: 4000,
      totalSeriesCount: 10,
    });
    expect(fixedThresholdMedal(withFinal)).toBe('silver');
  });

  it('evaluates the total (not beforeFinal) when series counts are equal — hasFinal is false', () => {
    const noFinal = result({
      beforeFinalTenths: 1000, // would be null on its own
      beforeFinalSeriesCount: 7,
      totalTenths: 3300, // silver
      totalSeriesCount: 7,
    });
    expect(fixedThresholdMedal(noFinal)).toBe('silver');
  });
});

describe('relativePlacementMedal', () => {
  it('silver for placement within the best 1/9, rounded down', () => {
    // fieldSize 27 -> floor(27/9) = 3
    expect(relativePlacementMedal({ placement: 3, fieldSize: 27 })).toBe('silver');
    expect(relativePlacementMedal({ placement: 4, fieldSize: 27 })).not.toBe('silver');
  });

  it('brons for placement within the best 1/3, rounded down, but outside silver', () => {
    // fieldSize 27 -> floor(27/3) = 9
    expect(relativePlacementMedal({ placement: 9, fieldSize: 27 })).toBe('brons');
  });

  it('null outside both cutoffs', () => {
    expect(relativePlacementMedal({ placement: 10, fieldSize: 27 })).toBeNull();
  });

  it('extends the cutoff by tiedAtCutoffCount (ties included at the cutoff)', () => {
    expect(relativePlacementMedal({ placement: 4, fieldSize: 27, tiedAtCutoffCount: 1 })).toBe(
      'silver',
    );
  });

  it('extends the brons cutoff specifically by tiedAtCutoffCount', () => {
    // fieldSize 27 -> floor(27/3) = 9, +1 tie = 10
    expect(relativePlacementMedal({ placement: 10, fieldSize: 27, tiedAtCutoffCount: 1 })).toBe(
      'brons',
    );
    expect(relativePlacementMedal({ placement: 10, fieldSize: 27 })).toBeNull();
  });

  it('handles a tiny field (fieldSize < 9): floor(3/9)=0 silver cutoff, floor(3/3)=1 brons cutoff', () => {
    expect(relativePlacementMedal({ placement: 1, fieldSize: 3 })).toBe('brons');
    expect(relativePlacementMedal({ placement: 2, fieldSize: 3 })).toBeNull();
  });
});

describe('MEDAL_RANK / betterMedal', () => {
  it('ranks guld > silver > brons > none', () => {
    expect(MEDAL_RANK.guld).toBeGreaterThan(MEDAL_RANK.silver);
    expect(MEDAL_RANK.silver).toBeGreaterThan(MEDAL_RANK.brons);
    expect(MEDAL_RANK.brons).toBeGreaterThan(MEDAL_RANK.none);
  });

  it('betterMedal returns the higher-ranked medal', () => {
    expect(betterMedal('silver', 'brons')).toBe('silver');
    expect(betterMedal('brons', 'silver')).toBe('silver');
  });

  it('betterMedal treats an equal rank as the first argument (tie)', () => {
    expect(betterMedal('silver', 'silver')).toBe('silver');
  });
});

describe('dualPathMedal', () => {
  it('picks fixed when it is better', () => {
    expect(dualPathMedal('silver', 'brons')).toEqual({ grade: 'silver', source: 'fixed' });
  });

  it('picks relative when it is better', () => {
    expect(dualPathMedal('brons', 'silver')).toEqual({ grade: 'silver', source: 'relative' });
  });

  it('is a tie when both agree on the same non-none grade', () => {
    expect(dualPathMedal('silver', 'silver')).toEqual({ grade: 'silver', source: 'tie' });
  });

  it('is null/tie when both paths are null', () => {
    expect(dualPathMedal(null, null)).toEqual({ grade: null, source: 'tie' });
  });

  it('picks the relative path when the fixed path is null', () => {
    expect(dualPathMedal(null, 'brons')).toEqual({ grade: 'brons', source: 'relative' });
  });

  it('picks the fixed path when the relative path is null', () => {
    expect(dualPathMedal('brons', null)).toEqual({ grade: 'brons', source: 'fixed' });
  });
});
