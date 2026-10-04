import { describe, expect, it } from 'vitest';

import { isPastCompetition, isUpcomingCompetition } from './competition-dates';

const NOW = new Date(2026, 8, 12, 14, 30); // 2026-09-12 local, mid-afternoon

describe('competition date boundaries', () => {
  it('counts today as both upcoming and past', () => {
    // A competition today may not have been shot yet, and may already have
    // results posted. Excluding it from either screen hides the one
    // competition the shooter is most likely looking for.
    expect(isUpcomingCompetition('2026-09-12', NOW)).toBe(true);
    expect(isPastCompetition('2026-09-12', NOW)).toBe(true);
  });

  it('puts tomorrow only in upcoming', () => {
    expect(isUpcomingCompetition('2026-09-13', NOW)).toBe(true);
    expect(isPastCompetition('2026-09-13', NOW)).toBe(false);
  });

  it('puts yesterday only in past', () => {
    expect(isUpcomingCompetition('2026-09-11', NOW)).toBe(false);
    expect(isPastCompetition('2026-09-11', NOW)).toBe(true);
  });

  it('does not shift the boundary for anyone east or west of UTC', () => {
    // `new Date('2026-09-12')` is UTC midnight, which is 2026-09-11 in the
    // Americas — the old check turned today's competition into yesterday's
    // for half the world. String comparison has no such failure mode.
    expect(isUpcomingCompetition('2026-09-12', new Date(2026, 8, 12, 0, 1))).toBe(true);
    expect(isUpcomingCompetition('2026-09-12', new Date(2026, 8, 12, 23, 59))).toBe(true);
  });

  it('tolerates a full timestamp as well as a bare date', () => {
    expect(isUpcomingCompetition('2026-09-13 09:00:00', NOW)).toBe(true);
    expect(isPastCompetition('2026-09-11 09:00:00', NOW)).toBe(true);
    // Unsliced, '2026-09-12 09:00:00' sorts after '2026-09-12' and today
    // would stop counting as past.
    expect(isPastCompetition('2026-09-12 09:00:00', NOW)).toBe(true);
  });

  it('handles a year boundary', () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 0);
    expect(isUpcomingCompetition('2027-01-01', newYearsEve)).toBe(true);
    expect(isPastCompetition('2027-01-01', newYearsEve)).toBe(false);
  });
});
