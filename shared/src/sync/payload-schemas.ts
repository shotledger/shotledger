// Per-table payload validation for /sync/push
// (docs/specs/sync-payload-validation-spec.md §2.1). Each schema is derived
// from the Drizzle table with drizzle-zod, so a column added to schema.ts
// reaches the server without a second copy to keep in step (C1).
//
// Not exported from the @shotledger/shared barrel: only the server runs it
// (C2), so drizzle-zod stays out of the phone and web bundles (N9).
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig, type SQLiteColumn, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { SYNC_TABLES } from './tables';
import type { ClientChange, SyncTableName } from './protocol';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** `toISOString()`'s shape, naming a real instant: `2026-02-30T…` fails (C7). */
export function isIsoInstant(value: string): boolean {
  if (!ISO_INSTANT.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

function isJsonText(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** Columns every writer fills with `toISOString()` (C7). */
const INSTANT_COLUMNS: ReadonlySet<string> = new Set([
  'created_at',
  'updated_at',
  'started_at',
  'performed_at',
]);

/** A 0/1 integer flag: an `is_*` integer, or `decimal_scoring` (C9). */
export function isFlagColumn(column: SQLiteColumn): boolean {
  return (
    column.columnType === 'SQLiteInteger' &&
    (column.name.startsWith('is_') || column.name === 'decimal_scoring')
  );
}

function foreignKeyColumns(table: SQLiteTable): ReadonlySet<string> {
  return new Set(
    getTableConfig(table).foreignKeys.flatMap((fk) =>
      fk.reference().columns.map((column) => column.name),
    ),
  );
}

/** The wire rule where it is finer than the column's storage type (§2.1). */
function refined(
  table: SQLiteTable,
  column: SQLiteColumn,
  foreignKeys: ReadonlySet<string>,
): z.ZodType | undefined {
  if (column.name === 'deleted_at') return z.null();
  if (column.name === 'id' || foreignKeys.has(column.name)) return z.string().min(1);
  if (INSTANT_COLUMNS.has(column.name)) return z.string().refine(isIsoInstant);
  if (isFlagColumn(column)) return z.union([z.literal(0), z.literal(1)]);
  if (getTableName(table) === 'settings' && column.name === 'value') {
    return z.string().refine(isJsonText);
  }
  return undefined;
}

/**
 * The strict wire schema of one table: keyed by column name, every column
 * required, no other key (C5).
 */
export function derivePayloadSchema(table: SQLiteTable): z.ZodType {
  const derived = createSelectSchema(table).shape as Record<string, z.ZodType>;
  const foreignKeys = foreignKeyColumns(table);
  const shape: Record<string, z.ZodType> = {};
  for (const [property, column] of Object.entries(
    getTableColumns(table) as unknown as Record<string, SQLiteColumn>,
  )) {
    const rule = refined(table, column, foreignKeys);
    shape[column.name] =
      rule === undefined ? derived[property]! : column.notNull ? rule : rule.nullable();
  }
  return z.strictObject(shape);
}

export const PAYLOAD_SCHEMAS = Object.fromEntries(
  Object.entries(SYNC_TABLES).map(([name, table]) => [name, derivePayloadSchema(table)]),
) as Record<SyncTableName, z.ZodType>;

/** Where and how a payload failed: never the value (N6). */
export interface PayloadIssue {
  path: string;
  code: string;
}

export type PayloadVerdict = { ok: true } | { ok: false; issues: PayloadIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a pushed change is a row every device can apply. A tombstone
 * carries no payload and is not checked here; a live change's payload must
 * match its table's schema and agree with the envelope (C10).
 */
export function validatePayload(
  change: Pick<ClientChange, 'tableName' | 'rowId' | 'updatedAt' | 'payload' | 'deletedAt'>,
): PayloadVerdict {
  if (change.deletedAt !== null) return { ok: true };
  const parsed = PAYLOAD_SCHEMAS[change.tableName].safeParse(change.payload);
  const issues: PayloadIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code }));
  const { payload } = change;
  if (isRecord(payload)) {
    if (payload.id !== change.rowId) issues.push({ path: 'id', code: 'envelope_mismatch' });
    if (payload.updated_at !== change.updatedAt) {
      issues.push({ path: 'updated_at', code: 'envelope_mismatch' });
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
