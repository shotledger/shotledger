import { describe, expect, it } from 'vitest';

import {
  calendarDaysUntil,
  localDayEndIso,
  localDayOf,
  localDayStartIso,
  localToday,
  parseLocalDay,
} from './local-day';

// Expected values are built with the local Date constructor, so every case
// holds in whatever zone the runner is in.

describe('localToday', () => {
  it('is the local day of now at both ends of that day', () => {
    expect(localToday(new Date(2026, 8, 12, 0, 0))).toBe('2026-09-12');
    expect(localToday(new Date(2026, 8, 12, 23, 59, 59, 999))).toBe('2026-09-12');
  });

  it('pads a single-digit month and day', () => {
    expect(localToday(new Date(2027, 0, 5, 12))).toBe('2027-01-05');
  });

  it('does not pad a two-digit month and day', () => {
    expect(localToday(new Date(2026, 10, 25, 12))).toBe('2026-11-25');
  });
});

describe('localDayOf', () => {
  it('returns the local day of a timestamp, not the UTC day', () => {
    // 00:30 local is the previous UTC day anywhere east of Greenwich
    // (22:30Z in Swedish summer), which slice(0, 10) would report.
    expect(localDayOf(new Date(2026, 8, 12, 0, 30).toISOString())).toBe('2026-09-12');
    expect(localDayOf(new Date(2026, 8, 12, 23, 30).toISOString())).toBe('2026-09-12');
  });

  it('round-trips a day through its start and end', () => {
    expect(localDayOf(localDayStartIso('2027-01-01'))).toBe('2027-01-01');
    expect(localDayOf(localDayEndIso('2026-12-31'))).toBe('2026-12-31');
  });
});

describe('localDayStartIso / localDayEndIso', () => {
  it('bounds a day at local midnight on both ends', () => {
    expect(localDayStartIso('2026-10-01')).toBe(new Date(2026, 9, 1).toISOString());
    expect(localDayEndIso('2026-10-01')).toBe(new Date(2026, 9, 1, 23, 59, 59, 999).toISOString());
  });

  it('reads year, month and day from their own positions', () => {
    expect(localDayStartIso('2031-12-28')).toBe(new Date(2031, 11, 28).toISOString());
    expect(localDayEndIso('2031-12-28')).toBe(
      new Date(2031, 11, 28, 23, 59, 59, 999).toISOString(),
    );
  });

  it('puts a session shot just after local midnight on that day', () => {
    const justAfterMidnight = new Date(2026, 9, 1, 0, 30).toISOString();

    expect(justAfterMidnight >= localDayStartIso('2026-10-01')).toBe(true);
    expect(justAfterMidnight <= localDayEndIso('2026-09-30')).toBe(false);
  });

  it('ignores a time after the date, as a Webshooter competition date may carry', () => {
    expect(localDayStartIso('2026-06-13T00:00:00')).toBe(new Date(2026, 5, 13).toISOString());
    expect(localDayEndIso('2026-06-13 09:00:00')).toBe(
      new Date(2026, 5, 13, 23, 59, 59, 999).toISOString(),
    );
  });

  it('spans the whole local day across a DST change', () => {
    // 2026-03-29 and 2026-10-25 are 23 and 25 hours long in most of Europe;
    // whatever the runner's zone, the bounds are that day's local midnights.
    for (const [day, y, m, d] of [
      ['2026-03-29', 2026, 2, 29],
      ['2026-10-25', 2026, 9, 25],
    ] as const) {
      expect(localDayStartIso(day)).toBe(new Date(y, m, d).toISOString());
      expect(localDayEndIso(day)).toBe(new Date(y, m, d, 23, 59, 59, 999).toISOString());
      expect(localDayOf(localDayEndIso(day))).toBe(day);
    }
  });
});

describe('parseLocalDay', () => {
  it('reads a stored YYYY-MM-DD as that calendar day', () => {
    expect(parseLocalDay('2031-01-15')).toEqual({ year: 2031, month: 1, day: 15 });
    expect(parseLocalDay('2026-12-31')).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it('accepts 29 February only in a leap year', () => {
    expect(parseLocalDay('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseLocalDay('2027-02-29')).toBeNull();
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
    expect(parseLocalDay(value)).toBeNull();
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
