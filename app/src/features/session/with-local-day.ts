/**
 * Moves a timestamp to the calendar day the date picker returned, keeping its
 * local time of day — a date-only picker must not reset when the session was shot.
 */
export function withLocalDay(iso: string, picked: Date): string {
  const moved = new Date(iso);
  moved.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return moved.toISOString();
}
