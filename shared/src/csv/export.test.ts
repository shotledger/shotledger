import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv-codec';
import { buildCsvRows, exportSessionsToCsv } from './export';
import { CSV_COLUMNS, type SessionExport } from './types';

function session(overrides: Partial<SessionExport> = {}): SessionExport {
  return {
    id: 's1',
    name: 'Kvällsträning',
    type: 'training',
    disciplineId: 'precision',
    programId: null,
    competitionLevel: null,
    isChampionship: false,
    competitionName: null,
    weaponGroup: null,
    shooterClass: null,
    firearm: null,
    ammoLot: null,
    startedAt: '2026-08-01T18:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: false,
    extraRounds: null,
    tags: [],
    series: [],
    ...overrides,
  };
}

describe('buildCsvRows', () => {
  it('emits one row per shot, all sharing session-level columns', () => {
    const rows = buildCsvRows([
      session({
        series: [
          {
            position: 1,
            isSighter: false,
            isFinal: false,
            shots: [
              { position: 1, valueTenths: 90, isInnerTen: false },
              { position: 2, valueTenths: 100, isInnerTen: true },
            ],
          },
          {
            position: 2,
            isSighter: false,
            isFinal: false,
            shots: [{ position: 1, valueTenths: 85, isInnerTen: false }],
          },
        ],
      }),
    ]);

    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(4); // header + 3 shots
    for (const row of rows.slice(1)) {
      expect(row[0]).toBe('s1'); // session_id
    }
  });

  it('emits exactly one row for an empty series', () => {
    const rows = buildCsvRows([
      session({ series: [{ position: 1, isSighter: false, isFinal: false, shots: [] }] }),
    ]);
    expect(rows).toHaveLength(2);
    const row = rows[1]!;
    expect(row[CSV_COLUMNS.indexOf('series_position')]).toBe('1');
    expect(row[CSV_COLUMNS.indexOf('shot_position')]).toBe('');
  });

  it('emits exactly one session-only row for extra_rounds with zero series', () => {
    const rows = buildCsvRows([session({ extraRounds: 5, series: [] })]);
    expect(rows).toHaveLength(2);
    const row = rows[1]!;
    expect(row[CSV_COLUMNS.indexOf('extra_rounds')]).toBe('5');
    expect(row[CSV_COLUMNS.indexOf('series_position')]).toBe('');
    expect(row[CSV_COLUMNS.indexOf('shot_position')]).toBe('');
    expect(row[CSV_COLUMNS.indexOf('value_tenths')]).toBe('');
  });

  it('emits exactly one row for a session with no series and no extra_rounds', () => {
    const rows = buildCsvRows([session({ series: [] })]);
    expect(rows).toHaveLength(2);
  });

  it('renders firearm/ammo_lot/tags and blanks them when absent', () => {
    const rows = buildCsvRows([
      session({ firearm: 'Pardini SP', ammoLot: 'SK Standard', tags: ['KM', 'Tävling'] }),
      session({ id: 's2' }),
    ]);
    const [row1, row2] = rows.slice(1) as [string[], string[]];
    expect(row1[CSV_COLUMNS.indexOf('firearm')]).toBe('Pardini SP');
    expect(row1[CSV_COLUMNS.indexOf('ammo_lot')]).toBe('SK Standard');
    expect(row1[CSV_COLUMNS.indexOf('tags')]).toBe('KM|Tävling');
    expect(row2[CSV_COLUMNS.indexOf('firearm')]).toBe('');
    expect(row2[CSV_COLUMNS.indexOf('tags')]).toBe('');
  });

  it('round-trips through parseCsv to the same header and row count', () => {
    const sessions = [
      session({
        series: [
          {
            position: 1,
            isSighter: false,
            isFinal: false,
            shots: [{ position: 1, valueTenths: 95, isInnerTen: false }],
          },
        ],
      }),
      session({ id: 's2', extraRounds: 3, series: [] }),
    ];
    const text = exportSessionsToCsv(sessions);
    const matrix = parseCsv(text);
    expect(matrix[0]).toEqual([...CSV_COLUMNS]);
    expect(matrix).toHaveLength(3); // header + 1 shot row + 1 session-only row
  });
});
