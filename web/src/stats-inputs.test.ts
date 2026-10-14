import { describe, expect, it } from 'vitest';

import type { PulledTables } from './pull';
import { DEFAULT_ANALYTICS_FILTER } from '@shotledger/shared/src/analytics-rows';

import { statsInputs, statsReport } from './stats-inputs';

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
    firearms: table([]),
    firearm_groups: table([]),
    licenses: table([]),
    maintenance_events: table([]),
    ammo_lots: table([]),
    session_tags: new Map(),
    settings: new Map(),
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

// docs/specs/sync-tags-settings-spec.md W2/W3.
describe('synced tags and birth year', () => {
  const link = (id: string, tagId: string, deletedAt: string | null = null) => ({
    id,
    session_id: 's1',
    tag_id: tagId,
    deleted_at: deletedAt,
  });

  it('W2 gives a tagged session its tag ids once, on the canonical tag, ignoring tombstones', () => {
    const pulled = tables();
    pulled.tags = table([
      { id: 't1', name: 'Club', deleted_at: null },
      { id: 't2', name: 'Club', deleted_at: null },
      { id: 't3', name: 'Cup', deleted_at: null },
    ]);
    pulled.session_tags = table([link('l1', 't2'), link('l2', 't1'), link('l3', 't3', 'x')]);
    const inputs = statsInputs(pulled);
    expect(inputs.series[0]?.tagIds).toEqual(['t1']);
    expect(inputs.sessions[0]?.tagIds).toEqual(['t1']);
    expect(inputs.tags).toEqual([
      { id: 't1', name: 'Club' },
      { id: 't3', name: 'Cup' },
    ]);
  });

  it('W3 reads birthYear from its settings row', () => {
    const pulled = tables();
    pulled.settings = table([{ id: 'birthYear', value: '1958', deleted_at: null }]);
    expect(statsInputs(pulled).birthYear).toBe(1958);
  });

  it.each([
    ['absent', []],
    ['null', [{ id: 'birthYear', value: 'null', deleted_at: null }]],
    ['unparsable', [{ id: 'birthYear', value: '{', deleted_at: null }]],
    ['not a number', [{ id: 'birthYear', value: '"1958"', deleted_at: null }]],
    ['deleted', [{ id: 'birthYear', value: '1958', deleted_at: 'x' }]],
  ])('W3 birthYear is null when %s', (_label, rows) => {
    const pulled = tables();
    pulled.settings = table(rows);
    expect(statsInputs(pulled).birthYear).toBeNull();
  });
});

describe('statsReport', () => {
  const NOW = Date.parse('2026-10-06T12:00:00.000Z');

  it('composes the report and the previous equal period, as the phone does', () => {
    const inputs = statsInputs(tables());
    const { data, previous } = statsReport(
      { ...DEFAULT_ANALYTICS_FILTER, period: '30d' },
      inputs,
      NOW,
    );
    expect(data.sessionIds).toEqual(['s1']);
    expect(data.competitionCount).toBe(1);
    expect(previous?.sessionIds).toEqual([]);
  });

  it('has no previous period for all time', () => {
    const inputs = statsInputs(tables());
    expect(
      statsReport({ ...DEFAULT_ANALYTICS_FILTER, period: 'all' }, inputs, NOW).previous,
    ).toBeNull();
  });
});
