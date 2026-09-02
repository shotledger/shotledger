import { describe, expect, it } from 'vitest';

import { subtractMonthsUtc, wholeMonthsBetween } from './months';

describe('subtractMonthsUtc', () => {
  it('subtracts whole months', () => {
    expect(subtractMonthsUtc(new Date('2026-09-01T00:00:00Z'), 6).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });

  it('clamps at month-end when the target month is shorter (B19)', () => {
    // Mar 31 - 1 month: Feb has no 31st, JS Date clamps into March.
    const result = subtractMonthsUtc(new Date('2026-03-31T00:00:00Z'), 1);
    expect(result.toISOString()).not.toBe('2026-02-31T00:00:00.000Z');
    expect(result.getUTCMonth()).toBe(2); // rolled into March, not February
  });
});

describe('wholeMonthsBetween', () => {
  it('returns 0 for no elapsed time', () => {
    expect(wholeMonthsBetween('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(0);
  });

  it('returns 0 when later is before earlier', () => {
    expect(wholeMonthsBetween('2026-06-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(0);
  });

  it('floors partial months (I2: 6mo + 3d)', () => {
    expect(wholeMonthsBetween('2026-03-01T00:00:00Z', '2026-09-04T00:00:00Z')).toBe(6);
  });

  it('floors 5mo 29d to 5 (I3)', () => {
    expect(wholeMonthsBetween('2026-03-03T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(5);
  });

  it('counts a full year as 12', () => {
    expect(wholeMonthsBetween('2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(12);
  });
});
