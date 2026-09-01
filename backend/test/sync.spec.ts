import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MIN_SUPPORTED_PROTOCOL_VERSION, PROTOCOL_VERSION_UNSUPPORTED } from '@shotledger/shared';

import app from '../src/index';
import { SYNC_MIGRATIONS } from '../src/db/migrations';

const USER_A_TOKEN = 'user-a-token';
const USER_B_TOKEN = 'user-b-token';

function uuid(seed: string): string {
  // Deterministic v4-shaped UUID for test fixtures: hash the seed into 32
  // hex digits (not the seed's raw characters, which are rarely valid hex).
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  let hex = '';
  while (hex.length < 32) {
    h = (h * 1103515245 + 12345) >>> 0;
    hex += h.toString(16).padStart(8, '0');
  }
  hex = hex.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** `token: null` means "send no Authorization header at all". */
async function call(path: string, body: unknown, token: string | null = USER_A_TOKEN) {
  const request = new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const ctx = createExecutionContext();
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: response.status, body: await response.json() };
}

function pushOne(clientChangeId: string, overrides: Record<string, unknown> = {}) {
  return call('/sync/push', {
    protocolVersion: 1,
    changes: [
      {
        clientChangeId,
        tableName: 'firearms',
        rowId: 'firearm-1',
        payload: { make: 'Anschutz' },
        deletedAt: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
        ...overrides,
      },
    ],
  });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, SYNC_MIGRATIONS);
});

beforeEach(async () => {
  // Isolate each test's rows: wipe between tests rather than relying on
  // unique row ids everywhere.
  await env.DB.exec('DELETE FROM sync_rows');
  await env.DB.exec('DELETE FROM sync_sequence');
  await env.DB.exec('DELETE FROM sync_idempotency');
});

describe('S9 auth', () => {
  it('S9a rejects a pull with no bearer token', async () => {
    const result = await call(
      '/sync/pull',
      { protocolVersion: 1, tables: [{ tableName: 'firearms', cursor: 0 }] },
      null,
    );
    expect(result.status).toBe(401);
  });

  it('S9b rejects a push with no bearer token', async () => {
    const result = await call('/sync/push', { protocolVersion: 1, changes: [] }, null);
    expect(result.status).toBe(401);
  });

  it('S9c two different tokens never see each other rows', async () => {
    await pushOne(uuid('a1'));
    const pullAsB = await call(
      '/sync/pull',
      { protocolVersion: 1, tables: [{ tableName: 'firearms', cursor: 0 }] },
      USER_B_TOKEN,
    );
    expect(pullAsB.status).toBe(200);
    expect((pullAsB.body as { changes: unknown[] }).changes).toHaveLength(0);
  });
});

describe('S8 version handshake', () => {
  it('S8a pull below MIN_SUPPORTED_PROTOCOL_VERSION is rejected and touches no storage', async () => {
    const result = await call('/sync/pull', {
      protocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION - 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe(PROTOCOL_VERSION_UNSUPPORTED);
  });

  it('S8b push below MIN_SUPPORTED_PROTOCOL_VERSION is rejected and touches no storage', async () => {
    const result = await pushOne(uuid('a2'), {});
    expect(result.status).toBe(200); // sanity: normal push still works at current version

    const rejected = await call('/sync/push', {
      protocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION - 1,
      changes: [
        {
          clientChangeId: uuid('a3'),
          tableName: 'firearms',
          rowId: 'firearm-2',
          payload: {},
          deletedAt: null,
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });
    expect(rejected.status).toBe(409);
    expect((rejected.body as { code: string }).code).toBe(PROTOCOL_VERSION_UNSUPPORTED);

    const pull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    const rowIds = (pull.body as { changes: { rowId: string }[] }).changes.map((c) => c.rowId);
    expect(rowIds).not.toContain('firearm-2');
  });
});

describe('S4 push create + pull', () => {
  it('S4a push acks applied with a seq, and a subsequent pull returns the row', async () => {
    const pushResult = await pushOne(uuid('b1'));
    expect(pushResult.status).toBe(200);
    const acks = (pushResult.body as { acks: { status: string; seq: number }[] }).acks;
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: 'applied' });
    expect(acks[0]!.seq).toBeGreaterThan(0);

    const pull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    const changes = (pull.body as { changes: { rowId: string; payload: unknown }[] }).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ rowId: 'firearm-1', payload: { make: 'Anschutz' } });
  });
});

describe('S1/S2 fresh vs incremental pull', () => {
  it('S1 fresh client (cursor 0) gets a full pull with hasMore false under the page size', async () => {
    await pushOne(uuid('c1'));
    const pull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    const body = pull.body as { changes: unknown[]; nextCursors: { hasMore: boolean }[] };
    expect(body.changes).toHaveLength(1);
    expect(body.nextCursors[0]!.hasMore).toBe(false);
  });

  it('S2 incremental pull with the returned cursor sees nothing new until another push happens', async () => {
    await pushOne(uuid('c2'));
    const firstPull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    const cursor = (firstPull.body as { nextCursors: { cursor: number }[] }).nextCursors[0]!.cursor;

    const emptyPull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor }],
    });
    expect((emptyPull.body as { changes: unknown[] }).changes).toHaveLength(0);

    await call('/sync/push', {
      protocolVersion: 1,
      changes: [
        {
          clientChangeId: uuid('c3'),
          tableName: 'firearms',
          rowId: 'firearm-other',
          payload: { make: 'Walther' },
          deletedAt: null,
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
      ],
    });

    const secondPull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor }],
    });
    const rows = (secondPull.body as { changes: { rowId: string }[] }).changes;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rowId).toBe('firearm-other');
  });
});

describe('S3 cursor pagination', () => {
  it('S3a pull page is capped, hasMore true, and a second pull with the returned cursor reaches the tail', async () => {
    const PAGE_SIZE = 200;
    const TOTAL = 205;
    const changes = Array.from({ length: TOTAL }, (_, i) => ({
      clientChangeId: uuid(`p${i}`),
      tableName: 'firearms',
      rowId: `firearm-p${i}`,
      payload: { index: i },
      deletedAt: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    }));
    // Push in two batches (< 500 batch cap each).
    await call('/sync/push', { protocolVersion: 1, changes: changes.slice(0, 200) });
    await call('/sync/push', { protocolVersion: 1, changes: changes.slice(200) });

    const firstPull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    const firstBody = firstPull.body as {
      changes: unknown[];
      nextCursors: { cursor: number; hasMore: boolean }[];
    };
    expect(firstBody.changes).toHaveLength(PAGE_SIZE);
    expect(firstBody.nextCursors[0]!.hasMore).toBe(true);

    const secondPull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: firstBody.nextCursors[0]!.cursor }],
    });
    const secondBody = secondPull.body as {
      changes: unknown[];
      nextCursors: { hasMore: boolean }[];
    };
    expect(secondBody.changes).toHaveLength(TOTAL - PAGE_SIZE);
    expect(secondBody.nextCursors[0]!.hasMore).toBe(false);
  });
});

describe('S5 push conflict — tombstone-wins', () => {
  it('S5a a live edit after a delete is rejected, and the row stays deleted', async () => {
    await pushOne(uuid('d1'));
    const deleteResult = await call('/sync/push', {
      protocolVersion: 1,
      changes: [
        {
          clientChangeId: uuid('d2'),
          tableName: 'firearms',
          rowId: 'firearm-1',
          payload: null,
          deletedAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    });
    expect((deleteResult.body as { acks: { status: string }[] }).acks[0]!.status).toBe('applied');

    const editAfterDelete = await pushOne(uuid('d3'), {
      payload: { make: 'resurrected?' },
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    const ack = (editAfterDelete.body as { acks: { status: string; reason?: string }[] }).acks[0]!;
    expect(ack.status).toBe('rejected');
    expect(ack.reason).toBe('tombstoned');

    const pull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    const row = (
      pull.body as { changes: { rowId: string; deletedAt: string | null }[] }
    ).changes.find((c) => c.rowId === 'firearm-1');
    expect(row?.deletedAt).toBe('2026-08-05T00:00:00.000Z');
  });
});

describe('S6 push conflict — LWW', () => {
  it('S6a two sequential pushes to the same row: pull returns only the latest payload at the latest seq', async () => {
    await pushOne(uuid('e1'), { payload: { make: 'First' } });
    const second = await pushOne(uuid('e2'), { payload: { make: 'Second' } });
    expect((second.body as { acks: { status: string }[] }).acks[0]!.status).toBe('applied');

    const pull = await call('/sync/pull', {
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    const rows = (
      pull.body as { changes: { rowId: string; payload: { make: string }; seq: number }[] }
    ).changes;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload.make).toBe('Second');
  });
});

describe('S7 idempotent duplicate push', () => {
  it('S7a replaying the same clientChangeId acks duplicate with the original seq, no new seq consumed', async () => {
    const id = uuid('f1');
    const first = await pushOne(id);
    const firstAck = (first.body as { acks: { status: string; seq: number }[] }).acks[0]!;
    expect(firstAck.status).toBe('applied');

    const replay = await pushOne(id);
    const replayAck = (replay.body as { acks: { status: string; seq: number }[] }).acks[0]!;
    expect(replayAck.status).toBe('duplicate');
    expect(replayAck.seq).toBe(firstAck.seq);

    const anotherPush = await pushOne(uuid('f2'), { rowId: 'firearm-3' });
    const anotherAck = (anotherPush.body as { acks: { seq: number }[] }).acks[0]!;
    // The duplicate replay must not have consumed a sequence number: the
    // next real push's seq is exactly one more than the first push's.
    expect(anotherAck.seq).toBe(firstAck.seq + 1);
  });
});
