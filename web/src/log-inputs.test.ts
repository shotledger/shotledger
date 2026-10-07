import { disciplineSeriesLength } from '@shotledger/shared/src/disciplines';
import { describe, expect, it } from 'vitest';

import { logInputs } from './log-inputs';
import type { PulledTables } from './pull';

const table = (rows: Record<string, unknown>[]) =>
  new Map(rows.map((row) => [row.id as string, row]));

const session = {
  id: 's1',
  name: 'Tuesday',
  type: 'competition',
  competition_name: 'KM',
  discipline_id: 'spsf-precision',
  started_at: '2026-10-01T10:00:00.000Z',
  weapon_group: 'C',
  shooter_class: '2',
  location: 'Range',
  firearm_id: 'f1',
  extra_rounds: 3,
  deleted_at: null,
};

const series = (id: string, sessionId: string, extra: Record<string, unknown> = {}) => ({
  id,
  session_id: sessionId,
  is_total_override: 0,
  total_override_shot_count: null,
  deleted_at: null,
  ...extra,
});

function tables(): PulledTables {
  return {
    sessions: table([
      session,
      { ...session, id: 's2', discipline_id: 'spsf-falt', extra_rounds: null, firearm_id: null },
      { ...session, id: 'gone', deleted_at: '2026-10-02' },
    ]),
    series: table([
      series('r1', 's1'),
      series('r2', 's1', { is_total_override: 1, total_override_shot_count: 6 }),
      series('r3', 's1', { is_total_override: 1 }),
      series('r4', 's1', { deleted_at: '2026-10-02' }),
    ]),
    shots: table([
      { id: 'x1', series_id: 'r1', deleted_at: null },
      { id: 'x2', series_id: 'r1', deleted_at: null },
      { id: 'x3', series_id: 'r1', deleted_at: '2026-10-02' },
      { id: 'x4', series_id: 'r4', deleted_at: null },
    ]),
    falt_stations: table([
      { id: 'f-1', session_id: 's2', deleted_at: null },
      { id: 'f-2', session_id: 's2', deleted_at: null },
      { id: 'f-3', session_id: 's2', deleted_at: '2026-10-02' },
    ]),
    tags: new Map(),
    firearms: table([
      { id: 'f1', make: 'Pardini', model: 'SP', deleted_at: null },
      { id: 'f2', make: 'Old', model: 'One', deleted_at: '2026-10-02' },
    ]),
    licenses: new Map(),
    ammo_lots: new Map(),
    session_tags: new Map(),
    settings: new Map(),
  };
}

describe('logInputs', () => {
  it('maps live sessions onto the log row shape', () => {
    const { sessions } = logInputs(tables());
    expect(sessions.map(({ id }) => id)).toEqual(['s1', 's2']);
    expect(sessions[0]).toMatchObject({
      startedAt: '2026-10-01T10:00:00.000Z',
      type: 'competition',
      competitionName: 'KM',
      disciplineId: 'spsf-precision',
      weaponGroup: 'C',
      shooterClass: '2',
      location: 'Range',
      firearmId: 'f1',
    });
  });

  it('resolves live firearms only, as the phone does', () => {
    const { firearms } = logInputs(tables());
    expect([...firearms]).toEqual([['f1', { make: 'Pardini', model: 'SP' }]]);
  });

  it('counts rounds fired by the shared volume rule', () => {
    const { volumes } = logInputs(tables());
    // 2 live shots + a stored total-only count of 6 + a total-only series
    // with none stored (the discipline's series length) + 3 extra rounds.
    expect(volumes.get('s1')).toBe(2 + 6 + disciplineSeriesLength('spsf-precision') + 3);
    // Two live fält stations, six rounds each.
    expect(volumes.get('s2')).toBe(12);
    expect(volumes.has('gone')).toBe(false);
  });
});
