// The migration chain is append-only (#913): a shipped migration is never
// edited, and every schema change adds the next one, so an installed app
// upgrades with its data. What these assert is that the chain leaves a
// database matching schema.ts and that an earlier database upgrades to it.
// drizzle-kit generates a migration from schema.ts, which models neither
// triggers nor seed rows, so a migration that adds a synced table carries its
// triggers by hand. The firearm_calibers triggers were lost exactly that way
// once (2026-09-22) and caught here.
import Database from 'better-sqlite3';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, 'migrations');

/** Every table the sync engine captures; each needs an insert and an update trigger. */
const SYNCED_TABLES = [
  'ammo_lots',
  'falt_stations',
  'firearm_calibers',
  'firearm_groups',
  'firearms',
  'licenses',
  'maintenance_events',
  'series',
  'session_tags',
  'sessions',
  'settings',
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

/**
 * Every migration that has reached main, with its SQL's sha256. An install
 * records each migration it ran, so editing one here never reaches a device
 * that already has it; the change must go in a new migration instead. Add a
 * line per new migration; never change one.
 */
const SHIPPED_MIGRATIONS: Record<string, string> = {
  '0000_baseline': '3017ff1fd7bacc2274ea47cb1c4c1222a663a9843794c922210b066800f691b3',
};

function sha256(tag: string): string {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(migrationsDir, `${tag}.sql`)))
    .digest('hex');
}

/** A copy of the migrations folder whose journal stops after `count` entries:
 * what an install of an older build has on disk. */
function migrationsFolderUpTo(count: number): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shotledger-migrations-'));
  fs.mkdirSync(path.join(folder, 'meta'));
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: { tag: string }[] };
  const entries = journal.entries.slice(0, count);
  fs.writeFileSync(
    path.join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
  );
  for (const { tag } of entries) {
    fs.copyFileSync(path.join(migrationsDir, `${tag}.sql`), path.join(folder, `${tag}.sql`));
  }
  return folder;
}

/** Tables, columns, indexes and triggers, by name: what a migration leaves behind. */
function shape(sqlite: Database.Database) {
  const objects = sqlite
    .prepare(
      `SELECT type, name, tbl_name FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'
       ORDER BY type, name`,
    )
    .all() as { type: string; name: string; tbl_name: string }[];
  return objects.map((object) =>
    object.type === 'table'
      ? {
          ...object,
          columns: (
            sqlite
              .prepare(`SELECT name, type, "notnull", dflt_value FROM pragma_table_info(?)`)
              .all(object.name) as object[]
          ).map((column) => JSON.stringify(column)),
        }
      : object,
  );
}

describe('the migration chain', () => {
  it('never edits a shipped migration', () => {
    const tags = journalTags();
    const shipped = Object.fromEntries(
      tags.filter((tag) => tag in SHIPPED_MIGRATIONS).map((tag) => [tag, sha256(tag)]),
    );
    expect(shipped).toEqual(SHIPPED_MIGRATIONS);
  });

  it('records every migration in SHIPPED_MIGRATIONS, in journal order', () => {
    expect(Object.keys(SHIPPED_MIGRATIONS)).toEqual(journalTags());
  });

  it('has a journal entry for every SQL file, and only those', () => {
    expect(
      fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort(),
    ).toEqual(journalTags().map((tag) => `${tag}.sql`));
  });

  it("imports every migration in migrations.js, the bundle's copy of the chain", () => {
    const barrel = fs.readFileSync(path.join(migrationsDir, 'migrations.js'), 'utf-8');
    for (const tag of journalTags()) expect(barrel).toContain(`'./${tag}.sql'`);
  });

  it("upgrades a database from every earlier migration with Drizzle's migrator, keeping its rows", () => {
    const fresh = new Database(':memory:');
    migrate(drizzle(fresh), { migrationsFolder: migrationsDir });

    // count = journal length is the reinstall of the same build: a no-op.
    for (let count = 1; count <= journalTags().length; count++) {
      const sqlite = new Database(':memory:');
      const db = drizzle(sqlite);
      migrate(db, { migrationsFolder: migrationsFolderUpTo(count) });
      // Written against 0000_baseline; a later migration that recreates one
      // of these tables must carry the rows across.
      sqlite.exec(`
        INSERT INTO firearms (id, created_at, updated_at, make, model)
          VALUES ('f1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Pardini', 'SP');
        INSERT INTO sessions (id, created_at, updated_at, name, type, discipline_id, started_at, firearm_id)
          VALUES ('s1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Training',
                  'training', 'spsf-precision', '2026-01-01T00:00:00.000Z', 'f1');
        INSERT INTO series (id, created_at, updated_at, session_id, position)
          VALUES ('r1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 's1', 0);
        INSERT INTO shots (id, created_at, updated_at, series_id, position, value_tenths)
          VALUES ('h1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'r1', 0, 100);
      `);

      migrate(db, { migrationsFolder: migrationsDir });

      expect({ from: count, shape: shape(sqlite) }).toEqual({ from: count, shape: shape(fresh) });
      expect(
        sqlite
          .prepare(
            `SELECT (SELECT COUNT(*) FROM firearms) AS firearms, (SELECT COUNT(*) FROM sessions) AS sessions,
                    (SELECT COUNT(*) FROM series) AS series, (SELECT COUNT(*) FROM shots) AS shots`,
          )
          .get(),
      ).toEqual({ firearms: 1, sessions: 1, series: 1, shots: 1 });
    }
  });

  // N3 stood here and applied 0002_firearm_is_own over the baseline to prove
  // existing rows were backfilled. The baseline reset deleted that migration,
  // so the test had no subject left; the invariant it guarded — a firearm
  // recorded without is_own is the shooter's own (maintainer, 2026-09-18) —
  // is what N3b asserts, against the schema rather than against a migration.
  it('N3b: a row inserted without is_own is own', () => {
    const sqlite = freshDatabase();
    sqlite
      .prepare(
        `INSERT INTO firearms (id, created_at, updated_at, make, model)
         VALUES ('f2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'B', '2')`,
      )
      .run();
    expect(sqlite.prepare('SELECT is_own FROM firearms WHERE id = ?').get('f2')).toEqual({
      is_own: 1,
    });
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

  // docs/specs/sync-tags-settings-spec.md A1/N8: any unique index here wedges
  // a pull when two devices write the same pair or name concurrently.
  it('A1 has no unique index over a tag link pair or a tag name', () => {
    const sqlite = freshDatabase();
    const uniqueColumns = (table: string) =>
      (
        sqlite.prepare(`SELECT name, "unique" AS u FROM pragma_index_list(?)`).all(table) as {
          name: string;
          u: number;
        }[]
      )
        .filter((index) => index.u === 1)
        .map((index) =>
          (
            sqlite.prepare(`SELECT name FROM pragma_index_info(?)`).all(index.name) as {
              name: string;
            }[]
          ).map((column) => column.name),
        );
    expect(uniqueColumns('session_tags')).toEqual([['id']]);
    expect(uniqueColumns('tags')).toEqual([['id']]);
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
 * instead of on behavior. The carried-over triggers arrive with their own
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
