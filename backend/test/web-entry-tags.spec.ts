// A tagged web entry end to end (docs/specs/web-entry-tags-spec.md W1–W2):
// the shared builders and pushChanges, the real HTTP transport, the real
// Worker, real D1 and better-auth, in process. Device B owns the tag "KM";
// the web links it and creates "Club" in the session's one push.
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
  withEntryTags,
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
const NOW = '2026-10-10T08:00:00.000Z';

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

const TABLES: SyncTableName[] = ['tags', 'sessions', 'session_tags', 'series', 'shots'];

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

const KM = {
  id: '00000000-0000-7000-8000-00000000a001',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  name: 'KM',
};

const DRAFT: SessionEntryDraft = {
  type: 'training',
  disciplineId: 'spsf-precision',
  programId: null,
  startedAt: '2026-10-06T16:00:00.000Z',
  name: 'Tagged',
  defaultName: 'Training',
  location: '',
  competitionLevel: null,
  isChampionship: false,
  competitionName: '',
  weaponGroup: null,
  shooterClass: null,
  eventId: null,
  firearmId: null,
  ammoLotId: null,
  decimalScoring: false,
  seriesLength: null,
  series: [{ text: '10 9 X 10 9', isSighter: false }],
};

let web: ReturnType<typeof client>;
let deviceB: ReturnType<typeof client>;
let accountSeq = 0;

function taggedEntry(): ClientChange[] {
  const deps = { newId: uuid(7), newChangeId: uuid(4), now: () => NOW };
  const entry = buildSessionEntry(
    DRAFT,
    { firearms: new Map(), firearmGroups: [], ammoLots: new Map() },
    deps,
  );
  const result = withEntryTags(entry, ['KM', 'Club'], new Map([[KM.id, KM]]), deps);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `web-tags-${accountSeq}@example.invalid`;
  const signedUp = await client(() => null).account.signUp(email, PASSWORD, 'Test Shooter');
  const tokenB = signedUp.token;
  deviceB = client(() => tokenB);
  const webToken = (await client(() => null).account.signIn(email, PASSWORD)).token;
  web = client(() => webToken);

  await deviceB.transport.push({
    protocolVersion: PROTOCOL_VERSION,
    changes: [
      {
        clientChangeId: uuid(4)(),
        tableName: 'tags',
        rowId: KM.id,
        payload: KM,
        deletedAt: null,
        updatedAt: KM.updated_at,
      },
    ],
  });
});

describe('a tagged web entry', () => {
  it('W1 pushed through the real HTTP transport, it is pulled by a second device', async () => {
    const changes = taggedEntry();
    expect(changes.map((c) => c.tableName)).toEqual([
      'tags',
      'sessions',
      'session_tags',
      'session_tags',
      'series',
      ...Array<string>(5).fill('shots'),
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
    const club = changes.find((c) => c.tableName === 'tags')!.rowId;
    const links = [...rows.values()]
      .filter((row) => row.tableName === 'session_tags')
      .map((row) => (row.payload as { tag_id: string }).tag_id);
    expect(links).toEqual([KM.id, club]);
    // Device B's own KM row is untouched: the web only linked it.
    expect(rows.get(`tags:${KM.id}`)?.payload).toEqual(KM);
  });

  it('W2 resending the same request answers duplicate for every change and adds no rows', async () => {
    const changes = taggedEntry();
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const before = await pullAll(deviceB.transport);

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));

    const after = await pullAll(deviceB.transport);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, row] of after) expect(row.seq).toBe(before.get(key)!.seq);
  });
});
