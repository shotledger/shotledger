// The web's settings edit end to end (docs/specs/web-settings-edit-spec.md
// W1–W4): the shared builder and pushChanges, the real HTTP transport, the
// real Worker, real D1 and better-auth, in process. One account, a "web"
// token and a "device B" token.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildSettingsChanges,
  createAccountApi,
  createHttpSyncTransport,
  pushChanges,
  PROTOCOL_VERSION,
  readAccountSettings,
  type AccountSettings,
  type ChangeRow,
  type ClientChange,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://example.com';
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
const changeId = () => `00000000-0000-4000-8000-${(counter += 1).toString(16).padStart(12, '0')}`;

/** Every settings row on the account, pulled from cursor 0. */
async function pullSettings(transport: ReturnType<typeof client>['transport']) {
  const rows = new Map<string, ChangeRow>();
  let cursor = 0;
  for (;;) {
    const response = await transport.pull({
      protocolVersion: PROTOCOL_VERSION,
      tables: [{ tableName: 'settings', cursor }],
    });
    for (const change of response.changes) rows.set(change.rowId, change);
    const next = response.nextCursors[0]!;
    if (!next.hasMore) return rows;
    cursor = next.cursor;
  }
}

const payloads = (rows: Map<string, ChangeRow>) =>
  new Map([...rows].map(([id, row]) => [id, row.payload as Record<string, unknown>]));

/** Device B's phone row: what setSetting writes. */
const phoneRow = (key: string, value: unknown, at: string): ClientChange => ({
  clientChangeId: changeId(),
  tableName: 'settings',
  rowId: key,
  payload: {
    id: key,
    value: JSON.stringify(value),
    created_at: at,
    updated_at: at,
    deleted_at: null,
  },
  deletedAt: null,
  updatedAt: at,
});

function webEdit(
  pulled: Map<string, Record<string, unknown>>,
  edit: Partial<AccountSettings>,
): ClientChange[] {
  const before = readAccountSettings(pulled);
  const result = buildSettingsChanges(before, { ...before, ...edit }, pulled, {
    newChangeId: changeId,
    now: () => NOW,
    currentYear: 2026,
    defaultProfile: 'none',
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

let web: ReturnType<typeof client>;
let deviceB: ReturnType<typeof client>;
let accountSeq = 0;

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `web-settings-${accountSeq}@example.invalid`;
  const signedUp = await client(() => null).account.signUp(email, PASSWORD, 'Test Shooter');
  const tokenB = signedUp.token;
  deviceB = client(() => tokenB);
  const webToken = (await client(() => null).account.signIn(email, PASSWORD)).token;
  web = client(() => webToken);

  // Device B has a birth year and a class.
  await deviceB.transport.push({
    protocolVersion: PROTOCOL_VERSION,
    changes: [
      phoneRow('birthYear', 1975, '2026-01-01T00:00:00.000Z'),
      phoneRow('skillClass', '3', '2026-01-01T00:00:00.000Z'),
    ],
  });
});

describe('the web settings write path', () => {
  it('W1 web settings pushed through the real HTTP transport are pulled by device B', async () => {
    const pulled = payloads(await pullSettings(web.transport));
    const changes = webEdit(pulled, {
      birthYear: 1980,
      competesInWomensClasses: true,
      complianceProfile: 'se',
    });
    expect(changes.map((c) => c.rowId)).toEqual([
      'birthYear',
      'competesInWomensClasses',
      'complianceProfile',
    ]);
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });

    const rows = await pullSettings(deviceB.transport);
    for (const change of changes) {
      expect(rows.get(change.rowId)?.payload).toEqual(change.payload);
      expect(rows.get(change.rowId)?.deletedAt).toBeNull();
    }
    expect(readAccountSettings(payloads(rows))).toEqual({
      birthYear: 1980,
      skillClass: '3',
      competesInWomensClasses: true,
      complianceProfile: 'se',
      complianceProfileVariant: null,
    });
    // The phone's row kept its created_at.
    expect(rows.get('birthYear')?.payload).toMatchObject({
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('W2 resending the same request answers duplicate and moves no seq', async () => {
    const changes = webEdit(payloads(await pullSettings(web.transport)), { skillClass: '1' });
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const before = await pullSettings(deviceB.transport);

    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(['duplicate']);
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });

    const after = await pullSettings(deviceB.transport);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, row] of after) expect(row.seq).toBe(before.get(key)!.seq);
  });

  it('W3 per-key rows: B’s later class edit survives the web’s birth year save; the later edit of one key wins', async () => {
    // The web opens the page, then B changes the class.
    const pulled = payloads(await pullSettings(web.transport));
    await deviceB.transport.push({
      protocolVersion: PROTOCOL_VERSION,
      changes: [phoneRow('skillClass', '1', '2026-10-07T09:00:00.000Z')],
    });
    await pushChanges(web.transport, PROTOCOL_VERSION, webEdit(pulled, { birthYear: 1980 }));
    let settings = readAccountSettings(payloads(await pullSettings(deviceB.transport)));
    expect(settings).toMatchObject({ birthYear: 1980, skillClass: '1' });

    // The web edits the class after B did: the web's push is later and wins.
    await pushChanges(web.transport, PROTOCOL_VERSION, webEdit(pulled, { skillClass: '2' }));
    settings = readAccountSettings(payloads(await pullSettings(deviceB.transport)));
    expect(settings).toMatchObject({ birthYear: 1980, skillClass: '2' });
  });

  it('W4 a revoked session token → unauthenticated, and nothing is stored', async () => {
    const pulled = payloads(await pullSettings(web.transport));
    const before = await pullSettings(deviceB.transport);
    await web.account.signOut();
    await expect(
      pushChanges(web.transport, PROTOCOL_VERSION, webEdit(pulled, { birthYear: 1990 })),
    ).resolves.toEqual({ kind: 'failed', error: 'unauthenticated' });
    const after = await pullSettings(deviceB.transport);
    expect([...after.values()].map((r) => r.seq)).toEqual([...before.values()].map((r) => r.seq));
    expect(readAccountSettings(payloads(after)).birthYear).toBe(1975);
  });
});
