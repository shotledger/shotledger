import { describe, expect, it } from 'vitest';

import type { PulledTables } from './pull';
import { statsInputs } from './stats-inputs';

const table = (rows: Record<string, unknown>[]) =>
  new Map(rows.map((row) => [row.id as string, row]));

const sessionPayload = {
  id: 's1',
  name: 'Tuesday',
  type: 'competition',
  discipline_id: 'spsf-precision',
  program_id: null,
  started_at: '2026-10-01T10:00:00.000Z',
  weapon_group: 'spsf:C',
  shooter_class: '2',
  firearm_id: null,
  ammo_lot_id: null,
  extra_rounds: 10,
  falt_result_mode: null,
  deleted_at: null,
};

function tables(): PulledTables {
  return {
    sessions: table([sessionPayload, { ...sessionPayload, id: 'gone', deleted_at: '2026-10-02' }]),
    series: table([
      {
        id: 'r1',
        session_id: 's1',
        position: 1,
        is_sighter: 0,
        is_final: 0,
        is_total_override: 0,
        total_override_tenths: null,
        total_override_shot_count: null,
        deleted_at: null,
      },
    ]),
    shots: table([
      { id: 'x1', series_id: 'r1', value_tenths: 100, is_inner_ten: 1, deleted_at: null },
      { id: 'x2', series_id: 'r1', value_tenths: 90, is_inner_ten: 0, deleted_at: null },
    ]),
    falt_stations: new Map(),
    tags: table([{ id: 't1', name: 'Club', color: null, deleted_at: null }]),
  };
}

describe('statsInputs', () => {
  it('maps snake_case wire rows onto the shared builders', () => {
    const inputs = statsInputs(tables());
    expect(inputs.series).toEqual([
      expect.objectContaining({
        id: 'r1',
        sessionId: 's1',
        disciplineId: 'spsf-precision',
        sessionType: 'competition',
        isSighter: false,
        shots: [
          { valueTenths: 100, isInnerTen: true },
          { valueTenths: 90, isInnerTen: false },
        ],
        tagIds: [],
      }),
    ]);
    expect(inputs.sessions).toEqual([expect.objectContaining({ id: 's1', extraRounds: 10 })]);
    expect(inputs.falt).toEqual([]);
    expect(inputs.tags).toEqual([{ id: 't1', name: 'Club' }]);
    expect(inputs.sessionNames.get('s1')).toBe('Tuesday');
  });

  it('skips a row whose payload is soft-deleted', () => {
    expect(statsInputs(tables()).sessionNames.has('gone')).toBe(false);
  });
});
