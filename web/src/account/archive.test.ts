import { describe, expect, it } from 'vitest';
import { importSessionsFromJson } from '@shotledger/shared/src/json-export';

import { WEB_TABLES, type PulledTables } from '../pull';
import { archivePhotos, buildArchive, sessionsJson } from './archive';

type Row = Record<string, unknown>;

function tables(rows: Partial<Record<keyof PulledTables, Row[]>>): PulledTables {
  return Object.fromEntries(
    WEB_TABLES.map((name) => [
      name,
      new Map((rows[name] ?? []).map((row) => [row.id as string, row])),
    ]),
  ) as PulledTables;
}

const session = {
  id: 's1',
  name: 'Club night',
  type: 'training',
  discipline_id: 'spsf-precision',
  program_id: null,
  competition_level: null,
  is_championship: 0,
  competition_name: null,
  weapon_group: 'C',
  shooter_class: null,
  event_id: null,
  firearm_id: 'f1',
  ammo_lot_id: 'a1',
  started_at: '2026-05-01T18:00:00.000Z',
  location: null,
  notes: null,
  decimal_scoring: 0,
  series_length: null,
  extra_rounds: null,
  falt_result_mode: null,
  deleted_at: null,
};

const series = (id: string, position: number, photoUri: string | null, extra: Row = {}) => ({
  id,
  session_id: 's1',
  position,
  is_sighter: 0,
  is_final: 0,
  is_total_override: 0,
  total_override_tenths: null,
  total_override_shot_count: null,
  photo_uri: photoUri,
  deleted_at: null,
  ...extra,
});

const pulled = tables({
  sessions: [session, { ...session, id: 'gone', deleted_at: '2026-05-02T00:00:00.000Z' }],
  series: [
    series('r1', 1, 'shotledger-photo:p1'),
    series('r2', 2, 'file:///local/only.jpg'),
    series('r3', 3, 'shotledger-photo:p3', { deleted_at: '2026-05-03T00:00:00.000Z' }),
    series('r4', 4, 'shotledger-photo:p4', { session_id: 'gone' }),
  ],
  shots: [
    {
      id: 'x1',
      series_id: 'r1',
      position: 1,
      value_tenths: 100,
      is_inner_ten: 1,
      deleted_at: null,
    },
  ],
  falt_stations: [
    {
      id: 'st1',
      session_id: 's1',
      position: 2,
      hits: 6,
      figures_hit: 3,
      figure_count: null,
      points: null,
      points_max: null,
      is_scratched: 0,
      is_shoot_off: 0,
      photo_uri: 'shotledger-photo:p9',
      note: null,
      deleted_at: null,
    },
  ],
  firearms: [
    {
      id: 'f1',
      make: 'Acme',
      model: 'Target',
      caliber: null,
      weapon_type: 'pistol',
      is_own: 1,
      serial_number: null,
      vapen_id: null,
      load_system: null,
      notes: null,
      round_count: 0,
      maintenance_interval_rounds: null,
      deleted_at: null,
    },
  ],
  ammo_lots: [{ id: 'a1', label: 'Lot 7', deleted_at: null }],
});

describe('sessionsJson', () => {
  it('writes live sessions in the published format, readable by the importer', () => {
    const text = sessionsJson(pulled, '1.2.3', '2026-10-06T00:00:00.000Z');
    const parsed = importSessionsFromJson(text);
    expect(parsed).toMatchObject({ errors: [], sessions: [{ id: 's1' }] });

    const envelope = JSON.parse(text);
    expect(envelope).toMatchObject({
      format: 'shotledger.sessions',
      generatedAt: '2026-10-06T00:00:00.000Z',
      app: { version: '1.2.3' },
      firearms: [{ id: 'f1', isOwn: true }],
    });
    expect(envelope.sessions).toHaveLength(1);
    expect(envelope.sessions[0]).toMatchObject({
      id: 's1',
      firearm: 'Acme Target',
      ammoLot: 'Lot 7',
      tags: [],
      series: [
        { position: 1, shots: [{ position: 1, valueTenths: 100, isInnerTen: true }] },
        { position: 2 },
      ],
      stations: [{ position: 2, hits: 6 }],
    });
  });
});

describe('sessionsJson maintenance log (#727 M6)', () => {
  it('carries the live maintenance events, adjustments included, readable by the importer', () => {
    const event = {
      id: 'm1',
      firearm_id: 'f1',
      performed_at: '2026-09-01T10:00:00.000Z',
      kind: 'Rengöring',
      round_count_at: 500,
      is_adjustment: 0,
      notes: null,
      deleted_at: null,
    };
    const text = sessionsJson(
      tables({
        maintenance_events: [
          event,
          { ...event, id: 'm2', kind: '', is_adjustment: 1, notes: '+10 · Club' },
          { ...event, id: 'm3', deleted_at: '2026-09-02T10:00:00.000Z' },
        ],
      }),
      '1.2.3',
    );
    const parsed = importSessionsFromJson(text);
    expect(parsed).toMatchObject({
      errors: [],
      maintenanceEvents: [
        {
          id: 'm1',
          firearmId: 'f1',
          performedAt: '2026-09-01T10:00:00.000Z',
          kind: 'Rengöring',
          roundCountAt: 500,
          isAdjustment: false,
          notes: null,
        },
        { id: 'm2', isAdjustment: true, notes: '+10 · Club' },
      ],
    });
    expect((parsed as { maintenanceEvents: unknown[] }).maintenanceEvents).toHaveLength(2);
  });
});

describe('sessionsJson tags', () => {
  it('W4 carries each session its live tag names, once each', () => {
    const withTags = tables({
      sessions: [session],
      tags: [
        { id: 't1', name: 'KM', deleted_at: null },
        { id: 't2', name: 'KM', deleted_at: null },
        { id: 't3', name: 'Cup', deleted_at: null },
      ],
      session_tags: [
        { id: 'l1', session_id: 's1', tag_id: 't1', deleted_at: null },
        { id: 'l2', session_id: 's1', tag_id: 't2', deleted_at: null },
        { id: 'l3', session_id: 's1', tag_id: 't3', deleted_at: 'x' },
      ],
    });
    const envelope = JSON.parse(sessionsJson(withTags, '1.2.3'));
    expect(envelope.sessions[0].tags).toEqual(['KM']);
  });
});

describe('archivePhotos', () => {
  it('lists uploaded photos of live rows under their session, and skips the rest', () => {
    expect(archivePhotos(pulled)).toEqual([
      { photoId: 'p1', path: 'photos/2026-05-01 Club night/series-1-p1.jpg' },
      { photoId: 'p9', path: 'photos/2026-05-01 Club night/station-2-p9.jpg' },
    ]);
  });

  it('keeps a session name from making folders or illegal characters', () => {
    const named = tables({
      sessions: [{ ...session, name: 'A/B: "x"' }],
      series: [series('r1', 1, 'shotledger-photo:p1')],
    });
    expect(archivePhotos(named)[0]!.path).toBe('photos/2026-05-01 A_B_ _x_/series-1-p1.jpg');
  });
});

describe('photo ids in the archive (QA #747)', () => {
  it('never lets an id leave its folder, and never fetches an unsafe one', async () => {
    const crafted = tables({
      sessions: [session],
      series: [
        series('r1', 1, 'shotledger-photo:../../evil'),
        series('r2', 2, 'shotledger-photo:a%2Fb'),
        series('r3', 3, 'shotledger-photo:p3'),
      ],
    });
    const paths = archivePhotos(crafted).map((photo) => photo.path);
    expect(paths).toEqual([
      'photos/2026-05-01 Club night/series-1-______evil.jpg',
      'photos/2026-05-01 Club night/series-2-a_2Fb.jpg',
      'photos/2026-05-01 Club night/series-3-p3.jpg',
    ]);
    const fetched: string[] = [];
    const { missing } = await buildArchive(crafted, '1.2.3', async (photoId) => {
      fetched.push(photoId);
      return new Uint8Array([1]).buffer;
    });
    expect(fetched).toEqual(['p3']);
    expect(missing).toBe(2);
  });
});

describe('buildArchive', () => {
  it('reports progress and lists a photo that failed instead of failing', async () => {
    const progress: string[] = [];
    const { zip, missing } = await buildArchive(
      pulled,
      '1.2.3',
      async (photoId) => {
        if (photoId === 'p9') throw new Error('404');
        return new Uint8Array([1, 2, 3]).buffer;
      },
      ({ done, total }) => progress.push(`${done}/${total}`),
    );
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
    expect(missing).toBe(1);

    const text = new TextDecoder('latin1').decode(new Uint8Array(await zip.arrayBuffer()));
    expect(text).toContain('sessions.json');
    expect(text).toContain('photos/2026-05-01 Club night/series-1-p1.jpg');
    expect(text).toContain('missing.txt');
    expect(text).toContain('station-2-p9.jpg\n');
  });
});
