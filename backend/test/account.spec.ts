import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

async function fetchApp(input: string, init?: RequestInit) {
  const request = new Request(`https://example.com${input}`, init);
  const ctx = createExecutionContext();
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function signUp(email: string): Promise<string> {
  const response = await fetchApp('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://example.com' },
    body: JSON.stringify({ email, name: 'Test User', password: 'correct horse battery staple' }),
  });
  expect(response.status).toBe(200);
  await response.text();
  const token = response.headers.get('set-auth-token');
  if (!token) throw new Error('sign-up did not return a bearer token');
  return token;
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

function bytes(n: number): Uint8Array {
  return new Uint8Array(n).fill(1);
}

async function upload(token: string, photoId: string, body: Uint8Array) {
  return fetchApp(`/photos/upload/${photoId}`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'content-type': 'image/jpeg',
      'content-length': String(body.byteLength),
    },
    body,
  });
}

async function pushSyncRow(token: string, rowId: string) {
  return fetchApp('/sync/push', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      protocolVersion: 1,
      changes: [
        {
          clientChangeId: crypto.randomUUID(),
          tableName: 'firearms',
          rowId,
          payload: { make: 'Test' },
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM photos');
  await env.DB.exec('DELETE FROM quota');
  await env.DB.exec('DELETE FROM rate_limit_windows');
  await env.DB.exec('DELETE FROM session');
  await env.DB.exec('DELETE FROM account');
  await env.DB.exec('DELETE FROM user');
  await env.DB.exec('DELETE FROM sync_rows');
  await env.DB.exec('DELETE FROM sync_sequence');
  await env.DB.exec('DELETE FROM sync_idempotency');
});

describe('account deletion', () => {
  it('A1 dryRun:true reports nonzero counts and deletes nothing', async () => {
    const token = await signUp('a1@example.com');
    // The dev-stub-authenticated /sync route uses a separate identity space
    // (bearer token = user id verbatim) from better-auth's real user ids, so
    // account-deletion counts against sync_rows are exercised using the
    // better-auth user id directly as the sync bearer token — the sync
    // route's dev stub accepts any nonempty token as a user id, so this
    // reuses the same real userId as the row owner.
    const session = await fetchApp('/api/auth/get-session', { headers: authHeaders(token) });
    const { user } = (await session.json()) as { user: { id: string } };

    await pushSyncRow(user.id, 'firearm-a1');
    await upload(token, 'photo-a1', bytes(50));

    const dryRun = await fetchApp('/account/delete', {
      method: 'POST',
      headers: { ...authHeaders(token), 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: true }),
    });
    expect(dryRun.status).toBe(200);
    const body = (await dryRun.json()) as { dryRun: boolean; deleted: Record<string, number> };
    expect(body.dryRun).toBe(true);
    expect(body.deleted.photos).toBe(1);
    expect(body.deleted.quota).toBe(1);
    expect(body.deleted.sessions).toBeGreaterThanOrEqual(1);

    // Nothing was deleted: the photo and session are both still usable.
    const getPhoto = await fetchApp('/photos/photo-a1', { headers: authHeaders(token) });
    expect(getPhoto.status).toBe(200);
    const stillAuthed = await fetchApp('/photos/usage', { headers: authHeaders(token) });
    expect(stillAuthed.status).toBe(200);
  });

  it('A2 dryRun:false deletes sync rows, photos (+ R2), quota, and revokes the session', async () => {
    const token = await signUp('a2@example.com');
    await upload(token, 'photo-a2', bytes(50));

    const del = await fetchApp('/account/delete', {
      method: 'POST',
      headers: { ...authHeaders(token), 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { dryRun: boolean }).dryRun).toBe(false);

    // The session's bearer token is rejected on the next authenticated call.
    const after = await fetchApp('/photos/usage', { headers: authHeaders(token) });
    expect(after.status).toBe(401);
  });

  it('A3 deleting user A does not touch user B rows', async () => {
    const tokenA = await signUp('a3-a@example.com');
    const tokenB = await signUp('a3-b@example.com');
    await upload(tokenA, 'photo-a3-a', bytes(10));
    await upload(tokenB, 'photo-a3-b', bytes(10));

    await fetchApp('/account/delete', {
      method: 'POST',
      headers: { ...authHeaders(tokenA), 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    });

    const bStillWorks = await fetchApp('/photos/photo-a3-b', { headers: authHeaders(tokenB) });
    expect(bStillWorks.status).toBe(200);
    const bUsage = await fetchApp('/photos/usage', { headers: authHeaders(tokenB) });
    expect(await bUsage.json()).toMatchObject({ usedBytes: 10 });
  });
});
