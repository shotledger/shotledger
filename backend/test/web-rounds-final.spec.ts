// Rounds-only sessions and final series from the web, end to end
// (docs/specs/web-rounds-final-spec.md WR1, WR2): the shared builders and
// pushChanges, the real HTTP transport, the real Worker, real D1 and
// better-auth, in process. The harness is web-write.spec.ts's.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildRoundsEntry,
  buildSessionEntry,
  createAccountApi,
  createHttpSyncTransport,
  pushChanges,
  PROTOCOL_VERSION,
  type ChangeRow,
  type ClientChange,
  type EntryResult,
  type SyncTableName,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://localhost';
const PASSWORD = 'correct horse battery staple';
const NOW = '2026-10-10T10:00:00.000Z';

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
  rounds_since_maintenance: 3,
  archived_at: null,
};

let web: ReturnType<typeof client>;
let deviceB: ReturnType<typeof client>;
let webToken: string | null;
let accountSeq = 0;

const CONTEXT = { firearms: new Map([['f-1', FIREARM]]), firearmGroups: [], ammoLots: new Map() };
const DEPS = { newId: uuid(7), newChangeId: uuid(4), now: () => NOW };

function changesOf(result: EntryResult): ClientChange[] {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

const FIELDS = {
  type: 'training' as const,
  disciplineId: 'spsf-precision',
  startedAt: '2026-10-09T16:00:00.000Z',
  name: '',
  defaultName: 'Training — 9 Oct 2026',
  location: 'Range',
  competitionLevel: null,
  isChampionship: false,
  competitionName: '',
  weaponGroup: null,
  shooterClass: null,
  eventId: null,
  firearmId: 'f-1',
  ammoLotId: null,
};

const roundsEntry = () =>
  changesOf(buildRoundsEntry({ ...FIELDS, roundsFired: '60' }, CONTEXT, DEPS));

const finalEntry = () =>
  changesOf(
    buildSessionEntry(
      {
        ...FIELDS,
        programId: 'spsf-precision',
        decimalScoring: false,
        seriesLength: null,
        series: [
          { text: '10 9 8 7 6', isSighter: false },
          { text: '9 9', isSighter: true, isFinal: true },
          { text: '10 10 9 9 X', isSighter: false, isFinal: true },
        ],
      },
      CONTEXT,
      DEPS,
    ),
  );

async function expectPulledAsPushed(changes: ClientChange[]) {
  const rows = await pullAll(deviceB.transport);
  for (const change of changes) {
    const pulled = rows.get(`${change.tableName}:${change.rowId}`);
    expect(pulled?.payload).toEqual(change.payload);
    expect(pulled?.deletedAt).toBeNull();
  }
  return rows;
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

describe('rounds-only and final series from the web', () => {
  it('WR1 a rounds session and its firearm pushed by the web are pulled by a second device unchanged', async () => {
    const changes = roundsEntry();
    expect(changes.map((c) => c.tableName)).toEqual(['firearms', 'sessions']);
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const rows = await expectPulledAsPushed(changes);
    expect(rows.get('firearms:f-1')?.payload).toMatchObject({
      round_count: 160,
      rounds_since_maintenance: 63,
    });
    expect(rows.get(`sessions:${changes[1]!.rowId}`)?.payload).toMatchObject({
      kind: 'rounds',
      extra_rounds: 60,
      program_id: null,
    });
  });

  it('WR2 a final session is pulled with its is_final rows; resending answers duplicate', async () => {
    const changes = finalEntry();
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });
    const rows = await expectPulledAsPushed(changes);
    const series = changes
      .filter((c) => c.tableName === 'series')
      .map((c) => rows.get(`series:${c.rowId}`)!.payload as Record<string, unknown>);
    expect(series.map((s) => [s.position, s.is_sighter, s.is_final])).toEqual([
      [1, 0, 0],
      [2, 1, 1],
      [3, 0, 1],
    ]);
    expect(rows.get('firearms:f-1')?.payload).toMatchObject({ round_count: 112 });

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));
    const after = await pullAll(deviceB.transport);
    expect([...after.keys()].sort()).toEqual([...rows.keys()].sort());
  });
});
