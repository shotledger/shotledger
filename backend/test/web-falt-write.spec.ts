// A web fält entry end to end (docs/specs/web-falt-entry-spec.md WF1–WF2):
// buildFaltEntry and pushChanges, the real HTTP transport, the real Worker,
// real D1 and better-auth, in process. One account, a "web" token and a
// "device B" token.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildFaltEntry,
  createAccountApi,
  createHttpSyncTransport,
  pushChanges,
  PROTOCOL_VERSION,
  type ChangeRow,
  type ClientChange,
  type FaltEntryDraft,
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

const TABLES: SyncTableName[] = ['firearms', 'sessions', 'falt_stations'];

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
  make: 'Glock',
  model: '17',
  caliber: '9x19',
  weapon_type: 'pistol',
  is_own: true,
  serial_number: null,
  vapen_id: null,
  load_system: null,
  notes: null,
  round_count: 100,
  maintenance_interval_rounds: null,
};

const station = (
  hits: number,
  figuresHit: number,
  patch: Partial<FaltEntryDraft['stations'][number]> = {},
) => ({
  hits,
  figuresHit,
  figureCount: null,
  pointsText: '',
  pointsMaxText: '',
  isScratched: false,
  isShootOff: false,
  ...patch,
});

const DRAFT: FaltEntryDraft = {
  type: 'competition',
  disciplineId: 'spsf-falt',
  startedAt: '2026-10-06T08:00:00.000Z',
  name: '',
  defaultName: 'Competition — 6 Oct 2026',
  location: 'Range',
  competitionLevel: 'krets',
  isChampionship: false,
  competitionName: 'Field Match',
  weaponGroup: 'spsf:C',
  shooterClass: '2',
  eventId: null,
  firearmId: 'f-1',
  ammoLotId: null,
  faltResultMode: 'falt',
  stations: [
    station(6, 3, { figureCount: 4 }),
    station(5, 2, { pointsText: '7', pointsMaxText: '10' }),
    station(0, 0, { isScratched: true }),
  ],
};

let web: ReturnType<typeof client>;
let deviceB: ReturnType<typeof client>;
let accountSeq = 0;

function webEntry(): ClientChange[] {
  const result = buildFaltEntry(
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
  const email = `web-falt-${accountSeq}@example.invalid`;
  const signedUp = await client(() => null).account.signUp(email, PASSWORD, 'Test Shooter');
  const tokenB = signedUp.token;
  deviceB = client(() => tokenB);
  const webToken = (await client(() => null).account.signIn(email, PASSWORD)).token;
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

describe('the web fält write path', () => {
  it('WF1 a fält entry pushed through the real HTTP transport is pulled by a second device unchanged', async () => {
    const changes = webEntry();
    expect(changes.map((c) => c.tableName)).toEqual([
      'firearms',
      'sessions',
      'falt_stations',
      'falt_stations',
      'falt_stations',
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
      round_count: 118,
    });
    const session = [...rows.values()].find((row) => row.tableName === 'sessions');
    expect(session?.payload).toMatchObject({
      falt_result_mode: 'falt',
      discipline_id: 'spsf-falt',
    });
  });

  it('WF2 resending the same request answers duplicate for every change and adds no rows', async () => {
    const changes = webEntry();
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const before = await pullAll(deviceB.transport);

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));

    const after = await pullAll(deviceB.transport);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, row] of after) expect(row.seq).toBe(before.get(key)!.seq);
  });
});
