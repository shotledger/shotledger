// Whole-row payloads for tests that are about something other than the row
// (docs/specs/sync-payload-validation-spec.md N4): the push route refuses a
// partial row, so a fixture that names only the fields its test cares about
// is filled out to a valid whole row of its table here.
import type { SyncTableName } from '@shotledger/shared';
import { fullRow } from '@shotledger/shared/src/sync/payload-fixtures';

/** A valid whole row of `tableName`, with `fields` (column names) on top. */
export function row(
  tableName: string,
  id: string,
  updatedAt: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return fullRow(tableName as SyncTableName, id, { updated_at: updatedAt, ...fields });
}

/** The change with its object payload filled out to a whole row. */
export function wholeRow<
  T extends { tableName: string; rowId: string; updatedAt: string; payload: unknown },
>(change: T): T {
  const { payload } = change;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return change;
  return {
    ...change,
    payload: row(
      change.tableName,
      change.rowId,
      change.updatedAt,
      payload as Record<string, unknown>,
    ),
  };
}
