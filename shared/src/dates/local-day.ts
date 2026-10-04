// A day ('YYYY-MM-DD') is a day on the shooter's clock; a timestamp is stored
// as a UTC instant. Slicing an ISO string gives the UTC day, off by one for
// anything between local midnight and the UTC offset, and
// `new Date('YYYY-MM-DD')` reads a day as UTC midnight. Convert here instead.

export interface CalendarDay {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STORED_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The local calendar day `now` falls on. `now` is injected so a boundary
 *  test is not a coin flip at midnight. */
export function localToday(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The local calendar day a stored ISO instant falls on. */
export function localDayOf(iso: string): string {
  return localToday(new Date(iso));
}

/** Reads the leading 'YYYY-MM-DD'; anything after it (a time) is ignored. */
function dayParts(day: string): [number, number, number] {
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))];
}

/** Local midnight that starts `day`, as a UTC ISO instant. */
export function localDayStartIso(day: string): string {
  const [year, month, date] = dayParts(day);
  return new Date(year, month, date).toISOString();
}

/** The last local millisecond of `day`, as a UTC ISO instant. */
export function localDayEndIso(day: string): string {
  const [year, month, date] = dayParts(day);
  return new Date(year, month, date, 23, 59, 59, 999).toISOString();
}

/** The day a stored `YYYY-MM-DD` names, or null for any other shape or an
 *  impossible date such as 2026-02-31. */
export function parseLocalDay(value: string): CalendarDay | null {
  const match = STORED_DAY_RE.exec(value);
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
