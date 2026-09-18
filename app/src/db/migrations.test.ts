// The chain is a regenerated baseline (2026-09-11, and again 2026-09-12 for
// `sessions.event_id`; maintainer's call — pre-release, no installed build's
// data had to survive) plus the migrations appended since.
// What these assert is that applying the whole chain leaves a database that
// matches schema.ts. The baseline is not generated in full — `drizzle-kit
// generate` derives it from schema.ts, which models neither triggers nor seed
// rows, and both were carried over by hand.
import Database from 'better-sqlite3';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, 'migrations');

/** Every table the sync engine captures; each needs an insert and an update trigger. */
const SYNCED_TABLES = [
  'ammo_lots',
  'firearm_groups',
  'firearms',
  'licenses',
  'maintenance_events',
  'series',
  'sessions',
  'shots',
  'sight_settings',
  'tags',
] as const;

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

function freshDatabase(): Database.Database {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  journalTags().forEach((tag) => applyMigration(sqlite, tag));
  return sqlite;
}

describe('the migration chain is the whole schema', () => {
  it('starts from the regenerated baseline', () => {
    expect(journalTags()[0]).toBe('0000_baseline');
  });

  it('creates every column schema.ts declares, on every table', () => {
    // The part below the line in the baseline is carried BY HAND. So the
    // drift this guards against is a column added to schema.ts while the SQL
    // it is folded into is left behind: drizzle-kit would be happy, and the
    // app would crash on its first query instead of on migration. It also
    // catches a column dropped from schema.ts with no migration to match
    // (`licenses.vault_document_id`, issue #276).
    const sqlite = freshDatabase();

    for (const table of Object.values(schema)) {
      if (!is(table, SQLiteTable)) continue;
      const name = getTableName(table);
      const expected = Object.values(getTableColumns(table)).map((column) => column.name);
      const actual = sqlite
        .prepare(`SELECT name FROM pragma_table_info(?)`)
        .all(name)
        .map((row) => (row as { name: string }).name);

      expect({ [name]: actual.slice().sort() }).toEqual({ [name]: expected.slice().sort() });
    }
  });

  it('creates an outbox capture trigger pair for every synced table', () => {
    // The failure this guards against is silent: regenerate the baseline from
    // schema.ts and the triggers vanish, local edits stop reaching the outbox,
    // and sync goes quiet with no error anywhere.
    const sqlite = freshDatabase();
    const triggers = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`)
      .all()
      .map((row) => (row as { name: string }).name);

    expect(triggers).toEqual(
      SYNCED_TABLES.flatMap((table) => [
        `sync_outbox_${table}_insert`,
        `sync_outbox_${table}_update`,
      ]).sort(),
    );
  });

  it('seeds the sync_control row the triggers read', () => {
    // Without this row the WHEN guard's subquery is NULL, never 0, so every
    // trigger silently declines to fire — the same outage, one row away.
    const row = freshDatabase().prepare('SELECT id, applying, last_rev FROM sync_control').get();
    expect(row).toEqual({ id: 0, applying: 0, last_rev: 0 });
  });

  it('enqueues an insert and an update at increasing revs', () => {
    const sqlite = freshDatabase();
    sqlite
      .prepare(
        `INSERT INTO firearms (id, created_at, updated_at, make, model)
         VALUES ('f1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Pardini', 'SP')`,
      )
      .run();
    sqlite
      .prepare(`UPDATE firearms SET updated_at = '2026-01-02T00:00:00.000Z' WHERE id = 'f1'`)
      .run();

    expect(sqlite.prepare('SELECT table_name, row_id, rev FROM sync_outbox').all()).toEqual([
      { table_name: 'firearms', row_id: 'f1', rev: 2 },
    ]);
  });

  it('leaves the outbox alone while the sync engine is applying server rows', () => {
    const sqlite = freshDatabase();
    sqlite.prepare('UPDATE sync_control SET applying = 1 WHERE id = 0').run();
    sqlite
      .prepare(
        `INSERT INTO firearms (id, created_at, updated_at, make, model)
         VALUES ('f2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Walther', 'GSP')`,
      )
      .run();

    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get()).toEqual({ n: 0 });
  });
});

/**
 * Regression guard for the startup crash 0009 shipped with (#153).
 *
 * A chunk that holds only SQL comments is not nothing: `sqlite3_prepare`
 * accepts it, returns SQLITE_OK and hands back a **NULL** statement handle.
 * expo-sqlite's `NativeStatementBinding` then calls `sqlite3_clear_bindings`
 * on that null pointer and the process dies with SIGSEGV before the first
 * screen renders — on device and emulator alike.
 *
 * The rehearsals above cannot catch it: they use better-sqlite3's `exec()`,
 * which swallows a comment-only string happily. Only the prepare-per-chunk
 * path that expo-sqlite uses is affected, so this asserts on the file shape
 * instead of on behaviour. The carried-over triggers arrive with their own
 * comment blocks attached, which is exactly the shape that could trip it.
 */
describe('migration statement chunks', () => {
  it('no migration contains a comment-only statement', () => {
    const offenders: string[] = [];

    for (const tag of journalTags()) {
      const sql = fs.readFileSync(path.join(migrationsDir, `${tag}.sql`), 'utf-8');
      sql.split('--> statement-breakpoint').forEach((chunk, index) => {
        const withoutComments = chunk.replace(/^\s*--.*$/gm, '').trim();
        if (withoutComments === '') offenders.push(`${tag} chunk ${index}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
