/** The subtitle lines of a maintenance-list row: the date, then the note (an
 *  adjustment's reason is stored as its note). A blank note adds no line. */
export function maintenanceEventLines(event: {
  performedAt: string;
  notes: string | null;
}): string[] {
  const note = event.notes?.trim();
  return note ? [event.performedAt.slice(0, 10), note] : [event.performedAt.slice(0, 10)];
}
