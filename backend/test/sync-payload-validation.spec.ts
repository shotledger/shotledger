// Per-table payload validation on /sync/push, through the real route and the
// real D1 batch (docs/specs/sync-payload-validation-spec.md P1–P6, P8, P10).
// P7 drives the real client engine and lives in sync-client.spec.ts.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APPLY_ORDER,
  createHttpSyncTransport,
  pushChanges,
  PROTOCOL_VERSION,
  type ClientChange,
  type PushAck,
  type SyncTableName,
} from '@shotledger/shared';

import { devBearerAuthenticator } from '../src/auth';
import { SYNC_MIGRATIONS } from '../src/db/migrations';
import { createSyncRoutes } from '../src/routes/sync';
import { row } from './rows';

const USER = 'user-p';
const T0 = '2026-09-02T10:00:00.000Z';
const T1 = '2026-09-03T10:00:00.000Z';

const app = new Hono<{ Bindings: Env }>();
app.route(
  '/sync',
  createSyncRoutes(() => devBearerAuthenticator),
);

async function fetchApp(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(input, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

const transport = createHttpSyncTransport({
  fetchImpl: fetchApp,
  baseUrl: 'https://localhost',
  getToken: () => USER,
});

let counter = 0;
function cid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

function live(tableName: SyncTableName, rowId: string, payload: unknown, updatedAt = T0) {
  return { clientChangeId: cid(), tableName, rowId, payload, deletedAt: null, updatedAt };
}

/** F: a valid whole firearms row f1, as the phone's toPayload produces it. */
function firearm(fields: Record<string, unknown> = {}, rowId = 'f1', updatedAt = T0) {
  return row('firearms', rowId, updatedAt, {
    make: 'Anschutz',
    model: '1913',
    caliber: '.22 LR',
    weapon_type: 'rifle',
    is_own: true,
    round_count: 12,
    ...fields,
  });
}

async function push(changes: ClientChange[]): Promise<PushAck[]> {
  return (await transport.push({ protocolVersion: PROTOCOL_VERSION, changes })).acks;
}

async function pullAll() {
  const response = await transport.pull({
    protocolVersion: PROTOCOL_VERSION,
    tables: APPLY_ORDER.map((tableName) => ({ tableName, cursor: 0 })),
  });
  return response.changes;
}

async function lastSeq(): Promise<number> {
  const found = await env.DB.prepare('SELECT last_seq FROM sync_sequence WHERE user_id = ?')
    .bind(USER)
    .first<{ last_seq: number }>();
  return found?.last_seq ?? 0;
}

async function storedRow(tableName: string, rowId: string) {
  return env.DB.prepare(
    'SELECT payload, deleted_at FROM sync_rows WHERE user_id = ? AND table_name = ? AND row_id = ?',
  )
    .bind(USER, tableName, rowId)
    .first<{ payload: string | null; deleted_at: string | null }>();
}

async function idempotency(clientChangeId: string) {
  return env.DB.prepare(
    'SELECT status, seq, reason FROM sync_idempotency WHERE user_id = ? AND client_change_id = ?',
  )
    .bind(USER, clientChangeId)
    .first<{ status: string; seq: number | null; reason: string | null }>();
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, SYNC_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sync_rows');
  await env.DB.exec('DELETE FROM sync_sequence');
  await env.DB.exec('DELETE FROM sync_idempotency');
});

describe('P1 a valid row of every synced table is applied', () => {
  it('pushes one whole row per table in APPLY_ORDER and pulls each back unchanged', async () => {
    // settings rows are keyed by a synced setting name, not a uuid.
    const ids = (tableName: SyncTableName) =>
      tableName === 'settings' ? 'birthYear' : `${tableName}-1`;
    const changes = APPLY_ORDER.map((tableName) =>
      live(tableName, ids(tableName), row(tableName, ids(tableName), T0)),
    );

    const acks = await push(changes);
    expect(acks.map((ack) => ack.status)).toEqual(changes.map(() => 'applied'));

    const pulled = await pullAll();
    expect(pulled).toHaveLength(changes.length);
    for (const change of changes) {
      const back = pulled.find((p) => p.tableName === change.tableName && p.rowId === change.rowId);
      expect(back?.payload).toEqual(change.payload);
    }
  });
});

describe('P2 a malformed row is refused and stores nothing', () => {
  const without = (key: string) => {
    const { [key]: _dropped, ...rest } = firearm();
    return rest;
  };
  // The third element is the envelope's updatedAt, where the row's own
  // updated_at differs from T0: the envelope must agree, so that the date
  // check alone refuses it.
  it.each<[string, unknown, string?]>([
    ['make: null (NOT NULL)', firearm({ make: null })],
    ['make removed (missing key)', without('make')],
    ['caliber removed (missing nullable key)', without('caliber')],
    ['weapon_type: "shotgun" (enum)', firearm({ weapon_type: 'shotgun' })],
    ['round_count: 1.5 (integer)', firearm({ round_count: 1.5 })],
    ['round_count: "12" (type)', firearm({ round_count: '12' })],
    ['is_own: 1 (boolean)', firearm({ is_own: 1 })],
    ['created_at: "2026-08-01 10:00" (timestamp)', firearm({ created_at: '2026-08-01 10:00' })],
    [
      'updated_at: "2026-02-30T00:00:00.000Z" (date)',
      firearm({}, 'f1', '2026-02-30T00:00:00.000Z'),
      '2026-02-30T00:00:00.000Z',
    ],
    ['id: "f2" (id ≠ rowId)', firearm({ id: 'f2' })],
    ['extra key "colour" (unknown key)', firearm({ colour: 'black' })],
    ['deleted_at set on a live change', firearm({ deleted_at: T0 })],
    ['payload is an array', [firearm()]],
    ['payload is a string', 'Anschutz'],
    ['payload is a number', 42],
  ])('%s', async (_label, payload, updatedAt = T0) => {
    const before = await lastSeq();
    const change = live('firearms', 'f1', payload, updatedAt);

    const [ack] = await push([change]);
    expect(ack).toStrictEqual({
      clientChangeId: change.clientChangeId,
      status: 'rejected',
      reason: 'invalid_payload',
    });
    expect(await storedRow('firearms', 'f1')).toBeNull();
    expect(await lastSeq()).toBe(before);
    expect(await idempotency(change.clientChangeId)).toStrictEqual({
      status: 'rejected',
      seq: null,
      reason: 'invalid_payload',
    });
  });

  it('the unmutated F is applied, so each row above fails for its mutation alone', async () => {
    const [ack] = await push([live('firearms', 'f1', firearm())]);
    expect(ack).toMatchObject({ status: 'applied', seq: 1 });
  });
});

// §2.1, C12: the route validates a synced setting like any other row.
describe('a settings row whose value is not JSON', () => {
  it('is refused and stores nothing', async () => {
    const before = await lastSeq();
    const change = live(
      'settings',
      'birthYear',
      row('settings', 'birthYear', T0, { value: 'not json' }),
    );

    const [ack] = await push([change]);

    expect(ack).toStrictEqual({
      clientChangeId: change.clientChangeId,
      status: 'rejected',
      reason: 'invalid_payload',
    });
    expect(await storedRow('settings', 'birthYear')).toBeNull();
    expect(await lastSeq()).toBe(before);
  });

  it('is applied when the value is JSON text', async () => {
    const [ack] = await push([
      live('settings', 'birthYear', row('settings', 'birthYear', T0, { value: '1980' })),
    ]);
    expect(ack).toMatchObject({ status: 'applied' });
  });
});

describe('P3 one bad row does not hold back the good ones', () => {
  it('applies F and the series around a refused session, at consecutive seqs', async () => {
    const good = live('firearms', 'f1', firearm());
    const bad = live('sessions', 's1', row('sessions', 's1', T0, { name: null }));
    const series = live(
      'series',
      'ser-1',
      row('series', 'ser-1', T0, { session_id: 's2', position: 1 }),
    );

    const acks = await push([good, bad, series]);
    expect(acks).toStrictEqual([
      { clientChangeId: good.clientChangeId, status: 'applied', seq: 1 },
      { clientChangeId: bad.clientChangeId, status: 'rejected', reason: 'invalid_payload' },
      { clientChangeId: series.clientChangeId, status: 'applied', seq: 2 },
    ]);
    expect(await lastSeq()).toBe(2);
    expect(await storedRow('sessions', 's1')).toBeNull();
  });
});

describe('P3b a verdict belongs to its change, not to its clientChangeId', () => {
  it("an invalid change reusing a valid change's id does not refuse the valid one", async () => {
    const good = live('firearms', 'f1', firearm());
    const bad = {
      ...live('firearms', 'f9', firearm({ make: null }, 'f9')),
      clientChangeId: good.clientChangeId,
    };

    const acks = await push([good, bad]);
    expect(acks[0]).toStrictEqual({
      clientChangeId: good.clientChangeId,
      status: 'applied',
      seq: 1,
    });
    expect(acks[1]).toMatchObject({ status: 'duplicate', seq: 1 });
    expect(await storedRow('firearms', 'f1')).not.toBeNull();
    expect(await storedRow('firearms', 'f9')).toBeNull();
  });
});

describe('P4 a refusal replays as a duplicate with its reason', () => {
  it('acks duplicate/invalid_payload with no seq and changes nothing', async () => {
    const refused = live('firearms', 'f1', firearm({ make: null }));
    await push([refused]);
    const before = { seq: await lastSeq(), row: await storedRow('firearms', 'f1') };

    const [ack] = await push([refused]);
    expect(ack).toStrictEqual({
      clientChangeId: refused.clientChangeId,
      status: 'duplicate',
      reason: 'invalid_payload',
    });
    expect({ seq: await lastSeq(), row: await storedRow('firearms', 'f1') }).toStrictEqual(before);
  });

  it('a replay through the web pushChanges reads as a rejection, not a save', async () => {
    const refused = live('firearms', 'f1', firearm({ make: null }));
    await push([refused]);
    await expect(pushChanges(transport, PROTOCOL_VERSION, [refused])).resolves.toStrictEqual({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'firearms', rowId: 'f1', reason: 'invalid_payload' }],
    });
  });
});

describe('P5 a tombstone outranks an invalid payload', () => {
  it('acks tombstoned for an invalid live change aimed at a deleted row', async () => {
    await push([live('firearms', 'f1', firearm())]);
    await push([
      {
        clientChangeId: cid(),
        tableName: 'firearms',
        rowId: 'f1',
        payload: null,
        deletedAt: T1,
        updatedAt: T1,
      },
    ]);
    const before = await lastSeq();

    const invalid = live('firearms', 'f1', firearm({ make: null }, 'f1', T1), T1);
    const [ack] = await push([invalid]);
    expect(ack).toStrictEqual({
      clientChangeId: invalid.clientChangeId,
      status: 'rejected',
      reason: 'tombstoned',
    });
    expect(await lastSeq()).toBe(before);
    expect(await idempotency(invalid.clientChangeId)).toMatchObject({ reason: 'tombstoned' });
  });

  it('a valid live change aimed at a deleted row is still tombstoned', async () => {
    await push([live('firearms', 'f1', firearm())]);
    await push([
      {
        clientChangeId: cid(),
        tableName: 'firearms',
        rowId: 'f1',
        payload: null,
        deletedAt: T1,
        updatedAt: T1,
      },
    ]);
    const [ack] = await push([live('firearms', 'f1', firearm({}, 'f1', T1), T1)]);
    expect(ack).toMatchObject({ status: 'rejected', reason: 'tombstoned' });
  });
});

describe('P6 a tombstone is never payload-validated', () => {
  it('applies a delete whose payload is null', async () => {
    await push([live('firearms', 'f1', firearm())]);
    const removal = {
      clientChangeId: cid(),
      tableName: 'firearms' as const,
      rowId: 'f1',
      payload: null,
      deletedAt: T1,
      updatedAt: T1,
    };
    const [ack] = await push([removal]);
    expect(ack).toStrictEqual({
      clientChangeId: removal.clientChangeId,
      status: 'applied',
      seq: 2,
    });
    expect(await storedRow('firearms', 'f1')).toMatchObject({ deleted_at: T1 });
  });
});

describe('P8 the web sees the refusal', () => {
  // The series belongs to s1, so since #856 the session goes with it as
  // family_refused (sync-family-refusal-spec.md §2.2, Revision 2 item 1).
  it('pushChanges reports partlyRejected with the invalid series and its reason', async () => {
    const session = live('sessions', 's1', row('sessions', 's1', T0, { name: 'Training' }));
    const series = live(
      'series',
      'ser-1',
      row('series', 'ser-1', T0, { session_id: 's1', position: 0.5 }),
    );

    await expect(
      pushChanges(transport, PROTOCOL_VERSION, [session, series]),
    ).resolves.toStrictEqual({
      kind: 'partlyRejected',
      rejected: [
        { tableName: 'sessions', rowId: 's1', reason: 'family_refused' },
        { tableName: 'series', rowId: 'ser-1', reason: 'invalid_payload' },
      ],
    });
    expect(await storedRow('sessions', 's1')).toBeNull();
    expect(await storedRow('series', 'ser-1')).toBeNull();
  });
});

describe('N6 a refusal is logged without values or ids', () => {
  it('names the table and the failing columns only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const change = live(
        'firearms',
        'row-secret-id',
        firearm({ round_count: 'SECRET-VALUE' }, 'row-secret-id'),
      );
      await push([change]);
      const logged = warn.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logged).toBe('sync push: refused firearms payload (round_count:invalid_type)');
      expect(logged).not.toContain('SECRET');
      expect(logged).not.toContain('row-secret-id');
      expect(logged).not.toContain(change.clientChangeId);
    } finally {
      warn.mockRestore();
    }
  });

  it('logs nothing for a valid push', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await push([live('firearms', 'f1', firearm())]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('P10 the CHECK refuses non-JSON written past the route', () => {
  const insert = (rowId: string, payload: string | null) =>
    env.DB.prepare(
      `INSERT INTO sync_rows (user_id, table_name, row_id, seq, payload, updated_at, deleted_at)
       VALUES (?, 'firearms', ?, 1, ?, ?, NULL)`,
    )
      .bind(USER, rowId, payload, T0)
      .run();

  it('D1 refuses a payload that is not JSON', async () => {
    await expect(insert('raw-1', 'not json')).rejects.toThrow(/CHECK constraint failed/);
    expect(await storedRow('firearms', 'raw-1')).toBeNull();
  });

  it('accepts NULL (a tombstone) and JSON text', async () => {
    await insert('raw-2', null);
    await insert('raw-3', '{"make":"x"}');
    expect(await storedRow('firearms', 'raw-2')).toMatchObject({ payload: null });
    expect(await storedRow('firearms', 'raw-3')).toMatchObject({ payload: '{"make":"x"}' });
  });
});
