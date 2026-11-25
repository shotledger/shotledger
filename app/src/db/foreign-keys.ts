// The app runs with SQLite foreign keys on (docs/specs/phone-foreign-keys-spec.md).
// A connection opens with them off so migrations can rebuild tables, as
// SQLite's documented procedure requires; the migration gate then sweeps any
// dangling row aside and turns them on before anything renders.
import { sql, type SQL } from 'drizzle-orm';

import { sweepOrphanRows } from './queries/sync-store';
import type { Database } from './types';

const OFF_ERROR =
  'SQLite foreign keys are off; the app needs them on (docs/specs/phone-foreign-keys-spec.md)';

/** The part of a Drizzle database the pragma needs. */
export interface PragmaConnection {
  run(query: SQL): unknown;
  get<T>(query: SQL): T;
}

/**
 * Checks the row `PRAGMA foreign_keys` returned. Only `{ foreign_keys: 1 }`
 * passes: `0`, no row (a build without foreign-key support) or anything else
 * means they are not enforced.
 */
export function checkForeignKeysOn(row: unknown): void {
  if (
    typeof row === 'object' &&
    row !== null &&
    (row as { foreign_keys?: unknown }).foreign_keys === 1
  ) {
    return;
  }
  throw new Error(OFF_ERROR);
}

/** Turns foreign keys on and reads the setting back. Outside any transaction. */
export function enableForeignKeys(db: PragmaConnection): void {
  db.run(sql`PRAGMA foreign_keys = ON`);
  checkForeignKeysOn(db.get<unknown>(sql`PRAGMA foreign_keys`));
}

/**
 * After migrations: moves dangling rows aside (FK7), then turns foreign keys
 * on (FK3). Returns how many rows the sweep moved.
 */
export function finishOpeningDatabase(db: Database): number {
  const moved = sweepOrphanRows(db);
  enableForeignKeys(db);
  return moved;
}
