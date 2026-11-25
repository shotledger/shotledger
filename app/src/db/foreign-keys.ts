// Sync applies a pulled child whose parent this device does not hold, as the
// server does (docs/specs/sync-family-refusal-spec.md §11.6). That needs
// SQLite foreign keys off, so every app connection sets them off itself and
// reads the setting back (docs/specs/phone-foreign-keys-spec.md).

/** The part of an expo-sqlite connection the sync pin uses. */
export interface SyncPragmaConnection {
  execSync(source: string): void;
  getFirstSync<T>(source: string): T | null;
}

/** The part of an expo-sqlite connection the async pin uses (web). */
export interface AsyncPragmaConnection {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
}

const ON_ERROR =
  'SQLite foreign keys are on; sync needs them off (docs/specs/sync-family-refusal-spec.md §11.6)';

const READ = 'PRAGMA foreign_keys';
const SET_OFF = 'PRAGMA foreign_keys = OFF';

/**
 * Checks the row `PRAGMA foreign_keys` returned. `null` (no row) is a build
 * without foreign-key support, where they cannot be on. Anything but
 * `{ foreign_keys: 0 }` or `null` throws: an unreadable answer is a failure.
 */
export function checkForeignKeysOff(row: unknown): void {
  if (row === null) return;
  if (typeof row === 'object' && (row as { foreign_keys?: unknown }).foreign_keys === 0) return;
  throw new Error(ON_ERROR);
}

/** Sets foreign keys off on `conn` and reads the setting back. */
export function pinForeignKeysOffSync(conn: SyncPragmaConnection): void {
  conn.execSync(SET_OFF);
  checkForeignKeysOff(conn.getFirstSync(READ));
}

/** {@link pinForeignKeysOffSync} for a connection opened with the async API. */
export async function pinForeignKeysOffAsync(conn: AsyncPragmaConnection): Promise<void> {
  await conn.execAsync(SET_OFF);
  checkForeignKeysOff(await conn.getFirstAsync(READ));
}
