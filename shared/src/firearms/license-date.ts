// A license date is stored as a bare `YYYY-MM-DD`: a day on the shooter's
// calendar, not an instant. `new Date('YYYY-MM-DD')` reads it as UTC midnight,
// which is the wrong day for anyone not on UTC.

export interface CalendarDay {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STORED_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The day a stored `YYYY-MM-DD` names, or null for any other shape or an
 *  impossible date such as 2026-02-31. */
export function parseLicenseDate(value: string): CalendarDay | null {
  const match = STORED_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // An impossible day rolls over (02-31 becomes 03-03), so its day of the
  // month changes; a month outside 01-12 rolls into another year, as does a
  // year below 100, which Date.UTC reads as 19xx.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Whole calendar days from the local day `now` falls on to `day`;
 *  negative once `day` has passed. */
export function calendarDaysUntil(day: CalendarDay, now: Date): number {
  const target = Date.UTC(day.year, day.month - 1, day.day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return (target - today) / DAY_MS;
}
