// Properties of the local-day helpers over every instant and day in the
// range a logbook holds, DST changes included (#806). The example tests in
// local-day.test.ts pin specific days; these hold for all of them. The
// runner's zone is Europe/Stockholm (vitest.config.ts).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  calendarDaysUntil,
  localDayEndIso,
  localDayOf,
  localDayStartIso,
  localToday,
  parseLocalDay,
} from './local-day';

const MIN_MS = Date.UTC(1970, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);

/** Any millisecond between 1970 and 2100. */
const instant = fc.integer({ min: MIN_MS, max: MAX_MS }).map((ms) => new Date(ms));

/** Any real calendar day in that range, as its parts. */
const calendarDay = fc
  .integer({ min: Date.UTC(1970, 0, 1) / 86_400_000, max: Date.UTC(2099, 11, 31) / 86_400_000 })
  .map((n) => {
    const d = new Date(n * 86_400_000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  });

function format(day: { year: number; month: number; day: number }): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day.year}-${pad(day.month)}-${pad(day.day)}`;
}

describe('local-day properties', () => {
  it('every instant lies within the bounds of its own local day', () => {
    fc.assert(
      fc.property(instant, (now) => {
        const day = localDayOf(now.toISOString());
        expect(localDayStartIso(day) <= now.toISOString()).toBe(true);
        expect(now.toISOString() <= localDayEndIso(day)).toBe(true);
      }),
    );
  });

  it('a day round-trips through its start and its end', () => {
    fc.assert(
      fc.property(calendarDay, (parts) => {
        const day = format(parts);
        expect(localDayOf(localDayStartIso(day))).toBe(day);
        expect(localDayOf(localDayEndIso(day))).toBe(day);
      }),
    );
  });

  it('consecutive days tile time with no gap or overlap', () => {
    fc.assert(
      fc.property(calendarDay, (parts) => {
        const day = format(parts);
        const end = Date.parse(localDayEndIso(day));
        const nextDay = localDayOf(new Date(end + 1).toISOString());
        expect(Date.parse(localDayStartIso(nextDay))).toBe(end + 1);
      }),
    );
  });

  it('parseLocalDay reads back every real day it is given', () => {
    fc.assert(
      fc.property(calendarDay, (parts) => {
        expect(parseLocalDay(format(parts))).toEqual(parts);
      }),
    );
  });

  it('parseLocalDay refuses a day of the month past the end of that month', () => {
    fc.assert(
      fc.property(calendarDay, fc.integer({ min: 1, max: 9 }), (parts, extra) => {
        const daysInMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
        const day = daysInMonth + extra;
        fc.pre(day <= 99);
        expect(parseLocalDay(format({ ...parts, day }))).toBeNull();
      }),
    );
  });

  it('calendarDaysUntil is zero at every instant of that local day', () => {
    fc.assert(
      fc.property(instant, (now) => {
        const day = parseLocalDay(localToday(now));
        expect(day).not.toBeNull();
        expect(calendarDaysUntil(day!, now)).toBe(0);
      }),
    );
  });

  it('calendarDaysUntil is a whole number that grows by one per day ahead', () => {
    fc.assert(
      fc.property(instant, calendarDay, (now, parts) => {
        const days = calendarDaysUntil(parts, now);
        expect(Number.isInteger(days)).toBe(true);
        const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
        const nextParts = {
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: next.getUTCDate(),
        };
        expect(calendarDaysUntil(nextParts, now)).toBe(days + 1);
      }),
    );
  });
});
