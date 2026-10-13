// The web's bulk edit end to end (docs/specs/web-bulk-edit-spec.md W1–W4):
// the shared builder and pushChanges, the real HTTP transport, the real
// Worker, real D1 and better-auth, in process. One account, a "web" token and
// a "device B" token; device B owns the logbook.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildBulkEdit,
  createAccountApi,
  createHttpSyncTransport,
  pushChanges,
  PROTOCOL_VERSION,
  type BulkAction,
  type BulkContext,
  type ChangeRow,
  type ClientChange,
  type SyncTableName,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';
import { row } from './rows';

const BASE_URL = 'https://localhost';
const PASSWORD = 'correct horse battery staple';
const NOW = '2026-10-07T10:00:00.000Z';
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
  'tags',
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
async function webContext(transport: Client['transport']): Promise<BulkContext> {
  const rows = await pullAll(transport);
  const table = (name: SyncTableName) =>
    new Map(
      [...rows.values()]
        .filter((row) => row.tableName === name && row.deletedAt === null)
        .map((row) => [row.rowId, row.payload as Record<string, unknown>]),
    );
  return {
    sessions: table('sessions'),
    tags: table('tags'),
    sessionTags: table('session_tags'),
    firearms: table('firearms'),
    series: table('series'),
    shots: table('shots'),
    faltStations: table('falt_stations'),
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

const session = (id: string, firearmId: string | null) => ({
  ...common(id),
  name: `Session ${id}`,
  type: 'training',
  kind: 'series',
  discipline_id: 'spsf-precision',
  firearm_id: firearmId,
  location: 'Range A',
  extra_rounds: null,
  started_at: '2026-05-01T10:00:00.000Z',
});

/** s1, s2 on f1 with 3 and 2 shots; s3 on no firearm; tag KM on s1. */
const LOGBOOK: [SyncTableName, Record<string, unknown>][] = [
  ['firearms', firearm('f1', 100)],
  ['firearms', firearm('f2', 10)],
  ['tags', { ...common('t1'), name: 'KM' }],
  ['sessions', session('s1', 'f1')],
  ['sessions', session('s2', 'f1')],
  ['sessions', session('s3', null)],
  ['session_tags', { ...common('l1'), session_id: 's1', tag_id: 't1' }],
  ['series', { ...common('r1'), session_id: 's1', is_sighter: 0, is_total_override: 0 }],
  ['series', { ...common('r2'), session_id: 's2', is_sighter: 0, is_total_override: 0 }],
  ...['h1', 'h2', 'h3'].map((id): [SyncTableName, Record<string, unknown>] => [
    'shots',
    { ...common(id), series_id: 'r1' },
  ]),
  ...['h4', 'h5'].map((id): [SyncTableName, Record<string, unknown>] => [
    'shots',
    { ...common(id), series_id: 'r2' },
  ]),
];

let web: Client;
let deviceB: Client;
let accountSeq = 0;

function bulk(action: BulkAction, ids: string[], context: BulkContext): ClientChange[] {
  const result = buildBulkEdit(action, ids, context, {
    newId: uuid(7),
    newChangeId: uuid(4),
    now: () => NOW,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `bulk-${accountSeq}@example.invalid`;
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
      payload: row(tableName, payload.id as string, OLD, payload),
      deletedAt: null,
      updatedAt: OLD,
    })),
  });
});

describe('the web bulk edit path', () => {
  it('W1 a bulk retag with a new tag, pushed through the real HTTP transport, is pulled by a second device', async () => {
    const changes = bulk(
      { kind: 'addTag', name: 'Season 2026' },
      ['s1', 's2', 's3'],
      await webContext(web.transport),
    );
    expect(changes.map((c) => c.tableName)).toEqual([
      'tags',
      'session_tags',
      'session_tags',
      'session_tags',
    ]);
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const rows = await pullAll(deviceB.transport);
    for (const change of changes) {
      expect(rows.get(`${change.tableName}:${change.rowId}`)?.payload).toEqual(change.payload);
    }

    const removal = bulk(
      { kind: 'removeTag', name: 'KM' },
      ['s1', 's2'],
      await webContext(web.transport),
    );
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, removal)).resolves.toEqual({
      kind: 'saved',
    });
    expect((await pullAll(deviceB.transport)).get('session_tags:l1')).toMatchObject({
      payload: null,
      deletedAt: NOW,
    });
  });

  it('W2 a bulk firearm change: device B pulls the sessions and both counters', async () => {
    const changes = bulk(
      { kind: 'setFirearm', firearmId: 'f2' },
      ['s1', 's2', 's3'],
      await webContext(web.transport),
    );
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const rows = await pullAll(deviceB.transport);
    for (const id of ['s1', 's2', 's3']) {
      expect(rows.get(`sessions:${id}`)?.payload).toMatchObject({ firearm_id: 'f2' });
    }
    expect(rows.get('firearms:f1')?.payload).toMatchObject({
      round_count: 95,
      rounds_since_maintenance: 95,
    });
    expect(rows.get('firearms:f2')?.payload).toMatchObject({
      round_count: 15,
      rounds_since_maintenance: 15,
    });
    // Columns the edit does not touch arrive as device B wrote them.
    expect(rows.get('sessions:s1')?.payload).toMatchObject({
      location: 'Range A',
      name: 'Session s1',
    });
  });

  it('W3 resending the same request answers duplicate for every change and moves nothing twice', async () => {
    const changes = bulk(
      { kind: 'setFirearm', firearmId: 'f2' },
      ['s1', 's2'],
      await webContext(web.transport),
    );
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const before = await pullAll(deviceB.transport);

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const after = await pullAll(deviceB.transport);
    for (const [key, row] of after) expect(row.seq).toBe(before.get(key)!.seq);
    expect(after.get('firearms:f2')?.payload).toMatchObject({ round_count: 15 });
  });

  it('W4 a session tombstoned by device B first: its change is rejected, the rest applied', async () => {
    const changes = bulk(
      { kind: 'setLocation', location: 'Range B' },
      ['s1', 's2'],
      await webContext(web.transport),
    );
    await deviceB.transport.push({
      protocolVersion: PROTOCOL_VERSION,
      changes: [
        {
          clientChangeId: uuid(4)(),
          tableName: 'sessions',
          rowId: 's2',
          payload: null,
          deletedAt: '2026-10-07T09:00:00.000Z',
          updatedAt: '2026-10-07T09:00:00.000Z',
        },
      ],
    });
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'sessions', rowId: 's2', reason: 'tombstoned' }],
    });
    const rows = await pullAll(deviceB.transport);
    expect(rows.get('sessions:s1')?.payload).toMatchObject({ location: 'Range B' });
    expect(rows.get('sessions:s2')?.deletedAt).toBe('2026-10-07T09:00:00.000Z');
  });
});
