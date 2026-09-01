import { describe, expect, it } from 'vitest';
import { officialPbScore, type CompetitionResultForStats } from './index.js';

describe('webshooter stats barrel export', () => {
  it('re-exports pb.ts', () => {
    const result: CompetitionResultForStats = {
      sessionId: 's',
      competitionType: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      date: '2026-06-13',
      beforeFinalTenths: 300,
      beforeFinalSeriesCount: 7,
      totalTenths: 300,
      totalSeriesCount: 7,
      figureHits: 0,
      innerTens: 0,
    };
    expect(officialPbScore(result)).toBe(300);
  });
});
