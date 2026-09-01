// Migration rehearsal (spec Amendment A1 §A1.3, scenario A-X9): 0001 must
// apply to a database that is already at 0000 AND already holds rows —
// the local-first case, where nobody gets to re-create the file.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { getSession } from './queries/sessions';
import * as schema from './schema';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, 'migrations');

function journalTags(): string[] {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: { tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

function applyMigration(sqlite: Database.Database, tag: string) {
  const sql = fs.readFileSync(path.join(migrationsDir, `${tag}.sql`), 'utf-8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) sqlite.exec(trimmed);
  }
}

describe('A-X9: 0001 applies to an existing populated 0000 database', () => {
  it('adds extra_rounds and leaves existing sessions reading back NULL', () => {
    const tags = journalTags();
    expect(tags[0]).toBe('0000_chilly_scream');
    const [first, ...rest] = tags;
    expect(rest.length).toBeGreaterThan(0);

    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    applyMigration(sqlite, first!);

    // A session written by the pre-migration app.
    sqlite
      .prepare(
        `INSERT INTO sessions (id, created_at, updated_at, name, type, discipline_id, started_at, is_championship, decimal_scoring)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      )
      .run(
        'legacy-1',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        'Old session',
        'training',
        'spsf-precision',
        '2026-01-01T00:00:00.000Z',
      );

    expect(() => rest.forEach((tag) => applyMigration(sqlite, tag))).not.toThrow();

    const columns = sqlite.prepare('PRAGMA table_info(sessions)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain('extra_rounds');

    const db = drizzle(sqlite, { schema });
    const row = getSession(db, 'legacy-1');
    expect(row?.name).toBe('Old session');
    expect(row?.extraRounds).toBeNull();
  });

  it('keeps the deprecated is_inner_ten_decimal column in place (A1.1.4)', () => {
    const sqlite = new Database(':memory:');
    journalTags().forEach((tag) => applyMigration(sqlite, tag));
    const columns = sqlite.prepare('PRAGMA table_info(shots)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain('is_inner_ten_decimal');
  });
});
