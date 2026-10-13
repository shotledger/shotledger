// The web's session edit and delete end to end
// (docs/specs/web-session-edit-spec.md W1–W4): the shared builders and
// pushChanges, the real HTTP transport, the real Worker, real D1 and
// better-auth, in process. One account, a "web" token and a "device B" token;
// device B owns the logbook.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildSessionDelete,
  buildSessionEdit,
  createAccountApi,
  createHttpSyncTransport,
  openedSession,
  pushChanges,
  PROTOCOL_VERSION,
  type ChangeRow,
  type ClientChange,
  type EditContext,
  type EditResult,
  type SessionEditDraft,
  type SyncTableName,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://localhost';
const PASSWORD = 'correct horse battery staple';
const NOW = '2026-10-12T10:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

async function fetchApp(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(input, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

const client = (getToken: () => string | null) => ({
  account: createAccountApi({ fetchImpl: fetchApp, baseUrl: BASE_URL, getToken }),
  transport: createHttpSyncTransport({ fetchImpl: fetchApp, baseUrl: BASE_URL, getToken }),
});
type Client = ReturnType<typeof client>;

let counter = 0;
const uuid = (version: 4 | 7) => () =>
  `00000000-0000-${version}000-8000-${(counter += 1).toString(16).padStart(12, '0')}`;

const TABLES: SyncTableName[] = [
  'firearms',
  'ammo_lots',
  'sessions',
  'session_tags',
  'series',
  'shots',
  'falt_stations',
];

/** Every row of these tables, pulled from cursor 0, tombstones included. */
async function pullAll(transport: Client['transport']) {
  const rows = new Map<string, ChangeRow>();
  let cursors = TABLES.map((tableName) => ({ tableName, cursor: 0 }));
  while (cursors.length > 0) {
    const response = await transport.pull({ protocolVersion: PROTOCOL_VERSION, tables: cursors });
    for (const change of response.changes) rows.set(`${change.tableName}:${change.rowId}`, change);
    cursors = response.nextCursors
      .filter((next) => next.hasMore)
      .map(({ tableName, cursor }) => ({ tableName, cursor }));
  }
  return rows;
}

/** What the web page builds from: the live rows by id, per table. */
async function webContext(transport: Client['transport']): Promise<EditContext> {
  const rows = await pullAll(transport);
  const table = (name: SyncTableName) =>
    new Map(
      [...rows.values()]
        .filter((row) => row.tableName === name && row.deletedAt === null)
        .map((row) => [row.rowId, row.payload as Record<string, unknown>]),
    );
  return {
    sessions: table('sessions'),
    series: table('series'),
    shots: table('shots'),
    faltStations: table('falt_stations'),
    firearms: table('firearms'),
    ammoLots: table('ammo_lots'),
  };
}

const common = (id: string) => ({ id, created_at: OLD, updated_at: OLD, deleted_at: null });

const firearm = (id: string, roundCount: number) => ({
  ...common(id),
  make: 'Make',
  model: id,
  caliber: '.22 LR',
  weapon_type: 'pistol',
  is_own: true,
  serial_number: null,
  vapen_id: null,
  load_system: null,
  notes: null,
  round_count: roundCount,
  maintenance_interval_rounds: null,
  rounds_since_maintenance: roundCount,
});

const shot = (id: string, seriesId: string, position: number) => ({
  ...common(id),
  series_id: seriesId,
  position,
  value_tenths: 90,
  is_inner_ten: 0,
  is_inner_ten_decimal: 0,
});

/** s1 on f1: r1 (3 shots), r2 (2 shots), tagged; 5 rounds. f2 has 10. */
const LOGBOOK: [SyncTableName, Record<string, unknown>][] = [
  ['firearms', firearm('f1', 100)],
  ['firearms', firearm('f2', 10)],
  ['tags', { ...common('t1'), name: 'KM' }],
  [
    'sessions',
    {
      ...common('s1'),
      name: 'Session s1',
      type: 'training',
      kind: 'series',
      discipline_id: 'spsf-precision',
      program_id: null,
      firearm_id: 'f1',
      ammo_lot_id: null,
      location: 'Range A',
      notes: null,
      decimal_scoring: 0,
      series_length: null,
      extra_rounds: null,
      started_at: '2026-05-01T10:00:00.000Z',
    },
  ],
  ['session_tags', { ...common('l1'), session_id: 's1', tag_id: 't1' }],
  [
    'series',
    {
      ...common('r1'),
      session_id: 's1',
      position: 1,
      is_sighter: 0,
      is_final: 0,
      is_total_override: 0,
      photo_uri: 'photo-r1',
    },
  ],
  [
    'series',
    {
      ...common('r2'),
      session_id: 's1',
      position: 2,
      is_sighter: 0,
      is_final: 0,
      is_total_override: 0,
    },
  ],
  ['shots', shot('h1', 'r1', 1)],
  ['shots', shot('h2', 'r1', 2)],
  ['shots', shot('h3', 'r1', 3)],
  ['shots', shot('h4', 'r2', 1)],
  ['shots', shot('h5', 'r2', 2)],
];

let web: Client;
let deviceB: Client;
let accountSeq = 0;
const deps = () => ({ newId: uuid(7), newChangeId: uuid(4), now: () => NOW });

function changesOf(result: EditResult): ClientChange[] {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

async function edit(draft: SessionEditDraft): Promise<ClientChange[]> {
  const context = await webContext(web.transport);
  return changesOf(
    buildSessionEdit(draft, openedSession(draft.sessionId, context)!, context, deps()),
  );
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `edit-${accountSeq}@example.invalid`;
  const signedUp = await client(() => null).account.signUp(email, PASSWORD, 'Test Shooter');
  const tokenB = signedUp.token;
  deviceB = client(() => tokenB);
  const webToken = (await client(() => null).account.signIn(email, PASSWORD)).token;
  web = client(() => webToken);

  await deviceB.transport.push({
    protocolVersion: PROTOCOL_VERSION,
    changes: LOGBOOK.map(([tableName, payload]) => ({
      clientChangeId: uuid(4)(),
      tableName,
      rowId: payload.id as string,
      payload,
      deletedAt: null,
      updatedAt: OLD,
    })),
  });
});

const EDIT: SessionEditDraft = {
  sessionId: 's1',
  fields: { firearmId: 'f2', location: 'Range B' },
  series: [{ id: 'r1', text: '10 10 10 10', isSighter: false, deleted: false }],
};

describe('the web session edit path', () => {
  it('W1 an edit with a firearm change and a re-entered series, pushed over HTTP, is pulled by device B as built', async () => {
    const changes = await edit(EDIT);
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const rows = await pullAll(deviceB.transport);
    for (const change of changes) {
      const row = rows.get(`${change.tableName}:${change.rowId}`)!;
      expect(row.payload).toEqual(change.payload);
      expect(row.deletedAt).toBe(change.deletedAt);
    }
    expect(rows.get('sessions:s1')?.payload).toMatchObject({
      firearm_id: 'f2',
      location: 'Range B',
      name: 'Session s1',
    });
    // 5 rounds off f1; 6 onto f2 (r1 now has four shots).
    expect(rows.get('firearms:f1')?.payload).toMatchObject({ round_count: 95 });
    expect(rows.get('firearms:f2')?.payload).toMatchObject({ round_count: 16 });
    for (const id of ['h1', 'h2', 'h3']) expect(rows.get(`shots:${id}`)?.deletedAt).toBe(NOW);
    // The series row was not written: its photo is as device B left it.
    expect(rows.get('series:r1')?.payload).toMatchObject({ photo_uri: 'photo-r1' });
    expect(rows.get('series:r1')?.updatedAt).toBe(OLD);
  });

  it('W2 a delete, pushed over HTTP: device B pulls the tombstones and the firearm counters', async () => {
    const changes = changesOf(buildSessionDelete('s1', await webContext(web.transport), deps()));
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const rows = await pullAll(deviceB.transport);
    for (const key of [
      'sessions:s1',
      'series:r1',
      'series:r2',
      'shots:h1',
      'shots:h2',
      'shots:h3',
      'shots:h4',
      'shots:h5',
    ]) {
      expect(rows.get(key)).toMatchObject({ payload: null, deletedAt: NOW });
    }
    expect(rows.get('firearms:f1')?.payload).toMatchObject({
      round_count: 95,
      rounds_since_maintenance: 95,
    });
    // The tag link is left as the phone's delete leaves it.
    expect(rows.get('session_tags:l1')?.deletedAt).toBeNull();
  });

  it('W3 resending the same request answers duplicate for every change and moves nothing twice', async () => {
    const changes = await edit(EDIT);
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const before = await pullAll(deviceB.transport);

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const after = await pullAll(deviceB.transport);
    for (const [key, row] of after) expect(row.seq).toBe(before.get(key)!.seq);
    expect(after.get('firearms:f2')?.payload).toMatchObject({ round_count: 16 });
  });

  it('W4 the session tombstoned by device B first: the session change is rejected, the rest applied', async () => {
    const changes = await edit(EDIT);
    await deviceB.transport.push({
      protocolVersion: PROTOCOL_VERSION,
      changes: [
        {
          clientChangeId: uuid(4)(),
          tableName: 'sessions',
          rowId: 's1',
          payload: null,
          deletedAt: '2026-10-12T09:00:00.000Z',
          updatedAt: '2026-10-12T09:00:00.000Z',
        },
      ],
    });
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'sessions', rowId: 's1', reason: 'tombstoned' }],
    });
    const rows = await pullAll(deviceB.transport);
    expect(rows.get('sessions:s1')?.deletedAt).toBe('2026-10-12T09:00:00.000Z');
    // The counter moves landed: what E8 names for Adjust Round Count.
    expect(rows.get('firearms:f1')?.payload).toMatchObject({ round_count: 95 });
    expect(rows.get('firearms:f2')?.payload).toMatchObject({ round_count: 16 });
  });
});
