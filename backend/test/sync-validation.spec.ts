// Route input validation for /sync/pull and /sync/push: every request the
// route refuses, and the push payload size cap. Each refusal must leave
// storage untouched.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MAX_PAYLOAD_BYTES, PUSH_BATCH_MAX } from '@shotledger/shared';

import { devBearerAuthenticator } from '../src/auth';
import { SYNC_MIGRATIONS } from '../src/db/migrations';
import { createSyncRoutes } from '../src/routes/sync';

const app = new Hono<{ Bindings: Env }>();
app.route(
  '/sync',
  createSyncRoutes(() => devBearerAuthenticator),
);

async function post(path: string, rawBody: string) {
  const request = new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer user-v' },
    body: rawBody,
  });
  const ctx = createExecutionContext();
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const send = (path: string, body: unknown) => post(path, JSON.stringify(body));

let idCounter = 0;
function uuid(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${idCounter.toString(16).padStart(12, '0')}`;
}

function change(overrides: Record<string, unknown> = {}) {
  return {
    clientChangeId: uuid(),
    tableName: 'sessions',
    rowId: `row-${idCounter}`,
    payload: { name: 'Training' },
    deletedAt: null,
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...overrides,
  };
}

async function storedRows(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_rows').first<{ n: number }>();
  return row?.n ?? 0;
}

async function storedIdempotencyKeys(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_idempotency').first<{
    n: number;
  }>();
  return row?.n ?? 0;
}

/** A payload whose `JSON.stringify` is exactly `bytes` UTF-8 bytes long. */
function payloadOfBytes(bytes: number): { notes: string } {
  const overhead = JSON.stringify({ notes: '' }).length;
  return { notes: 'x'.repeat(bytes - overhead) };
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, SYNC_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sync_rows');
  await env.DB.exec('DELETE FROM sync_sequence');
  await env.DB.exec('DELETE FROM sync_idempotency');
});

describe('V1 /sync/pull refuses a malformed request with 400 invalid_request', () => {
  it.each([
    ['V1a body that is not JSON', '{"protocolVersion": 1, "tables": ['],
    ['V1b empty body', ''],
    ['V1c no protocolVersion', JSON.stringify({ tables: [{ tableName: 'sessions', cursor: 0 }] })],
    ['V1d empty tables', JSON.stringify({ protocolVersion: 1, tables: [] })],
    [
      'V1e unknown tableName',
      JSON.stringify({ protocolVersion: 1, tables: [{ tableName: 'settings', cursor: 0 }] }),
    ],
    [
      'V1f negative cursor',
      JSON.stringify({ protocolVersion: 1, tables: [{ tableName: 'sessions', cursor: -1 }] }),
    ],
    [
      'V1g fractional cursor',
      JSON.stringify({ protocolVersion: 1, tables: [{ tableName: 'sessions', cursor: 1.5 }] }),
    ],
  ])('%s', async (_label, rawBody) => {
    const result = await post('/sync/pull', rawBody);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('invalid_request');
  });
});

describe('V2 /sync/push refuses a malformed request with 400 invalid_request and stores nothing', () => {
  const cases: Array<[string, () => string]> = [
    ['V2a body that is not JSON', () => '{"protocolVersion": 1, "changes": ['],
    ['V2b empty body', () => ''],
    ['V2c no protocolVersion', () => JSON.stringify({ changes: [change()] })],
    ['V2d empty changes', () => JSON.stringify({ protocolVersion: 1, changes: [] })],
    [
      'V2e more than PUSH_BATCH_MAX changes',
      () =>
        JSON.stringify({
          protocolVersion: 1,
          changes: Array.from({ length: PUSH_BATCH_MAX + 1 }, () => change()),
        }),
    ],
    [
      'V2f unknown tableName',
      () => JSON.stringify({ protocolVersion: 1, changes: [change({ tableName: 'settings' })] }),
    ],
    [
      'V2g a payload alongside deletedAt',
      () =>
        JSON.stringify({
          protocolVersion: 1,
          changes: [change({ deletedAt: '2026-09-02T11:00:00.000Z' })],
        }),
    ],
    [
      'V2h clientChangeId that is not a UUID',
      () =>
        JSON.stringify({ protocolVersion: 1, changes: [change({ clientChangeId: 'not-a-uuid' })] }),
    ],
    [
      'V2i empty rowId',
      () => JSON.stringify({ protocolVersion: 1, changes: [change({ rowId: '' })] }),
    ],
    [
      'V2j empty updatedAt',
      () => JSON.stringify({ protocolVersion: 1, changes: [change({ updatedAt: '' })] }),
    ],
    [
      'V2k one bad change spoils the whole batch',
      () =>
        JSON.stringify({
          protocolVersion: 1,
          changes: [change(), change({ tableName: 'settings' })],
        }),
    ],
  ];

  it.each(cases)('%s', async (_label, rawBody) => {
    const result = await post('/sync/push', rawBody());
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('invalid_request');
    expect(await storedRows()).toBe(0);
    expect(await storedIdempotencyKeys()).toBe(0);
  });
});

describe('V3 push payload size cap', () => {
  it('V3a accepts a payload of exactly MAX_PAYLOAD_BYTES', async () => {
    const payload = payloadOfBytes(MAX_PAYLOAD_BYTES);
    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBe(MAX_PAYLOAD_BYTES);

    const result = await send('/sync/push', { protocolVersion: 1, changes: [change({ payload })] });
    expect(result.status).toBe(200);
    expect(result.body.acks).toMatchObject([{ status: 'applied' }]);
    expect(await storedRows()).toBe(1);
  });

  it('V3b refuses a payload one byte over with 413, and stores nothing from the batch', async () => {
    const payload = payloadOfBytes(MAX_PAYLOAD_BYTES + 1);
    const oversized = change({ payload });

    const result = await send('/sync/push', {
      protocolVersion: 1,
      changes: [change(), oversized],
    });
    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({
      error: 'payload_too_large',
      clientChangeId: oversized.clientChangeId,
      maxPayloadBytes: MAX_PAYLOAD_BYTES,
    });
    expect(await storedRows()).toBe(0);
    expect(await storedIdempotencyKeys()).toBe(0);
  });

  it('V3c counts UTF-8 bytes, not characters', async () => {
    // 'å' is two bytes: under the cap in characters, over it in bytes.
    const overhead = JSON.stringify({ notes: '' }).length;
    const notes = 'å'.repeat(Math.ceil((MAX_PAYLOAD_BYTES - overhead) / 2) + 1);
    expect(JSON.stringify({ notes }).length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);

    const result = await send('/sync/push', {
      protocolVersion: 1,
      changes: [change({ payload: { notes } })],
    });
    expect(result.status).toBe(413);
    expect(await storedRows()).toBe(0);
  });

  it('V3d a tombstone carries no payload and is never refused by the cap', async () => {
    const result = await send('/sync/push', {
      protocolVersion: 1,
      changes: [change({ payload: null, deletedAt: '2026-09-02T11:00:00.000Z' })],
    });
    expect(result.status).toBe(200);
    expect(result.body.acks).toMatchObject([{ status: 'applied' }]);
  });
});
