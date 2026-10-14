// Which firearms a picker offers (#799), as the phone's listActiveFirearms
// (app/src/db/queries/firearms.ts) decides it: live and not archived. An
// archived firearm stays offered to a session already shot with it, as the
// phone's session edit screen keeps it (app/src/app/session/[id]/edit.tsx).
type Rows = ReadonlyMap<string, Record<string, unknown>>;

function isLive(row: Record<string, unknown>): boolean {
  return row.deleted_at === null || row.deleted_at === undefined;
}

export function isArchivedFirearm(row: Record<string, unknown>): boolean {
  return row.archived_at !== null && row.archived_at !== undefined;
}

/** The live, unarchived firearms, plus `keepId` when it names an archived one. */
export function pickableFirearms(
  rows: Rows,
  keepId: string | null = null,
): Map<string, Record<string, unknown>> {
  return new Map(
    [...rows].filter(([id, row]) => isLive(row) && (!isArchivedFirearm(row) || id === keepId)),
  );
}
