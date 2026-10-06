// A hard DELETE on a synced table never reaches the outbox, so the row lives
// on on the server and every other device (docs/specs/sync-app-spec.md §11,
// sync-tags-settings spec N4). The app tombstones instead; only the /dev wipe
// in seed.ts hard-deletes. This gate catches the Drizzle `.delete(table)`
// spelling and raw `DELETE FROM table` text, not a delete built any other way.
import { getTableName } from 'drizzle-orm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SYNC_TABLES } from './queries/sync-store';
import * as schema from './schema';

const appSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set([path.join(appSrc, 'db', 'seed.ts')]);

/** Drizzle export names and SQL names of every synced table. */
const syncedTables = new Set(Object.values(SYNC_TABLES));
const exportNames = Object.entries(schema)
  .filter(([, value]) => syncedTables.has(value as never))
  .map(([name]) => name);
const sqlNames = [...syncedTables].map((table) => getTableName(table));

function hardDeletes(source: string): string[] {
  const hits: string[] = [];
  for (const name of exportNames) {
    if (new RegExp(`\\.delete\\(\\s*${name}\\s*\\)`).test(source)) hits.push(name);
  }
  for (const name of sqlNames) {
    if (new RegExp(`DELETE\\s+FROM\\s+[\`"]?${name}\\b`, 'i').test(source)) hits.push(name);
  }
  return hits;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('no hard delete of a synced row (N4)', () => {
  it('knows every synced table by both names', () => {
    expect(exportNames).toHaveLength(Object.keys(SYNC_TABLES).length);
    expect(exportNames).toContain('sessionTags');
    expect(sqlNames).toContain('session_tags');
  });

  it('flags both spellings (negative control)', () => {
    expect(hardDeletes('db.delete(sessionTags).where(x).run();')).toEqual(['sessionTags']);
    expect(hardDeletes('db.run(sql`DELETE FROM `session_tags``)')).toEqual(['session_tags']);
    expect(hardDeletes('db.delete(syncOutbox).run();')).toEqual([]);
  });

  it('finds none in app/src outside the /dev wipe', () => {
    const files = sourceFiles(appSrc).filter((file) => !ALLOWED.has(file));
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((file) =>
      hardDeletes(fs.readFileSync(file, 'utf-8')).map(
        (name) => `${path.relative(appSrc, file)}: ${name}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
