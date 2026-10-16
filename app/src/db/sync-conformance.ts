// Test support: every live row in the synced tables, read the way the sync
// engine reads it (readRowSync → toPayload), checked against the server's
// payload schemas (docs/specs/sync-payload-validation-spec.md §2.5). A writer
// that stores a row the server would refuse shows up here, in the app's own
// tests, instead of as a change silently refused on a phone.
import { SYNC_TABLE_NAMES, type ClientChange } from '@shotledger/shared';
import { validatePayload } from '@shotledger/shared/src/sync/payload-schemas';
import { getTableColumns } from 'drizzle-orm';

import { readRowSync, SYNC_TABLES } from './queries/sync-store';
import type { Database } from './types';

/** `table:column:code` for every way a stored row fails; empty when all pass. */
export function unsyncableRows(db: Database): string[] {
  const failures: string[] = [];
  for (const tableName of SYNC_TABLE_NAMES) {
    const table = SYNC_TABLES[tableName];
    const { id } = getTableColumns(table) as Record<string, unknown>;
    const ids = db
      .select({ id: id as never })
      .from(table)
      .all() as { id: string }[];
    for (const { id: rowId } of ids) {
      const row = readRowSync(db, tableName, rowId)!;
      const verdict = validatePayload({
        tableName,
        rowId,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
        payload: row.payload,
      });
      if (!verdict.ok) {
        for (const issue of verdict.issues)
          failures.push(`${tableName}:${issue.path}:${issue.code}`);
      }
    }
  }
  return [...new Set(failures)].sort();
}

/** `table:column:code` for every way the server would refuse `changes`. */
export function serverRefusals(changes: readonly ClientChange[]): string[] {
  return changes.flatMap((change) => {
    const verdict = validatePayload(change);
    return verdict.ok
      ? []
      : verdict.issues.map((issue) => `${change.tableName}:${issue.path}:${issue.code}`);
  });
}
