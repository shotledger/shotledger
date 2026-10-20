// Test-only DB factory. Runs the same generated SQL migrations against
// better-sqlite3 (a plain Node SQLite driver) so query functions can be
// unit-tested with vitest/jest, without a device or expo-sqlite's Metro/
// Babel bundling. better-sqlite3 is a devDependency used only here.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as schema from './schema';

// Jest (CommonJS via babel-preset-expo) compiles `import.meta.url` to null;
// there the module-scoped `__dirname` is the same directory.
const metaUrl: string | null = import.meta.url;
const dirname = metaUrl ? path.dirname(fileURLToPath(metaUrl)) : __dirname;
const migrationsDir = path.join(dirname, 'migrations');

/**
 * Creates a fresh in-memory DB with the current schema applied. Foreign keys
 * are on unless `foreignKeys: false`, which matches production:
 * `app/src/db/client.ts` sets no pragma and expo-sqlite builds SQLite without
 * SQLITE_DEFAULT_FOREIGN_KEYS, so they are off there
 * (docs/specs/sync-family-refusal-spec.md §11.6). better-sqlite3 turns them
 * on by default, so off is set explicitly.
 */
export function createTestDb(options: { foreignKeys?: boolean } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.pragma(`foreign_keys = ${options.foreignKeys === false ? 'OFF' : 'ON'}`);

  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: { tag: string }[] };

  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), 'utf-8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return drizzle(sqlite, { schema });
}
