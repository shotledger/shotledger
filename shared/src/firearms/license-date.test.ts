import { describe, expect, it } from 'vitest';

import { calendarDaysUntil, parseLicenseDate } from './license-date';

describe('parseLicenseDate', () => {
  it('reads a stored YYYY-MM-DD as that calendar day', () => {
    expect(parseLicenseDate('2031-01-15')).toEqual({ year: 2031, month: 1, day: 15 });
    expect(parseLicenseDate('2026-12-31')).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it('accepts 29 February only in a leap year', () => {
    expect(parseLicenseDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseLicenseDate('2027-02-29')).toBeNull();
  });

  it.each([
    '',
    'tills vidare',
    '2026-02-31',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '0026-10-01',
    '2026-1-01',
    '2026-10-1',
    '26-10-01',
    '2026/10/01',
    '2026-10-01T00:00:00.000Z',
    ' 2026-10-01',
    '2026-10-01 ',
  ])('rejects %j', (value) => {
    expect(parseLicenseDate(value)).toBeNull();
  });
});

describe('calendarDaysUntil', () => {
  const day = { year: 2026, month: 10, day: 1 };

  it('is zero all of that local day', () => {
    expect(calendarDaysUntil(day, new Date(2026, 9, 1, 0, 0))).toBe(0);
    expect(calendarDaysUntil(day, new Date(2026, 9, 1, 23, 59, 59, 999))).toBe(0);
  });

  it('counts whole days before it and goes negative after it', () => {
    expect(calendarDaysUntil(day, new Date(2026, 8, 30, 23, 59, 59, 999))).toBe(1);
    expect(calendarDaysUntil(day, new Date(2026, 9, 2, 0, 0))).toBe(-1);
    expect(calendarDaysUntil(day, new Date(2026, 8, 1, 0, 30))).toBe(30);
  });
});
