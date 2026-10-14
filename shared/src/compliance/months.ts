// Calendar-month arithmetic shared by the license-activity's rolling window and
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
  // If the day-of-month hasn't yet been reached in the later date's month, the
  // last increment doesn't count as a whole month. Time of day is ignored.
  if (later.getUTCDate() < earlier.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

// License-activity windows count whole local calendar days (#816). Spec:
// docs/specs/compliance-local-days-spec.md. "Local" is the runtime's time
// zone: the device's on the phone.

/**
 * Local midnight starting `date`'s local calendar day.
 *
 * @Requirements COMPL_005
 */
export function localDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The local day `months` calendar months from `day`, keeping its day number.
 * When the target month has no such day, its last day: "Finnes ej motsvarande
 * dag i slutmånaden, varde den månadens sista dag ansedd för slutdag" (Lag
 * 1930:173, 1 §). 31 March − 6 months is 30 September, never 1 October.
 *
 * @Requirements COMPL_005
 */
export function addMonthsClamped(day: Date, months: number): Date {
  const year = day.getFullYear();
  const month = day.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day.getDate(), lastDay));
}

/** Local midnight `days` local days from `day`'s, across DST changes. */
export function addDays(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}
