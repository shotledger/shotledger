import { describe, expect, it } from 'vitest';

import { stringifyRows } from './csv-codec';
import { exportSessionsToCsv } from './export';
import { groupRowsIntoSessions, parseImportCsv } from './import';
import { CSV_COLUMNS, type SessionExport } from './types';

function baseSession(overrides: Partial<SessionExport> = {}): SessionExport {
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
    series: [
      {
        position: 1,
        isSighter: false,
        isFinal: false,
        shots: [{ position: 1, valueTenths: 95, isInnerTen: false }],
      },
    ],
    ...overrides,
  };
}

function withColumns(overrides: Record<string, string>): string {
  const base: Record<string, string> = {
    session_id: 's1',
    session_name: 'Kvällsträning',
    session_type: 'training',
    discipline_id: 'precision',
    program_id: '',
    competition_level: '',
    is_championship: '0',
    competition_name: '',
    weapon_group: '',
    shooter_class: '',
    firearm: '',
    ammo_lot: '',
    started_at: '2026-08-01T18:00:00.000Z',
    location: '',
    notes: '',
    decimal_scoring: '0',
    extra_rounds: '',
    tags: '',
    series_position: '1',
    is_sighter: '0',
    is_final: '0',
    shot_position: '1',
    value_tenths: '95',
    is_inner_ten: '0',
    ...overrides,
  };
  return stringifyRows([CSV_COLUMNS.map((c) => base[c] ?? '')]);
}

function rowsToCsv(dataRows: readonly string[]): string {
  return [stringifyRows([[...CSV_COLUMNS]]), ...dataRows].join('\r\n');
}

describe('parseImportCsv', () => {
  it('returns no rows for empty input', () => {
    expect(parseImportCsv('')).toEqual({ entries: [], errors: [] });
  });

  it('reports a single error for a header missing required columns', () => {
    const { entries, errors } = parseImportCsv('session_id,session_name\r\ns1,Test');
    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('missing column(s)');
  });

  it('ignores a trailing blank line', () => {
    const text = rowsToCsv([withColumns({})]) + '\r\n';
    const { entries, errors } = parseImportCsv(text);
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  it('treats a row shorter than the header as blank for its missing columns', () => {
    // Fewer fields than the header — the missing trailing columns default to ''.
    const text = `${stringifyRows([[...CSV_COLUMNS]])}\r\ns1,Test,training,precision`;
    const { entries, errors } = parseImportCsv(text);
    expect(errors.length).toBeGreaterThan(0); // started_at etc. required and now blank
    expect(entries).toEqual([]);
  });

  it('parses a well-formed row into a typed CsvRow', () => {
    const { entries, errors } = parseImportCsv(exportSessionsToCsv([baseSession()]));
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.data.value_tenths).toBe(95);
    expect(entries[0]!.data.session_id).toBe('s1');
  });

  it('reports value_tenths out of range as a row error, not a throw', () => {
    const { entries, errors } = parseImportCsv(rowsToCsv([withColumns({ value_tenths: '999' })]));
    expect(entries).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!).toMatchObject({ row: 1, column: 'value_tenths' });
  });

  it('reports a missing required column as a row error', () => {
    const { entries, errors } = parseImportCsv(rowsToCsv([withColumns({ session_id: '' })]));
    expect(entries).toHaveLength(0);
    expect(errors[0]!).toMatchObject({ row: 1, column: 'session_id' });
  });

  it('reports an invalid session_type as a row error', () => {
    const { errors } = parseImportCsv(rowsToCsv([withColumns({ session_type: 'friendly' })]));
    expect(errors[0]!).toMatchObject({ row: 1, column: 'session_type' });
  });

  it('reports an unparseable boolean as a row error', () => {
    const { errors } = parseImportCsv(rowsToCsv([withColumns({ is_sighter: 'maybe' })]));
    expect(errors[0]!).toMatchObject({ row: 1, column: 'is_sighter' });
  });
});

describe('groupRowsIntoSessions', () => {
  it('groups shots by session, ordering series then shots by position', () => {
    const session = baseSession({
      series: [
        {
          position: 2,
          isSighter: false,
          isFinal: false,
          shots: [
            { position: 2, valueTenths: 80, isInnerTen: false },
            { position: 1, valueTenths: 90, isInnerTen: false },
          ],
        },
        { position: 1, isSighter: false, isFinal: false, shots: [{ position: 1, valueTenths: 100, isInnerTen: true }] },
      ],
    });
    const { entries } = parseImportCsv(exportSessionsToCsv([session]));
    const { groups, errors } = groupRowsIntoSessions(entries);
    expect(errors).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.series.map((s) => s.position)).toEqual([1, 2]);
    expect(groups[0]!.series[1]!.shots.map((s) => s.position)).toEqual([1, 2]);
  });

  it('rejects conflicting session-level values across rows sharing a session_id', () => {
    const text = rowsToCsv([
      withColumns({ shot_position: '1' }),
      withColumns({ session_name: 'Different name', shot_position: '2' }),
    ]);
    const { entries } = parseImportCsv(text);
    const { errors } = groupRowsIntoSessions(entries);
    expect(errors.some((e) => e.column === 'session_name')).toBe(true);
  });

  it('rejects a duplicate (series_position, shot_position) pair within a session', () => {
    const text = rowsToCsv([
      withColumns({ shot_position: '1' }),
      withColumns({ shot_position: '1' }),
    ]);
    const { entries } = parseImportCsv(text);
    const { errors } = groupRowsIntoSessions(entries);
    expect(errors.some((e) => e.message.includes('duplicate shot_position'))).toBe(true);
  });

  it('rejects a session-only row mixed with shot rows for the same session', () => {
    const text = rowsToCsv([
      withColumns({ shot_position: '1' }),
      withColumns({ series_position: '', shot_position: '' }),
    ]);
    const { entries } = parseImportCsv(text);
    const { errors } = groupRowsIntoSessions(entries);
    expect(errors.some((e) => e.message.includes('session-only row with series rows'))).toBe(
      true,
    );
  });

  it('rejects more than one session-only row for the same session', () => {
    const text = rowsToCsv([
      withColumns({ series_position: '', shot_position: '' }),
      withColumns({ series_position: '', shot_position: '' }),
    ]);
    const { entries } = parseImportCsv(text);
    const { groups, errors } = groupRowsIntoSessions(entries);
    expect(errors.some((e) => e.message.includes('more than one session-only row'))).toBe(true);
    expect(groups).toHaveLength(1);
  });

  it('rejects an empty-series row mixed with shot rows in the same series', () => {
    const text = rowsToCsv([
      withColumns({ shot_position: '1' }),
      withColumns({ shot_position: '' }),
    ]);
    const { entries } = parseImportCsv(text);
    const { errors } = groupRowsIntoSessions(entries);
    expect(
      errors.some((e) => e.message.includes('mixes an empty-series row with shot rows')),
    ).toBe(true);
  });

  it('rejects more than one empty-series row for the same series', () => {
    const text = rowsToCsv([
      withColumns({ shot_position: '' }),
      withColumns({ shot_position: '' }),
    ]);
    const { entries } = parseImportCsv(text);
    const { groups, errors } = groupRowsIntoSessions(entries);
    expect(errors.some((e) => e.message.includes('more than one empty-series row'))).toBe(true);
    expect(groups[0]!.series).toHaveLength(1);
  });

  it('groups an extra_rounds-only session into zero series', () => {
    const session = baseSession({ extraRounds: 5, series: [] });
    const { entries } = parseImportCsv(exportSessionsToCsv([session]));
    const { groups, errors } = groupRowsIntoSessions(entries);
    expect(errors).toEqual([]);
    expect(groups[0]!.series).toEqual([]);
    expect(groups[0]!.extraRounds).toBe(5);
  });
});
