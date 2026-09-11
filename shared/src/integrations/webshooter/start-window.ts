// Formatting one patrol's start window.
//
// WebShooter gives both ends as full local timestamps, so the naive render
// was "2026-09-12 09:50:00–2026-09-12 11:20:00" — the date twice and
// seconds that are always zero. The date is said once, and a window that
// runs past midnight borrows aviation's arrival convention: the end time
// carries +1 rather than repeating a whole date to move one day.

/** `2026-09-12 09:50:00` and `2026-09-12T09:50:00` both occur in the wild. */
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

interface Parsed {
  date: string;
  time: string;
  dayNumber: number;
}

function parse(value: string): Parsed | null {
  const match = TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    // Days since the epoch, in UTC, so the difference is unaffected by the
    // running device's zone — these are wall-clock times at the range.
    dayNumber: Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000,
  };
}

/**
 * `2026-09-12 09:50–11:20`, or `2026-09-12 23:40–00:30+1` when the window
 * crosses midnight.
 *
 * Returns the inputs joined unchanged if either cannot be parsed: a start
 * time the shooter can read in an odd format beats a blank where a time
 * should be.
 */
export function formatStartWindow(startLocal: string, endLocal: string): string {
  const start = parse(startLocal);
  const end = parse(endLocal);
  if (!start || !end) return `${startLocal}–${endLocal}`;

  const daysLater = end.dayNumber - start.dayNumber;
  const suffix = daysLater > 0 ? `+${daysLater}` : '';
  return `${start.date} ${start.time}–${end.time}${suffix}`;
}
