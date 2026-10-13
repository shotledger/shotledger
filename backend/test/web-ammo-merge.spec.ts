// The web's ammo-lot merge end to end (docs/specs/ammo-lot-merge-spec.md
// W1–W4): the shared builder and pushChanges, the real HTTP transport, the
// real Worker, real D1 and better-auth, in process. One account, a "web"
// token and a "device B" token; device B owns the logbook.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildAmmoLotMerge,
  createAccountApi,
  createHttpSyncTransport,
  pushChanges,
  PROTOCOL_VERSION,
  type ChangeRow,
  type ClientChange,
  type AmmoLotMergeContext,
  type SyncTableName,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://localhost';
const PASSWORD = 'correct horse battery staple';
const NOW = '2026-10-13T21:00:00.000Z';
const LATER = '2026-10-13T22:00:00.000Z';
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

const TABLES: SyncTableName[] = ['ammo_lots', 'sessions'];

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
async function webContext(transport: Client['transport']): Promise<AmmoLotMergeContext> {
  const rows = await pullAll(transport);
  const table = (name: SyncTableName) =>
    new Map(
      [...rows.values()]
        .filter((row) => row.tableName === name && row.deletedAt === null)
        .map((row) => [row.rowId, row.payload as Record<string, unknown>]),
    );
  return { sessions: table('sessions'), ammoLots: table('ammo_lots') };
}

const common = (id: string) => ({ id, created_at: OLD, updated_at: OLD, deleted_at: null });

const lot = (id: string, quantity: number) => ({
  ...common(id),
  label: `Lot ${id}`,
  caliber: '.22 LR',
  quantity,
  purchased_on: null,
  is_handload: false,
  notes: `${id} notes`,
});

const session = (id: string, ammoLotId: string | null) => ({
  ...common(id),
  name: `Session ${id}`,
  type: 'training',
  kind: 'series',
  discipline_id: 'spsf-precision',
  ammo_lot_id: ammoLotId,
  location: 'Range A',
  started_at: '2026-05-01T10:00:00.000Z',
});

/** s1, s2 on the duplicate a1; s3 on the kept a2. */
const LOGBOOK: [SyncTableName, Record<string, unknown>][] = [
  ['ammo_lots', lot('a1', 500)],
  ['ammo_lots', lot('a2', 100)],
  ['sessions', session('s1', 'a1')],
  ['sessions', session('s2', 'a1')],
  ['sessions', session('s3', 'a2')],
];

let web: Client;
let deviceB: Client;
let accountSeq = 0;

function merge(context: AmmoLotMergeContext): ClientChange[] {
  const result = buildAmmoLotMerge('a1', 'a2', context, {
    newId: uuid(7),
    newChangeId: uuid(4),
    now: () => NOW,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

const change = (tableName: SyncTableName, payload: Record<string, unknown>): ClientChange => ({
  clientChangeId: uuid(4)(),
  tableName,
  rowId: payload.id as string,
  payload,
  deletedAt: null,
  updatedAt: LATER,
});

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `merge-${accountSeq}@example.invalid`;
  const signedUp = await client(() => null).account.signUp(email, PASSWORD, 'Test Shooter');
  const tokenB = signedUp.token;
  deviceB = client(() => tokenB);
  const webToken = (await client(() => null).account.signIn(email, PASSWORD)).token;
  web = client(() => webToken);

  await deviceB.transport.push({
    protocolVersion: PROTOCOL_VERSION,
    changes: LOGBOOK.map(([tableName, payload]) => ({
      ...change(tableName, payload),
      updatedAt: OLD,
    })),
  });
});

describe('the web ammo-lot merge path', () => {
  it('W1 a merge pushed by the web is pulled by a second device: sessions on the kept lot, duplicate tombstoned', async () => {
    const changes = merge(await webContext(web.transport));
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const rows = await pullAll(deviceB.transport);
    expect(rows.get('ammo_lots:a1')).toMatchObject({ payload: null, deletedAt: NOW });
    for (const id of ['s1', 's2']) {
      expect(rows.get(`sessions:${id}`)?.payload).toMatchObject({
        ammo_lot_id: 'a2',
        location: 'Range A',
        updated_at: NOW,
      });
    }
    // The kept lot and the session already on it arrive as device B wrote them.
    expect(rows.get('ammo_lots:a2')?.payload).toEqual(lot('a2', 100));
    expect(rows.get('sessions:s3')?.payload).toEqual(session('s3', 'a2'));
  });

  it('W2 resending the same request answers duplicate for every change', async () => {
    const changes = merge(await webContext(web.transport));
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const before = await pullAll(deviceB.transport);

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));
    const after = await pullAll(deviceB.transport);
    for (const [key, row] of after) expect(row.seq).toBe(before.get(key)!.seq);
  });

  it('W3 a later push editing the duplicate is rejected tombstoned (M8)', async () => {
    await pushChanges(web.transport, PROTOCOL_VERSION, merge(await webContext(web.transport)));
    await expect(
      pushChanges(deviceB.transport, PROTOCOL_VERSION, [
        change('ammo_lots', { ...lot('a1', 450), updated_at: LATER }),
      ]),
    ).resolves.toEqual({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'ammo_lots', rowId: 'a1', reason: 'tombstoned' }],
    });
    expect((await pullAll(web.transport)).get('ammo_lots:a1')?.deletedAt).toBe(NOW);
  });

  it('W4 a later push of a session naming the duplicate is accepted (M7)', async () => {
    await pushChanges(web.transport, PROTOCOL_VERSION, merge(await webContext(web.transport)));
    const straggler = { ...session('s1', 'a1'), notes: 'edited offline', updated_at: LATER };
    await expect(
      pushChanges(deviceB.transport, PROTOCOL_VERSION, [change('sessions', straggler)]),
    ).resolves.toEqual({ kind: 'saved' });
    expect((await pullAll(web.transport)).get('sessions:s1')?.payload).toMatchObject({
      ammo_lot_id: 'a1',
    });
  });
});
