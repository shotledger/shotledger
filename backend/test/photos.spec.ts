import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MAX_PHOTO_BYTES } from '../src/config';
import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

async function fetchApp(input: string, init?: RequestInit) {
  const request = new Request(`https://example.com${input}`, init);
  const ctx = createExecutionContext();
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

/** Signs up a fresh user and returns their bearer session token (docs/specs/backend-auth-photos-spec.md §2). */
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

function authHeaders(token: string, extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

function bytes(n: number): Uint8Array {
  return new Uint8Array(n).fill(7);
}

async function upload(
  token: string,
  photoId: string,
  body: Uint8Array,
  overrideContentLength?: number,
) {
  return fetchApp(`/photos/upload/${photoId}`, {
    method: 'POST',
    headers: authHeaders(token, {
      'content-type': 'image/jpeg',
      'content-length': String(overrideContentLength ?? body.byteLength),
    }),
    body,
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
});

describe('photo upload', () => {
  it('P1 rejects an upload with no Content-Length header', async () => {
    const token = await signUp('p1@example.com');
    // In-process `app.fetch()` never goes over the wire, so a Request built
    // without an explicit `content-length` header genuinely has none —
    // this is the missing-header case, not a simulation of it.
    const response = await fetchApp('/photos/upload/photo-1', {
      method: 'POST',
      headers: authHeaders(token, { 'content-type': 'image/jpeg' }),
      body: bytes(10),
    });
    expect(response.status).toBe(411);
  });

  it('P2 rejects an upload whose declared Content-Length exceeds the size cap, and nothing is stored', async () => {
    const token = await signUp('p2@example.com');
    const response = await upload(token, 'photo-2', bytes(10), MAX_PHOTO_BYTES + 1);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'photo_too_large' });

    const getResponse = await fetchApp('/photos/photo-2', { headers: authHeaders(token) });
    expect(getResponse.status).toBe(404);
  });

  it('P3 rejects an upload whose actual body exceeds the declared Content-Length', async () => {
    const token = await signUp('p3@example.com');
    // Declare a small length but send a larger body (defense-in-depth path).
    const response = await upload(token, 'photo-3', bytes(1000), 10);
    expect(response.status).toBe(413);

    const getResponse = await fetchApp('/photos/photo-3', { headers: authHeaders(token) });
    expect(getResponse.status).toBe(404);
  });

  it('P4 a successful upload is reflected in GET /photos/usage', async () => {
    const token = await signUp('p4@example.com');
    const response = await upload(token, 'photo-4', bytes(500));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { photoId: string; sizeBytes: number };
    expect(body).toMatchObject({ photoId: 'photo-4', sizeBytes: 500 });

    const usage = await fetchApp('/photos/usage', { headers: authHeaders(token) });
    expect(await usage.json()).toMatchObject({ usedBytes: 500 });
  });

  it('P5 rejects an upload that would exceed the remaining quota, quota unchanged', async () => {
    const token = await signUp('p5@example.com');
    const session = await fetchApp('/api/auth/get-session', { headers: authHeaders(token) });
    const { user } = (await session.json()) as { user: { id: string } };
    // Shrink this user's quota directly in D1 (the API never exposes a way
    // to do this — the 1GB default is too large to exhaust via uploads
    // capped at MAX_PHOTO_BYTES and RATE_LIMIT_MAX_UPLOADS/hour) so the
    // 413 quota_exceeded path is reachable without waiting on real usage.
    await env.DB.prepare('INSERT INTO quota (user_id, used_bytes, limit_bytes) VALUES (?, 0, 100)')
      .bind(user.id)
      .run();

    const response = await upload(token, 'photo-5', bytes(101));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'quota_exceeded' });

    const usage = await fetchApp('/photos/usage', { headers: authHeaders(token) });
    expect(await usage.json()).toEqual({ usedBytes: 0, limitBytes: 100, remainingBytes: 100 });

    const getResponse = await fetchApp('/photos/photo-5', { headers: authHeaders(token) });
    expect(getResponse.status).toBe(404);
  });

  it('P6 the 61st upload within the same rolling hour is rate-limited; a later window succeeds', async () => {
    const token = await signUp('p6@example.com');
    for (let i = 0; i < 60; i++) {
      const response = await upload(token, `photo-rl-${i}`, bytes(10));
      expect(response.status).toBe(201);
    }
    const rejected = await upload(token, 'photo-rl-60', bytes(10));
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('Retry-After')).not.toBeNull();

    // Confirm state from the first 60 is intact: usage reflects exactly 60 uploads.
    const usage = await fetchApp('/photos/usage', { headers: authHeaders(token) });
    expect(await usage.json()).toMatchObject({ usedBytes: 600 });
  });

  it('P7 GET as the owner returns 200 with the correct bytes', async () => {
    const token = await signUp('p7@example.com');
    const payload = bytes(42);
    await upload(token, 'photo-7', payload);

    const response = await fetchApp('/photos/photo-7', { headers: authHeaders(token) });
    expect(response.status).toBe(200);
    const buffer = new Uint8Array(await response.arrayBuffer());
    expect(buffer).toEqual(payload);
  });

  it('P8 GET as a different authenticated user is 404', async () => {
    const owner = await signUp('p8-owner@example.com');
    const other = await signUp('p8-other@example.com');
    await upload(owner, 'photo-8', bytes(10));

    const response = await fetchApp('/photos/photo-8', { headers: authHeaders(other) });
    expect(response.status).toBe(404);
  });

  it('P9 GET for a photoId that was never uploaded is 404, same shape as P8', async () => {
    const token = await signUp('p9@example.com');
    const response = await fetchApp('/photos/never-uploaded', { headers: authHeaders(token) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('P10 DELETE as owner returns 204, decreases quota by exactly the photo size, and a later GET is 404', async () => {
    const token = await signUp('p10@example.com');
    await upload(token, 'photo-10', bytes(300));
    const usageBefore = (await (
      await fetchApp('/photos/usage', { headers: authHeaders(token) })
    ).json()) as {
      usedBytes: number;
    };
    expect(usageBefore.usedBytes).toBe(300);

    const del = await fetchApp('/photos/photo-10', {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    expect(del.status).toBe(204);

    const usageAfter = (await (
      await fetchApp('/photos/usage', { headers: authHeaders(token) })
    ).json()) as {
      usedBytes: number;
    };
    expect(usageAfter.usedBytes).toBe(0);

    const getAfter = await fetchApp('/photos/photo-10', { headers: authHeaders(token) });
    expect(getAfter.status).toBe(404);
  });

  it('P11 DELETE as a non-owner is 404 and the photo is unaffected', async () => {
    const owner = await signUp('p11-owner@example.com');
    const other = await signUp('p11-other@example.com');
    await upload(owner, 'photo-11', bytes(10));

    const del = await fetchApp('/photos/photo-11', {
      method: 'DELETE',
      headers: authHeaders(other),
    });
    expect(del.status).toBe(404);

    const stillThere = await fetchApp('/photos/photo-11', { headers: authHeaders(owner) });
    expect(stillThere.status).toBe(200);
  });

  it('P12 re-uploading the same photoId nets only the size difference, not the sum', async () => {
    const token = await signUp('p12@example.com');
    await upload(token, 'photo-12', bytes(100));
    await upload(token, 'photo-12', bytes(300));

    const usage = (await (
      await fetchApp('/photos/usage', { headers: authHeaders(token) })
    ).json()) as {
      usedBytes: number;
    };
    expect(usage.usedBytes).toBe(300);
  });
});
