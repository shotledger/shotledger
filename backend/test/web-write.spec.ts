// The web's write path end to end (docs/specs/web-series-entry-spec.md W1–W4):
// the shared builder and pushChanges, the real HTTP transport, the real
// Worker, real D1 and better-auth, in process. One account, a "web" token and
// a "device B" token.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildSessionEntry,
  createAccountApi,
  createHttpSyncTransport,
  pushChanges,
  PROTOCOL_VERSION,
  type ChangeRow,
  type ClientChange,
  type SessionEntryDraft,
  type SyncTableName,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://localhost';
const PASSWORD = 'correct horse battery staple';
const NOW = '2026-10-07T10:00:00.000Z';

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

let counter = 0;
const uuid = (version: 4 | 7) => () =>
  `00000000-0000-${version}000-8000-${(counter += 1).toString(16).padStart(12, '0')}`;

const TABLES: SyncTableName[] = ['firearms', 'sessions', 'series', 'shots'];

/** Device B's view: every row of these tables, pulled from cursor 0. */
async function pullAll(transport: ReturnType<typeof client>['transport']) {
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

const FIREARM = {
  id: 'f-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  make: 'Pardini',
  model: 'SP',
  caliber: '.22 LR',
  weapon_type: 'pistol',
  is_own: true,
  serial_number: null,
  vapen_id: null,
  load_system: null,
  notes: null,
  round_count: 100,
  maintenance_interval_rounds: null,
  maintenance_interval_months: null,
  archived_at: null,
};

const DRAFT: SessionEntryDraft = {
  type: 'competition',
  disciplineId: 'spsf-precision',
  programId: null,
  startedAt: '2026-10-06T16:00:00.000Z',
  name: 'KM',
  defaultName: 'Competition — 6 Oct 2026',
  location: 'Range',
  competitionLevel: 'forening',
  isChampionship: true,
  competitionName: 'Club Championship',
  weaponGroup: 'spsf:C',
  shooterClass: '2',
  eventId: null,
  firearmId: 'f-1',
  ammoLotId: null,
  decimalScoring: false,
  seriesLength: null,
  series: [
    { text: '10 9', isSighter: true },
    { text: '10 9 X 10 9', isSighter: false },
    { text: '8 7 6 5 4', isSighter: false },
  ],
};

let web: ReturnType<typeof client>;
let deviceB: ReturnType<typeof client>;
let webToken: string | null;
let accountSeq = 0;

function webEntry(): ClientChange[] {
  const result = buildSessionEntry(
    DRAFT,
    { firearms: new Map([['f-1', FIREARM]]), firearmGroups: [], ammoLots: new Map() },
    { newId: uuid(7), newChangeId: uuid(4), now: () => NOW },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `web-${accountSeq}@example.invalid`;
  const signedUp = await client(() => null).account.signUp(email, PASSWORD, 'Test Shooter');
  const tokenB = signedUp.token;
  deviceB = client(() => tokenB);
  webToken = (await client(() => null).account.signIn(email, PASSWORD)).token;
  web = client(() => webToken);

  // Device B owns the firearm the web picks.
  await deviceB.transport.push({
    protocolVersion: PROTOCOL_VERSION,
    changes: [
      {
        clientChangeId: uuid(4)(),
        tableName: 'firearms',
        rowId: 'f-1',
        payload: FIREARM,
        deletedAt: null,
        updatedAt: FIREARM.updated_at,
      },
    ],
  });
});

describe('the web write path', () => {
  it('W1 a web entry pushed through the real HTTP transport is pulled by a second device', async () => {
    const changes = webEntry();
    expect(changes.map((c) => c.tableName)).toEqual([
      'firearms',
      'sessions',
      'series',
      'series',
      'series',
      ...Array<string>(12).fill('shots'),
    ]);
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });

    const rows = await pullAll(deviceB.transport);
    for (const change of changes) {
      const pulled = rows.get(`${change.tableName}:${change.rowId}`);
      expect(pulled?.payload).toEqual(change.payload);
      expect(pulled?.deletedAt).toBeNull();
    }
    expect(rows.get('firearms:f-1')?.payload).toMatchObject({
      round_count: 112,
    });
  });

  it('W2 resending the same request answers duplicate for every change and adds no rows', async () => {
    const changes = webEntry();
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const before = await pullAll(deviceB.transport);

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });

    const after = await pullAll(deviceB.transport);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, row] of after) expect(row.seq).toBe(before.get(key)!.seq);
  });

  it('W3 firearm tombstoned by device B first: its ack is rejected, the rest applied', async () => {
    const changes = webEntry();
    await deviceB.transport.push({
      protocolVersion: PROTOCOL_VERSION,
      changes: [
        {
          clientChangeId: uuid(4)(),
          tableName: 'firearms',
          rowId: 'f-1',
          payload: null,
          deletedAt: '2026-10-07T09:00:00.000Z',
          updatedAt: '2026-10-07T09:00:00.000Z',
        },
      ],
    });

    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'firearms', rowId: 'f-1', reason: 'tombstoned' }],
    });
    const rows = await pullAll(deviceB.transport);
    expect(rows.get('firearms:f-1')?.deletedAt).toBe('2026-10-07T09:00:00.000Z');
    for (const change of changes.filter((c) => c.tableName !== 'firearms')) {
      expect(rows.get(`${change.tableName}:${change.rowId}`)?.payload).toEqual(change.payload);
    }
  });

  it('W4 a revoked session token → unauthenticated, and nothing is stored', async () => {
    await web.account.signOut();
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, webEntry())).resolves.toEqual({
      kind: 'failed',
      error: 'unauthenticated',
    });
    const rows = await pullAll(deviceB.transport);
    expect([...rows.keys()]).toEqual(['firearms:f-1']);
  });
});
