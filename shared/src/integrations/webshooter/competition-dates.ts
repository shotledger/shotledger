// Which competitions belong on which screen.
//
// My Starts wants the ones still to come; Import Results wants the ones
// already shot. Both were deciding this for themselves — My Starts with a
// 24-hour fudge inside a hook, Import Results not at all, so it offered
// every competition in the database including next spring's.
//
// Today counts as BOTH. A competition today has not necessarily happened
// yet (so it is still a start) and may already have results posted (so it
// is importable). Excluding it from either would hide the one competition
// the shooter is most likely to be looking for.

/** `now` is injected so the boundary is testable rather than a coin flip at midnight. */
function todayIso(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The local calendar day a stored UTC timestamp falls on. Slicing the ISO
 * string gives the UTC day instead — a session shot 00:00–02:00 Swedish
 * summer time lands on the previous day and misses that day's competition.
 */
export function localCalendarDay(iso: string): string {
  return todayIso(new Date(iso));
}

/** Local midnight of a competition's `YYYY-MM-DD` day, as the UTC timestamp a session stores. */
export function competitionDayStartIso(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(year, month - 1, day).toISOString();
}

/**
 * String comparison, not Date arithmetic: `YYYY-MM-DD` sorts
 * lexicographically, and `new Date('2026-09-12')` is parsed as UTC
 * midnight, which reads as yesterday for anyone west of Greenwich and
 * shifts the boundary by a day.
 */
export function isUpcomingCompetition(date: string, now: Date = new Date()): boolean {
  return date.slice(0, 10) >= todayIso(now);
}

export function isPastCompetition(date: string, now: Date = new Date()): boolean {
  return date.slice(0, 10) <= todayIso(now);
}
