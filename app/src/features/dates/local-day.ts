// A picked date ('YYYY-MM-DD') is a day on the shooter's clock, while
// startedAt is stored in UTC, so a range must be built from local midnights.
// Slicing an ISO string gives the UTC day, off by one for a session shot
// between midnight and the UTC offset.

function parseDay(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number);
  return [year, month - 1, date];
}

export function localDayStartIso(day: string): string {
  const [year, month, date] = parseDay(day);
  return new Date(year, month, date).toISOString();
}

export function localDayEndIso(day: string): string {
  const [year, month, date] = parseDay(day);
  return new Date(year, month, date, 23, 59, 59, 999).toISOString();
}

/** The local calendar day ('YYYY-MM-DD') an ISO timestamp falls on. */
export function localDayOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
