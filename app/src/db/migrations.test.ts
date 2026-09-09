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

describe('0005 session kind backfill on a populated pre-0005 database', () => {
  const SESSION_KIND_TAG = '0006_session_kind';
  const T0 = '2026-01-01T00:00:00.000Z';

  function insertSession(
    sqlite: Database.Database,
    id: string,
    extraRounds: number | null,
    deletedAt: string | null = null,
  ) {
    sqlite
      .prepare(
        `INSERT INTO sessions (id, created_at, updated_at, deleted_at, name, type, discipline_id, started_at, is_championship, decimal_scoring, extra_rounds)
         VALUES (?, ?, ?, ?, ?, 'training', 'spsf-precision', ?, 0, 0, ?)`,
      )
      .run(id, T0, T0, deletedAt, id, T0, extraRounds);
  }

  function insertSeries(
    sqlite: Database.Database,
    id: string,
    sessionId: string,
    isSighter = 0,
    deletedAt: string | null = null,
  ) {
    sqlite
      .prepare(
        `INSERT INTO series (id, created_at, updated_at, deleted_at, session_id, position, is_sighter, is_final, is_total_override)
         VALUES (?, ?, ?, ?, ?, 1, ?, 0, 0)`,
      )
      .run(id, T0, T0, deletedAt, sessionId, isSighter);
  }

  /** A database migrated to the revision immediately before 0005, then seeded. */
  function populatedPre0005() {
    const tags = journalTags();
    const cutoff = tags.indexOf(SESSION_KIND_TAG);
    expect(cutoff).toBeGreaterThan(0);
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    tags.slice(0, cutoff).forEach((tag) => applyMigration(sqlite, tag));

    insertSession(sqlite, 'scored', null);
    insertSeries(sqlite, 'series-scored', 'scored');

    insertSession(sqlite, 'sighter-only', null);
    insertSeries(sqlite, 'series-sighter', 'sighter-only', 1);

    insertSession(sqlite, 'both', 30);
    insertSeries(sqlite, 'series-both', 'both');

    insertSession(sqlite, 'rounds-only', 40);

    insertSession(sqlite, 'zero-rounds', 0);
    insertSession(sqlite, 'empty', null);

    // Rounds, but its only series row is a tombstone — still round-count-only.
    insertSession(sqlite, 'deleted-series', 25);
    insertSeries(sqlite, 'series-tombstone', 'deleted-series', 0, T0);

    insertSession(sqlite, 'tombstoned', 15, T0);

    applyMigration(sqlite, SESSION_KIND_TAG);
    return sqlite;
  }

  function kinds(sqlite: Database.Database): Record<string, string> {
    const rows = sqlite.prepare('SELECT id, kind FROM sessions').all() as {
      id: string;
      kind: string;
    }[];
    return Object.fromEntries(rows.map((row) => [row.id, row.kind]));
  }

  it('classifies every existing row honestly', () => {
    expect(kinds(populatedPre0005())).toEqual({
      // any live series row wins, sighter-only and extra-rounds-too included
      scored: 'series',
      'sighter-only': 'series',
      both: 'series',
      // no live series row and rounds actually fired
      'rounds-only': 'rounds',
      'deleted-series': 'rounds',
      // nothing to go on: the shape that hides nothing
      'zero-rounds': 'series',
      empty: 'series',
      // tombstones are left at the default rather than resurrected
      tombstoned: 'series',
    });
  });

  it('never discards extra_rounds from a session that also has series', () => {
    const row = populatedPre0005()
      .prepare('SELECT extra_rounds AS extraRounds FROM sessions WHERE id = ?')
      .get('both') as { extraRounds: number };
    expect(row.extraRounds).toBe(30);
  });

  it('touches updated_at only on the rows it actually changed', () => {
    const sqlite = populatedPre0005();
    const rows = sqlite.prepare('SELECT id, updated_at AS updatedAt FROM sessions').all() as {
      id: string;
      updatedAt: string;
    }[];
    const changed = rows.filter((row) => row.updatedAt !== T0).map((row) => row.id);
    expect(changed.sort()).toEqual(['deleted-series', 'rounds-only']);
  });

  it('applies to a fresh database too, defaulting new rows to series', () => {
    const sqlite = new Database(':memory:');
    journalTags().forEach((tag) => applyMigration(sqlite, tag));
    insertSession(sqlite, 'fresh', null);
    const row = sqlite.prepare('SELECT kind FROM sessions WHERE id = ?').get('fresh') as {
      kind: string;
    };
    expect(row.kind).toBe('series');
  });
});

describe('0008 caliber and load-system backfill on a populated pre-0008 database', () => {
  const PRESETS_TAG = '0008_caliber_load_system_presets';
  const T0 = '2026-01-01T00:00:00.000Z';

  function insertFirearm(
    sqlite: Database.Database,
    id: string,
    caliber: string | null,
    loadSystem: string | null,
    deletedAt: string | null = null,
  ) {
    sqlite
      .prepare(
        `INSERT INTO firearms (id, created_at, updated_at, deleted_at, make, model, caliber, load_system, round_count, rounds_since_maintenance)
         VALUES (?, ?, ?, ?, 'Make', ?, ?, ?, 0, 0)`,
      )
      .run(id, T0, T0, deletedAt, id, caliber, loadSystem);
  }

  function insertAmmoLot(sqlite: Database.Database, id: string, caliber: string | null) {
    sqlite
      .prepare(
        `INSERT INTO ammo_lots (id, created_at, updated_at, deleted_at, label, caliber, is_handload)
         VALUES (?, ?, ?, NULL, ?, ?, 0)`,
      )
      .run(id, T0, T0, id, caliber);
  }

  /** A database migrated to the revision immediately before 0008, then seeded. */
  function populatedPre0008() {
    const tags = journalTags();
    const cutoff = tags.indexOf(PRESETS_TAG);
    expect(cutoff).toBeGreaterThan(0);
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    tags.slice(0, cutoff).forEach((tag) => applyMigration(sqlite, tag));

    insertFirearm(sqlite, 'canonical-already', '.22 LR', 'single_shot');
    insertFirearm(sqlite, 'swedish', '9x19', 'Halvautomat');
    insertFirearm(sqlite, 'shouty', '9MM LUGER', 'SEMI-AUTOMATIC');
    insertFirearm(sqlite, 'comma', '6,5x55 mm', 'Cylinderrepeter');
    insertFirearm(sqlite, 'diacritic', '.308 win', 'Hävstångsrepeter');
    insertFirearm(sqlite, 'ambiguous', '.22', 'Repeter');
    insertFirearm(sqlite, 'unknown', '.264 Wildcat', 'Gas-operated bullpup');
    insertFirearm(sqlite, 'empty', null, null);
    insertFirearm(sqlite, 'tombstoned', '9x19', 'Halvautomat', T0);

    insertAmmoLot(sqlite, 'lot-variant', '9 mm Luger');
    insertAmmoLot(sqlite, 'lot-canonical', '.22 LR');
    insertAmmoLot(sqlite, 'lot-unknown', 'House load 9.1mm');

    applyMigration(sqlite, PRESETS_TAG);
    return sqlite;
  }

  function firearmRows(sqlite: Database.Database) {
    return sqlite
      .prepare(
        'SELECT id, caliber, load_system AS loadSystem, updated_at AS updatedAt FROM firearms',
      )
      .all() as {
      id: string;
      caliber: string | null;
      loadSystem: string | null;
      updatedAt: string;
    }[];
  }

  it('rewrites every recognised caliber spelling to its canonical form', () => {
    const byId = Object.fromEntries(firearmRows(populatedPre0008()).map((r) => [r.id, r.caliber]));
    expect(byId).toEqual({
      'canonical-already': '.22 LR',
      swedish: '9×19 mm',
      shouty: '9×19 mm',
      comma: '6.5×55 mm',
      diacritic: '.308 Winchester',
      // deliberately ambiguous and unrecognised values survive verbatim
      ambiguous: '.22',
      unknown: '.264 Wildcat',
      empty: null,
      tombstoned: '9x19',
    });
  });

  it('normalises ammo lots by the same table', () => {
    const rows = populatedPre0008().prepare('SELECT id, caliber FROM ammo_lots').all() as {
      id: string;
      caliber: string | null;
    }[];
    expect(Object.fromEntries(rows.map((r) => [r.id, r.caliber]))).toEqual({
      'lot-variant': '9×19 mm',
      'lot-canonical': '.22 LR',
      'lot-unknown': 'House load 9.1mm',
    });
  });

  it('replaces display strings with load-system codes and keeps what it cannot read', () => {
    const byId = Object.fromEntries(
      firearmRows(populatedPre0008()).map((r) => [r.id, r.loadSystem]),
    );
    expect(byId).toEqual({
      'canonical-already': 'single_shot',
      swedish: 'semi_automatic',
      shouty: 'semi_automatic',
      comma: 'bolt_action',
      diacritic: 'lever_action',
      // "Repeter" is bolt, pump AND lever in Swedish — not ours to guess
      ambiguous: 'Repeter',
      unknown: 'Gas-operated bullpup',
      empty: null,
      tombstoned: 'Halvautomat',
    });
  });

  it('touches updated_at only on the rows it actually changed', () => {
    const changed = firearmRows(populatedPre0008())
      .filter((row) => row.updatedAt !== T0)
      .map((row) => row.id);
    expect(changed.sort()).toEqual(['comma', 'diacritic', 'shouty', 'swedish']);
  });

  it('is idempotent — re-applying changes nothing', () => {
    const sqlite = populatedPre0008();
    const before = firearmRows(sqlite);
    applyMigration(sqlite, PRESETS_TAG);
    expect(firearmRows(sqlite)).toEqual(before);
  });
});
