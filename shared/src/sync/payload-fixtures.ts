// Test support: a minimal valid whole row for any synced table, so a test
// that is about something else can push a row the server accepts
// (docs/specs/sync-payload-validation-spec.md N4). Built from the column
// metadata, not from the payload schemas, and checked against them in
// payload-schemas.test.ts.
import { getTableColumns, getTableName } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { SYNC_TABLES } from './tables';
import type { SyncTableName } from './protocol';

export const FIXTURE_NOW = '2026-09-02T10:00:00.000Z';

function placeholder(tableName: string, column: SQLiteColumn): unknown {
  if (column.name === 'deleted_at') return null;
  if (column.name.endsWith('_at') && column.columnType === 'SQLiteText') return FIXTURE_NOW;
  if (tableName === 'settings' && column.name === 'value') return '"x"';
  if (!column.notNull) return null;
  const enumValues = (column as { enumValues?: readonly string[] }).enumValues;
  if (enumValues !== undefined && enumValues.length > 0) return enumValues[0];
  switch (column.columnType) {
    case 'SQLiteBoolean':
      return true;
    case 'SQLiteInteger':
    case 'SQLiteReal':
      return 0;
    default:
      return 'x';
  }
}

/**
 * A whole row of `tableName` with `id` and `updated_at` as given and every
 * other column a valid placeholder; `overrides` win (column names).
 */
export function fullRow(
  tableName: SyncTableName,
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const table = SYNC_TABLES[tableName];
  const row: Record<string, unknown> = {};
  for (const column of Object.values(
    getTableColumns(table) as unknown as Record<string, SQLiteColumn>,
  )) {
    row[column.name] = placeholder(getTableName(table), column);
  }
  return { ...row, id, ...overrides };
}
