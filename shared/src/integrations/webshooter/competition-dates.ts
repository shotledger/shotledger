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

import { localToday } from '../../dates';

/**
 * String comparison, not Date arithmetic: `YYYY-MM-DD` sorts
 * lexicographically, and `new Date('2026-09-12')` is parsed as UTC
 * midnight, which reads as yesterday for anyone west of Greenwich and
 * shifts the boundary by a day.
 */
export function isUpcomingCompetition(date: string, now: Date = new Date()): boolean {
  return date.slice(0, 10) >= localToday(now);
}

export function isPastCompetition(date: string, now: Date = new Date()): boolean {
  return date.slice(0, 10) <= localToday(now);
}
