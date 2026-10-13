import { getTableColumns, getTableName } from 'drizzle-orm';
import { integer, real, sqliteTable, text, type SQLiteColumn } from 'drizzle-orm/sqlite-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SYNC_TABLES } from './tables';
import { fullRow, FIXTURE_NOW } from './payload-fixtures';
import {
  derivePayloadSchema,
  isFlagColumn,
  isIsoInstant,
  PAYLOAD_SCHEMAS,
  validatePayload,
} from './payload-schemas';
import { SYNC_TABLE_NAMES, type SyncTableName } from './protocol';

const NOW = '2026-08-01T10:00:00.000Z';

/** F: a firearm as the phone's toPayload sends it (spec §4). */
const F = {
  id: 'f1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  make: 'Anschutz',
  model: '1913',
  caliber: '.22 LR',
  weapon_type: 'rifle',
  is_own: true,
  serial_number: null,
  vapen_id: null,
  load_system: null,
  notes: null,
  round_count: 120,
  maintenance_interval_rounds: 500,
  rounds_since_maintenance: 20,
};

/** S: a session as the phone's toPayload sends it. */
const S = {
  id: 's1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  name: 'Training',
  type: 'training',
  kind: 'series',
  series_entry_mode: 'ask',
  discipline_id: 'spsf-precision',
  program_id: null,
  competition_level: null,
  is_championship: 0,
  competition_name: null,
  weapon_group: 'spsf:C',
  shooter_class: null,
  event_id: null,
  firearm_id: 'f1',
  ammo_lot_id: null,
  started_at: NOW,
  location: null,
  notes: null,
  ten_count: null,
  inner_ten_count: null,
  decimal_scoring: 0,
  series_length: null,
  falt_result_mode: null,
  extra_rounds: null,
  external_source: null,
  external_ref: null,
  official_placement: null,
  official_standardmedalj: null,
};

function live(tableName: SyncTableName, payload: unknown, rowId = 'f1', updatedAt = NOW) {
  return { tableName, rowId, updatedAt, payload, deletedAt: null };
}

const columnsOf = (tableName: SyncTableName) =>
  Object.values(getTableColumns(SYNC_TABLES[tableName]) as unknown as Record<string, SQLiteColumn>);

describe('validatePayload: valid rows', () => {
  it('P1 accepts F and S', () => {
    expect(validatePayload(live('firearms', F))).toEqual({ ok: true });
    expect(validatePayload(live('sessions', S, 's1'))).toEqual({ ok: true });
  });

  it.each(SYNC_TABLE_NAMES)('P1 accepts a whole %s row', (tableName) => {
    const row = fullRow(tableName, 'r1', { updated_at: NOW });
    expect(validatePayload(live(tableName, row, 'r1'))).toEqual({ ok: true });
  });

  it('P6 never checks a tombstone', () => {
    const tombstone = { ...live('firearms', null), deletedAt: NOW };
    expect(validatePayload(tombstone)).toEqual({ ok: true });
  });

  it('accepts a firearm owned by someone else (is_own false)', () => {
    expect(validatePayload(live('firearms', { ...F, is_own: false }))).toEqual({ ok: true });
  });
});

describe('validatePayload: P2 a malformed firearm is refused', () => {
  const { make: _make, ...withoutMake } = F;
  const { caliber: _caliber, ...withoutCaliber } = F;
  const cases: [string, unknown, string][] = [
    ['make: null (NOT NULL)', { ...F, make: null }, 'make'],
    ['make removed (missing key)', withoutMake, 'make'],
    ['caliber removed (missing nullable key)', withoutCaliber, 'caliber'],
    ['weapon_type: shotgun (enum)', { ...F, weapon_type: 'shotgun' }, 'weapon_type'],
    ['round_count: 1.5 (integer)', { ...F, round_count: 1.5 }, 'round_count'],
    ['round_count: "12" (type)', { ...F, round_count: '12' }, 'round_count'],
    ['is_own: 1 (boolean)', { ...F, is_own: 1 }, 'is_own'],
    ['created_at local time', { ...F, created_at: '2026-08-01 10:00' }, 'created_at'],
    ['created_at without ms', { ...F, created_at: '2026-08-01T10:00:00Z' }, 'created_at'],
    ['deleted_at set on a live change', { ...F, deleted_at: NOW }, 'deleted_at'],
    ['id empty', { ...F, id: '' }, 'id'],
    ['extra key colour', { ...F, colour: 'black' }, ''],
  ];

  it.each(cases)('%s', (_name, payload, path) => {
    const verdict = validatePayload(live('firearms', payload));
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.issues.map((issue) => issue.path)).toContain(path);
  });

  it('updated_at on a day that does not exist (envelope agrees)', () => {
    const bad = '2026-02-30T00:00:00.000Z';
    const verdict = validatePayload(live('firearms', { ...F, updated_at: bad }, 'f1', bad));
    expect(verdict).toEqual({ ok: false, issues: [{ path: 'updated_at', code: 'custom' }] });
  });

  it('C10 id differs from rowId', () => {
    expect(validatePayload(live('firearms', { ...F, id: 'f2' }))).toEqual({
      ok: false,
      issues: [{ path: 'id', code: 'envelope_mismatch' }],
    });
  });

  it('C10 updated_at differs from the envelope', () => {
    const later = '2026-08-02T10:00:00.000Z';
    expect(validatePayload(live('firearms', F, 'f1', later))).toEqual({
      ok: false,
      issues: [{ path: 'updated_at', code: 'envelope_mismatch' }],
    });
  });

  it.each([
    ['null on a live change', null],
    ['an array', [F]],
    ['a string', 'F'],
    ['a number', 1],
  ])('payload is %s: refused on its type alone, with no envelope check', (_name, payload) => {
    expect(validatePayload(live('firearms', payload))).toEqual({
      ok: false,
      issues: [{ path: '', code: 'invalid_type' }],
    });
  });

  it('flags are exactly 0 or 1', () => {
    for (const value of [2, -1, true, '1', null]) {
      const verdict = validatePayload(live('sessions', { ...S, is_championship: value }, 's1'));
      expect(verdict.ok, String(value)).toBe(false);
    }
    expect(validatePayload(live('sessions', { ...S, is_championship: 1 }, 's1')).ok).toBe(true);
  });

  it('a nullable FK accepts null and refuses an empty string', () => {
    expect(validatePayload(live('sessions', { ...S, firearm_id: null }, 's1')).ok).toBe(true);
    expect(validatePayload(live('sessions', { ...S, firearm_id: '' }, 's1')).ok).toBe(false);
  });

  it('a NOT NULL FK refuses null and an empty string', () => {
    const row = fullRow('series', 'r1', { updated_at: NOW, session_id: 's1' });
    expect(validatePayload(live('series', row, 'r1')).ok).toBe(true);
    for (const value of [null, '']) {
      expect(validatePayload(live('series', { ...row, session_id: value }, 'r1')).ok).toBe(false);
    }
  });

  it('started_at and performed_at are instants', () => {
    expect(validatePayload(live('sessions', { ...S, started_at: '2026-08-01' }, 's1')).ok).toBe(
      false,
    );
    const event = fullRow('maintenance_events', 'm1', { updated_at: NOW });
    expect(validatePayload(live('maintenance_events', event, 'm1')).ok).toBe(true);
    const local = { ...event, performed_at: '2026-08-01T12:00:00.000+02:00' };
    expect(validatePayload(live('maintenance_events', local, 'm1')).ok).toBe(false);
  });

  it('a real column accepts a fraction and refuses a string', () => {
    const lot = fullRow('ammo_lots', 'a1', { updated_at: NOW, velocity_mps: 312.5 });
    expect(validatePayload(live('ammo_lots', lot, 'a1')).ok).toBe(true);
    const bad = { ...lot, velocity_mps: '312' };
    expect(validatePayload(live('ammo_lots', bad, 'a1')).ok).toBe(false);
  });

  it('C12 settings.value must be JSON text', () => {
    const setting = (value: unknown) =>
      live('settings', fullRow('settings', 'birthYear', { updated_at: NOW, value }), 'birthYear');
    expect(validatePayload(setting('1980')).ok).toBe(true);
    expect(validatePayload(setting('"C"')).ok).toBe(true);
    expect(validatePayload(setting('not json')).ok).toBe(false);
    expect(validatePayload(setting(1980)).ok).toBe(false);
  });

  it('N6 an issue never carries the offending value', () => {
    const secret = 'SE-0000-SECRET';
    const verdict = validatePayload(live('firearms', { ...F, round_count: secret, [secret]: 1 }));
    expect(verdict.ok).toBe(false);
    expect(JSON.stringify(verdict)).not.toContain(secret);
  });
});

describe('isIsoInstant', () => {
  it.each([
    ['2026-08-01T10:00:00.000Z', true],
    ['2024-02-29T23:59:59.999Z', true],
    ['2026-02-29T00:00:00.000Z', false],
    ['2026-02-30T00:00:00.000Z', false],
    ['2026-02-28T24:00:00.000Z', false],
    ['2026-02-28T23:59:60.000Z', false],
    ['2026-08-01T10:00:00Z', false],
    ['2026-08-01T10:00:00.000+00:00', false],
    ['+002026-08-01T10:00:00.000Z', false],
    // Years past 9999 round-trip through Date, so only the shape refuses them.
    ['+010000-01-01T00:00:00.000Z', false],
    ['-000001-01-01T00:00:00.000Z', false],
    [' 2026-08-01T10:00:00.000Z', false],
    ['2026-08-01T10:00:00.000Z ', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isIsoInstant(value)).toBe(expected);
  });

  it('every toISOString() output is an instant', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('1900-01-01T00:00:00.000Z'),
          max: new Date('2200-01-01T00:00:00.000Z'),
          noInvalidDate: true,
        }),
        (date) => isIsoInstant(date.toISOString()),
      ),
    );
  });
});

describe('derivation from the Drizzle tables (C1)', () => {
  it.each(SYNC_TABLE_NAMES)('%s: the schema keys are exactly the column names', (tableName) => {
    const row = fullRow(tableName, 'r1', { updated_at: NOW });
    const names = columnsOf(tableName).map((column) => column.name);
    expect(Object.keys(row).sort()).toEqual([...names].sort());
    for (const name of names) {
      const { [name]: _dropped, ...without } = row;
      expect(PAYLOAD_SCHEMAS[tableName].safeParse(without).success, name).toBe(false);
    }
  });

  it.each(SYNC_TABLE_NAMES)('%s: NOT NULL refuses null, nullable accepts it', (tableName) => {
    const row = fullRow(tableName, 'r1', { updated_at: NOW });
    for (const column of columnsOf(tableName)) {
      const result = PAYLOAD_SCHEMAS[tableName].safeParse({ ...row, [column.name]: null });
      expect(result.success, column.name).toBe(!column.notNull);
    }
  });

  it.each(SYNC_TABLE_NAMES)('%s: an enum column refuses a value outside its list', (tableName) => {
    const row = fullRow(tableName, 'r1', { updated_at: NOW });
    for (const column of columnsOf(tableName)) {
      const enumValues = (column as { enumValues?: readonly string[] }).enumValues ?? [];
      if (enumValues.length === 0) continue;
      for (const value of enumValues) {
        expect(PAYLOAD_SCHEMAS[tableName].safeParse({ ...row, [column.name]: value }).success).toBe(
          true,
        );
      }
      const outside = { ...row, [column.name]: 'not-in-the-list' };
      expect(PAYLOAD_SCHEMAS[tableName].safeParse(outside).success, column.name).toBe(false);
    }
  });

  it('pins the 0/1 flag columns of every table', () => {
    const flags = Object.fromEntries(
      SYNC_TABLE_NAMES.map((tableName) => [
        tableName,
        columnsOf(tableName)
          .filter(isFlagColumn)
          .map((column) => column.name),
      ]),
    );
    expect(flags).toEqual({
      firearms: [],
      licenses: [],
      firearm_groups: ['is_default_for_group'],
      firearm_calibers: [],
      ammo_lots: ['is_handload'],
      sessions: ['is_championship', 'decimal_scoring'],
      series: ['is_sighter', 'is_final', 'is_total_override', 'is_shoot_off'],
      shots: ['is_inner_ten'],
      falt_stations: ['is_scratched', 'is_shoot_off'],
      maintenance_events: ['is_adjustment'],
      tags: [],
      sight_settings: ['is_active'],
      session_tags: [],
      settings: [],
    });
  });

  it('is_own (boolean mode) is not an integer flag', () => {
    const isOwn = columnsOf('firearms').find((column) => column.name === 'is_own')!;
    expect(isFlagColumn(isOwn)).toBe(false);
  });

  it('P9 a column added to a table reaches its schema with no edit here', () => {
    const before = sqliteTable('probe', {
      id: text('id').primaryKey(),
      updatedAt: text('updated_at').notNull(),
    });
    const after = sqliteTable('probe', {
      id: text('id').primaryKey(),
      updatedAt: text('updated_at').notNull(),
      newCount: integer('new_count').notNull(),
      newRatio: real('new_ratio'),
    });
    const row = { id: 'p1', updated_at: NOW };
    expect(derivePayloadSchema(before).safeParse(row).success).toBe(true);
    expect(derivePayloadSchema(after).safeParse(row).success).toBe(false);
    const whole = { ...row, new_count: 3, new_ratio: null };
    expect(derivePayloadSchema(after).safeParse(whole).success).toBe(true);
    expect(derivePayloadSchema(after).safeParse({ ...whole, new_count: 'x' }).success).toBe(false);
  });

  it('settings.value is JSON-checked only on the settings table', () => {
    const notes = sqliteTable('notes_probe', {
      id: text('id').primaryKey(),
      value: text('value').notNull(),
    });
    expect(getTableName(notes)).toBe('notes_probe');
    expect(derivePayloadSchema(notes).safeParse({ id: 'n', value: 'not json' }).success).toBe(true);
  });

  it('on the settings table, only the value column is JSON-checked', () => {
    const settings = sqliteTable('settings', {
      id: text('id').primaryKey(),
      value: text('value').notNull(),
      label: text('label').notNull(),
    });
    const schema = derivePayloadSchema(settings);
    expect(schema.safeParse({ id: 'k', value: '1', label: 'not json' }).success).toBe(true);
    expect(schema.safeParse({ id: 'k', value: 'not json', label: 'x' }).success).toBe(false);
  });

  it('the fixture rows use the shared clock', () => {
    expect(fullRow('tags', 't1').created_at).toBe(FIXTURE_NOW);
  });
});

// PAYLOAD_SCHEMAS is built once, at module load. These derive the schemas
// afresh, so each refinement is exercised by code that runs inside the test.
describe('the wire rules on a freshly derived schema', () => {
  const fresh = (tableName: SyncTableName) => derivePayloadSchema(SYNC_TABLES[tableName]);
  const accepts = (tableName: SyncTableName, overrides: Record<string, unknown> = {}) =>
    fresh(tableName).safeParse(fullRow(tableName, 'r1', overrides)).success;

  it('accepts a whole row of every table', () => {
    for (const tableName of SYNC_TABLE_NAMES) expect(accepts(tableName), tableName).toBe(true);
  });

  it.each<[SyncTableName, Record<string, unknown>]>([
    ['firearms', { deleted_at: FIXTURE_NOW }],
    ['firearms', { id: '' }],
    ['firearm_groups', { firearm_id: '' }],
    ['series', { session_id: '' }],
    ['firearms', { created_at: '2026-09-02 10:00' }],
    ['firearms', { updated_at: '2026-02-30T00:00:00.000Z' }],
    ['sessions', { started_at: '2026-09-02T10:00:00Z' }],
    ['maintenance_events', { performed_at: 'yesterday' }],
    ['sessions', { is_championship: 2 }],
    ['sessions', { decimal_scoring: true }],
    ['shots', { is_inner_ten: -1 }],
    ['settings', { value: 'not json' }],
  ])('%s refuses %o', (tableName, overrides) => {
    expect(accepts(tableName, overrides)).toBe(false);
  });

  it('a nullable foreign key still accepts null', () => {
    expect(accepts('sessions', { firearm_id: null })).toBe(true);
  });
});

describe('properties', () => {
  /** A valid value for one column, drawn from its kind. */
  function validValue(tableName: SyncTableName, column: SQLiteColumn): fc.Arbitrary<unknown> {
    const base = ((): fc.Arbitrary<unknown> => {
      const enumValues = (column as { enumValues?: readonly string[] }).enumValues ?? [];
      if (column.name === 'deleted_at') return fc.constant(null);
      if (/_at$/.test(column.name) && column.columnType === 'SQLiteText') {
        return fc
          .date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true })
          .map((date) => date.toISOString());
      }
      if (tableName === 'settings' && column.name === 'value') {
        return fc.jsonValue().map((value) => JSON.stringify(value));
      }
      if (isFlagColumn(column)) return fc.constantFrom(0, 1);
      if (enumValues.length > 0) return fc.constantFrom(...enumValues);
      if (column.columnType === 'SQLiteBoolean') return fc.boolean();
      if (column.columnType === 'SQLiteInteger') return fc.integer();
      if (column.columnType === 'SQLiteReal')
        return fc.double({ noNaN: true, min: -1e9, max: 1e9 });
      return fc.string({ minLength: 1 });
    })();
    return column.notNull ? base : fc.option(base, { nil: null });
  }

  const rowOf = (tableName: SyncTableName) =>
    fc.record(
      Object.fromEntries(
        columnsOf(tableName).map((column) => [column.name, validValue(tableName, column)]),
      ),
    );

  it('every row drawn from the column kinds passes', () => {
    fc.assert(
      fc.property(
        fc
          .constantFrom(...SYNC_TABLE_NAMES)
          .chain((tableName) => rowOf(tableName).map((row) => ({ tableName, row }))),
        ({ tableName, row }) =>
          validatePayload(live(tableName, row, row.id as string, row.updated_at as string)).ok,
      ),
    );
  });

  it('a row with one column corrupted fails', () => {
    // Values that no column accepts: wrong JSON type for every kind.
    const corruption = fc.constantFrom<unknown>({ nested: 1 }, [1], undefined);
    fc.assert(
      fc.property(
        fc.constantFrom(...SYNC_TABLE_NAMES).chain((tableName) =>
          fc.record({
            tableName: fc.constant(tableName),
            row: rowOf(tableName),
            column: fc.constantFrom(...columnsOf(tableName).map((column) => column.name)),
            bad: corruption,
          }),
        ),
        ({ tableName, row, column, bad }) => {
          const corrupted = { ...row, [column]: bad };
          if (bad === undefined) delete corrupted[column];
          const rowId = column === 'id' ? 'r1' : (row.id as string);
          return !validatePayload(live(tableName, corrupted, rowId, row.updated_at as string)).ok;
        },
      ),
    );
  });
});

describe('adversarial payloads', () => {
  it('refuses prototype keys', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const payload = JSON.parse(JSON.stringify(F).replace('{', `{"${key}":{"x":1},`)) as unknown;
      expect(validatePayload(live('firearms', payload)).ok, key).toBe(false);
    }
  });

  it('refuses deep nesting and large arrays in a column', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 1000; i += 1) deep = [deep];
    expect(validatePayload(live('firearms', { ...F, notes: deep })).ok).toBe(false);
    const big = Array.from({ length: 10_000 }, () => 0);
    expect(validatePayload(live('firearms', { ...F, notes: big })).ok).toBe(false);
  });

  it('validates 500 whole session rows quickly', () => {
    const started = performance.now();
    for (let i = 0; i < 500; i += 1) {
      expect(validatePayload(live('sessions', { ...S, notes: 'x'.repeat(2000) }, 's1')).ok).toBe(
        true,
      );
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
