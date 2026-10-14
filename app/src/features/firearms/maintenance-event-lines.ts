/** The subtitle lines of a maintenance-list row: the date, then the note (an
 *  adjustment's reason is stored as its note). A blank note adds no line. */
export function maintenanceEventLines(
  event: { performedAt: string; notes: string | null },
  formatDate: (iso: string) => string,
): string[] {
  const date = formatDate(event.performedAt);
  const note = event.notes?.trim();
  return note ? [date, note] : [date];
}

/** The title of a maintenance-list row: the kind the user typed, or the
 *  adjustment label for a round-count adjustment. Only the flag decides, so a
 *  kind typed as "adjustment" shows as typed (#727). */
export function maintenanceEventTitle(
  event: { kind: string; isAdjustment: number },
  adjustmentLabel: string,
): string {
  return event.isAdjustment === 1 ? adjustmentLabel : event.kind;
}
