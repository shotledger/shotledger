import { describe, expect, it } from 'vitest';

import { lastTimes, preselection, runningTotals } from './running-totals';

type Row = Record<string, unknown>;
const rows = (...list: Row[]) => new Map(list.map((row) => [String(row.id), row]));

const session = (id: string, startedAt: string, extra: Row = {}): Row => ({
  id,
  discipline_id: 'spsf-precision',
  firearm_id: null,
  started_at: startedAt,
  kind: 'series',
  decimal_scoring: 0,
  deleted_at: null,
  ...extra,
});
const series = (id: string, sessionId: string, position: number, extra: Row = {}): Row => ({
  id,
  session_id: sessionId,
  position,
  is_sighter: 0,
  is_final: 0,
  is_total_override: 0,
  total_override_tenths: null,
  deleted_at: null,
  ...extra,
});
let shotId = 0;
const shotsOf = (seriesId: string, values: number[]): Row[] =>
  values.map((value, index) => ({
    id: `shot-${(shotId += 1)}`,
    series_id: seriesId,
    position: index + 1,
    value_tenths: value,
    is_inner_ten: value === 100 ? 1 : 0,
    deleted_at: null,
  }));

describe('preselection', () => {
  const firearms = rows(
    { id: 'gun', make: 'Acme', model: 'T', deleted_at: null, archived_at: null },
    { id: 'old', make: 'Acme', model: 'O', deleted_at: null, archived_at: '2026-01-01' },
  );

  it('is null with no live session', () => {
    expect(
      preselection(rows(session('gone', '2026-10-01', { deleted_at: 'x' })), firearms),
    ).toBeNull();
  });

  it('takes the latest live session, its firearm only while pickable', () => {
    const sessions = rows(
      session('a', '2026-10-01T10:00:00Z', { discipline_id: 'spsf-milsnabb', firearm_id: 'gun' }),
      session('b', '2026-09-01T10:00:00Z', { firearm_id: 'gun' }),
    );
    expect(preselection(sessions, firearms)).toEqual({
      regulationId: 'spsf',
      disciplineId: 'spsf-milsnabb',
      firearmId: 'gun',
    });
    const archived = rows(session('c', '2026-10-01T10:00:00Z', { firearm_id: 'old' }));
    expect(preselection(archived, firearms)?.firearmId).toBeNull();
  });

  it('counts a session just saved that the rows do not hold yet', () => {
    expect(
      preselection(rows(session('a', '2026-10-01T10:00:00Z')), firearms, {
        disciplineId: 'spsf-milsnabb',
        firearmId: null,
        startedAt: '2026-10-05T10:00:00Z',
      })?.disciplineId,
    ).toBe('spsf-milsnabb');
  });
});

describe('runningTotals', () => {
  it('adds the scored rows, leaves sighters and unparsed rows out, and counts X', () => {
    expect(
      runningTotals([
        { isSighter: true, isFinal: false, shots: [{ valueTenths: 90, isInnerTen: false }] },
        {
          isSighter: false,
          isFinal: false,
          shots: [
            { valueTenths: 100, isInnerTen: true },
            { valueTenths: 80, isInnerTen: false },
          ],
        },
        { isSighter: false, isFinal: false, shots: null },
        { isSighter: false, isFinal: true, shots: [{ valueTenths: 100, isInnerTen: false }] },
      ]),
    ).toEqual({ totalTenths: 280, innerTens: 1 });
  });

  it('reads 0 and 0X for nothing typed', () => {
    expect(runningTotals([{ isSighter: false, isFinal: false, shots: [] }])).toEqual({
      totalTenths: 0,
      innerTens: 0,
    });
  });
});

describe('lastTimes', () => {
  const tables = {
    sessions: rows(
      session('prev', '2026-10-01T10:00:00Z'),
      session('older', '2026-09-01T10:00:00Z'),
      session('dec', '2026-10-05T10:00:00Z', { decimal_scoring: 1 }),
    ),
    series: rows(
      series('p1', 'prev', 1, { is_sighter: 1 }),
      series('p2', 'prev', 2),
      series('p3', 'prev', 3),
      series('o1', 'older', 1),
    ),
    shots: rows(
      ...shotsOf('p1', [70, 70]),
      ...shotsOf('p2', [100, 90, 90, 90, 90]),
      ...shotsOf('p3', [80, 80]),
      ...shotsOf('o1', [50]),
    ),
  };
  const current = {
    disciplineId: 'spsf-precision',
    startedAt: '2026-10-10T10:00:00.000Z',
    decimalScoring: false,
  };

  it('matches each typed row with the same scored series last time', () => {
    expect(
      lastTimes(tables, current, [
        { isSighter: false, isFinal: false },
        { isSighter: false, isFinal: false },
        { isSighter: false, isFinal: false },
      ]),
    ).toEqual([{ totalTenths: 460, innerTens: 1 }, { totalTenths: 160, innerTens: 0 }, null]);
  });

  it('gives a sighter nothing, and the next row still the first scored series', () => {
    expect(
      lastTimes(tables, current, [
        { isSighter: true, isFinal: false },
        { isSighter: false, isFinal: false },
      ]),
    ).toEqual([null, { totalTenths: 460, innerTens: 1 }]);
  });

  it('is empty without a valid start or an earlier session', () => {
    expect(
      lastTimes(tables, { ...current, startedAt: null }, [{ isSighter: false, isFinal: false }]),
    ).toEqual([null]);
    expect(
      lastTimes(tables, { ...current, startedAt: '2026-08-01T10:00:00.000Z' }, [
        { isSighter: false, isFinal: false },
      ]),
    ).toEqual([null]);
  });
});
