// The fullest row the app can build for each synced table, serialized the way
// a push does, must stay well under the server's per-change cap (#555).
import {
  buildClientChange,
  MAX_PAYLOAD_BYTES,
  SYNC_TABLE_NAMES,
  TEXT_LIMITS,
  type SyncTableName,
} from '@shotledger/shared';
import { getTableColumns, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import { readRowSync, SYNC_TABLES } from './sync-store';

/**
 * Three UTF-8 bytes per UTF-16 code unit, the most any typeable character
 * costs: an astral character is four bytes over two units, and the only
 * longer JSON escapes are for control characters a keyboard does not type.
 */
const WIDEST = '€';

/** The cap is a protocol limit; a row the app builds stays a quarter under it. */
const BUDGET_BYTES = MAX_PAYLOAD_BYTES * 0.75;

/** Text the app writes itself, never typed: the longest value it produces. */
const APP_TEXT_MAX: Record<string, number> = {
  id: 36,
  created_at: 32,
  updated_at: 32,
  started_at: 32,
  performed_at: 32,
  firearm_id: 36,
  ammo_lot_id: 36,
  session_id: 36,
  series_id: 36,
  tag_id: 36,
  // Preset or catalogue ids, or a code an import carries.
  caliber: 64,
  load_system: 64,
  group_id: 64,
  discipline_id: 64,
  program_id: 64,
  weapon_group: 64,
  shooter_class: 64,
  event_id: 64,
  external_source: 64,
  external_ref: 128,
  // A local file URI or the sync marker; JSON of a 3x3 homography.
  photo_uri: 512,
  photo_geometry: 512,
};

type Column = SQLiteColumn & { enumValues?: readonly string[] };

function columnsOf(tableName: SyncTableName): Record<string, Column> {
  return getTableColumns(SYNC_TABLES[tableName]) as unknown as Record<string, Column>;
}

function userLimits(tableName: SyncTableName): Record<string, number> {
  return (TEXT_LIMITS as Partial<Record<SyncTableName, Record<string, number>>>)[tableName] ?? {};
}

function textMax(tableName: SyncTableName, column: Column): number | undefined {
  return userLimits(tableName)[column.name] ?? APP_TEXT_MAX[column.name];
}

function fullestValue(tableName: SyncTableName, column: Column): unknown {
  if (column.name === 'deleted_at') return null; // a tombstone pushes no payload
  if (column.enumValues && column.enumValues.length > 0) {
    return [...column.enumValues].sort((a, b) => b.length - a.length)[0];
  }
  switch (column.columnType) {
    case 'SQLiteText':
      return WIDEST.repeat(textMax(tableName, column)!);
    case 'SQLiteBoolean':
      return false;
    case 'SQLiteInteger':
      return -Number.MAX_SAFE_INTEGER;
    case 'SQLiteReal':
      return -Number.MAX_VALUE;
    default:
      throw new Error(`${tableName}.${column.name}: unhandled ${column.columnType}`);
  }
}

/** Inserts the fullest row and returns its push payload's UTF-8 size. */
function fullestPayloadBytes(tableName: SyncTableName): number {
  const db = createTestDb();
  db.run(sql`PRAGMA foreign_keys = OFF`);
  const row: Record<string, unknown> = {};
  for (const [property, column] of Object.entries(columnsOf(tableName))) {
    row[property] = fullestValue(tableName, column);
  }
  db.insert(SYNC_TABLES[tableName]).values(row).run();

  const rowId = row.id as string;
  const change = buildClientChange(
    { tableName, rowId, rev: 1, clientChangeId: null },
    readRowSync(db, tableName, rowId),
    '00000000-0000-4000-8000-000000000000',
  );
  // The server's own measure (backend/src/routes/sync.ts).
  return new TextEncoder().encode(JSON.stringify(change!.payload)).byteLength;
}

describe('TEXT_LIMITS', () => {
  it.each(SYNC_TABLE_NAMES)('bounds every text column of %s', (tableName) => {
    const unbounded = Object.values(columnsOf(tableName))
      .filter((c) => c.columnType === 'SQLiteText' && !c.enumValues?.length)
      .filter((c) => c.name !== 'deleted_at' && textMax(tableName, c) === undefined)
      .map((c) => c.name);
    expect(unbounded).toEqual([]);
  });

  it.each(SYNC_TABLE_NAMES)('names only real text columns of %s', (tableName) => {
    const textColumns = new Set(
      Object.values(columnsOf(tableName))
        .filter((c) => c.columnType === 'SQLiteText')
        .map((c) => c.name),
    );
    const stray = Object.keys(userLimits(tableName)).filter((name) => !textColumns.has(name));
    expect(stray).toEqual([]);
  });

  it.each(SYNC_TABLE_NAMES)('keeps the fullest %s row under the push cap', (tableName) => {
    expect(fullestPayloadBytes(tableName)).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it('measures what it claims: a filled note grows the payload by three bytes a character', () => {
    const notes = TEXT_LIMITS.sessions.notes;
    expect(new TextEncoder().encode(WIDEST.repeat(notes)).byteLength).toBe(notes * 3);
    expect(fullestPayloadBytes('sessions')).toBeGreaterThan(notes * 3);
  });
});
