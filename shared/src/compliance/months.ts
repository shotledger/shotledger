// Calendar-month arithmetic shared by the barometer's rolling window and
// the Bilaga 8 "months of activity" indicator. Spec: m6-compliance-spec.md
// "Rolling window".

/**
 * `date` minus `months` calendar months, UTC. Uses JS `Date`'s native
 * month-rollback clamping (e.g. Mar 31 − 1 month = Mar 3, since Feb has no
 * 31st) rather than a fixed 30-day subtraction — documented, not "exact".
 */
export function subtractMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

/** Whole months between two ISO instants, floored, never negative. */
export function wholeMonthsBetween(earlierIso: string, laterIso: string): number {
  const earlier = new Date(earlierIso);
  const later = new Date(laterIso);
  if (later.getTime() <= earlier.getTime()) return 0;

  let months =
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth());
  // If the day-of-month/time hasn't yet been reached in the later date's
  // month, the last increment doesn't count as a whole month.
  if (later.getUTCDate() < earlier.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}
