import {
  applyD1Migrations,
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthConfigError, createAuth, DEV_SECRET } from '../src/auth/better-auth';
import { ALL_MIGRATIONS } from '../src/db/migrations';
import worker from '../src/index';

const ORIGIN = 'https://localhost';

// What a deployed env looks like (backend/wrangler.jsonc `env.production`),
// with a stand-in for the secret `wrangler secret put` provides.
const deployedEnv: Env = {
  ...env,
  ENVIRONMENT: 'production',
  BETTER_AUTH_SECRET: 'test-only-secret-0123456789abcdefghijklmnopqrstuvwxyz',
  BETTER_AUTH_URL: ORIGIN,
  BETTER_AUTH_TRUSTED_ORIGINS: 'app://',
};

async function fetchApp(target: Env, path: string, init: RequestInit) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, init), target, ctx);
  await waitOnExecutionContext(ctx);
  await response.text();
  return response;
}

function signIn(target: Env, ip: string, origin = ORIGIN) {
  return fetchApp(target, '/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': ip },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong password 123' }),
  });
}

function signUp(target: Env, email: string, origin: string) {
  return fetchApp(target, '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': '192.0.2.50' },
    body: JSON.stringify({ email, name: 'Test User', password: 'correct horse battery staple' }),
  });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

async function rateLimitKeys(ip: string): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT key FROM rate_limit WHERE key LIKE ?')
    .bind(`${ip}|%`)
    .all<{ key: string }>();
  return results.map((row) => row.key);
}

describe('better-auth rate limiting', () => {
  it('a deployed env refuses the sixth sign-in from one IP within 60 s', async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i += 1) results.push((await signIn(deployedEnv, '192.0.2.1')).status);
    expect(results.slice(0, 5)).not.toContain(429);
    expect(results[5]).toBe(429);
  });

  it('applies the same rule to sign-up', async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await fetchApp(deployedEnv, '/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          'cf-connecting-ip': '192.0.2.5',
        },
        body: JSON.stringify({ email: `s${i}@example.com`, name: 'T', password: 'short' }),
      });
      results.push(response.status);
    }
    expect(results.slice(0, 5)).not.toContain(429);
    expect(results[5]).toBe(429);
  });

  it('keeps no row for a path that is not an endpoint', async () => {
    for (const path of ['/api/auth/no-such-path', '/api/auth/sign-in/nowhere', '/api/auth/a/b/c']) {
      await fetchApp(deployedEnv, path, {
        method: 'POST',
        headers: { origin: ORIGIN, 'cf-connecting-ip': '192.0.2.6' },
      });
    }
    await fetchApp(deployedEnv, '/api/auth/get-session', {
      headers: { 'cf-connecting-ip': '192.0.2.6' },
    });
    expect(await rateLimitKeys('192.0.2.6')).toEqual(['192.0.2.6|/get-session']);
  });

  it('counts each client IP separately, in D1', async () => {
    for (let i = 0; i < 6; i += 1) await signIn(deployedEnv, '192.0.2.2');
    expect((await signIn(deployedEnv, '192.0.2.3')).status).not.toBe(429);

    const row = await env.DB.prepare('SELECT count FROM rate_limit WHERE key = ?')
      .bind('192.0.2.3|/sign-in/email')
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it('is off in local development', async () => {
    const results: number[] = [];
    for (let i = 0; i < 5; i += 1) results.push((await signIn(env, '192.0.2.4')).status);
    expect(results).not.toContain(429);
  });
});

describe('better-auth origins', () => {
  it('accepts the web origin and the app scheme, and refuses any other', async () => {
    expect((await signUp(deployedEnv, 'web@example.com', ORIGIN)).status).toBe(200);
    expect((await signUp(deployedEnv, 'app@example.com', 'app://')).status).toBe(200);
    expect((await signUp(deployedEnv, 'other@example.com', 'https://other.example')).status).toBe(
      403,
    );
  });
});

describe('a deployed env without its own config', () => {
  it.each([
    ['the dev placeholder secret', { BETTER_AUTH_SECRET: DEV_SECRET }, /dev placeholder/],
    ['no secret', { BETTER_AUTH_SECRET: undefined }, /missing or shorter/],
    ['an empty secret', { BETTER_AUTH_SECRET: '' }, /missing or shorter/],
    ['a 31-character secret', { BETTER_AUTH_SECRET: 'x'.repeat(31) }, /missing or shorter/],
    ['no BETTER_AUTH_URL', { BETTER_AUTH_URL: undefined }, /BETTER_AUTH_URL/],
    ['an http BETTER_AUTH_URL', { BETTER_AUTH_URL: 'http://localhost' }, /BETTER_AUTH_URL/],
    [
      'the REPLACE_ME BETTER_AUTH_URL',
      { BETTER_AUTH_URL: 'https://REPLACE_ME.invalid' },
      /BETTER_AUTH_URL/,
    ],
    ['a BETTER_AUTH_URL that is not a URL', { BETTER_AUTH_URL: 'localhost' }, /BETTER_AUTH_URL/],
  ])('refuses to start with %s', (_label, override, message) => {
    expect(() => createAuth({ ...deployedEnv, ...override })).toThrow(AuthConfigError);
    expect(() => createAuth({ ...deployedEnv, ...override })).toThrow(message);
  });

  it('answers 500 and logs why', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await fetchApp(
      { ...deployedEnv, BETTER_AUTH_SECRET: undefined },
      '/api/auth/get-session',
      {},
    );
    expect(response.status).toBe(500);
    expect(logged.mock.calls.flat().join(' ')).toContain(
      'AuthConfigError: BETTER_AUTH_SECRET is missing',
    );
    logged.mockRestore();
  });

  it('local development needs no secret', () => {
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
    expect(() => createAuth(env)).not.toThrow();
  });
});

describe('the development config', () => {
  it.each(['https://localhost', 'http://127.0.0.1:8787', 'http://[::1]:8787'])(
    'serves %s',
    async (origin) => {
      const ctx = createExecutionContext();
      const response = await worker.fetch(new Request(`${origin}/api/auth/get-session`), env, ctx);
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
    },
  );

  it('refuses any other host, so a stray deploy of the top level serves nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('https://shotledger-backend.example.workers.dev/api/auth/get-session'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(500);
    expect(logged.mock.calls.flat().join(' ')).toContain('local hosts only');
    logged.mockRestore();
  });
});

describe('the rate-limit purge cron', () => {
  it('deletes rows whose longest window has passed and keeps the rest', async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?)',
      ).bind('stale', '198.51.100.1|/get-session', now - 61_000),
      env.DB.prepare(
        'INSERT INTO rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?)',
      ).bind('fresh', '198.51.100.2|/get-session', now - 1_000),
    ]);

    await worker.scheduled(createScheduledController(), env);

    const { results } = await env.DB.prepare(
      "SELECT id FROM rate_limit WHERE key LIKE '198.51.100.%'",
    ).all<{ id: string }>();
    expect(results.map((row) => row.id)).toEqual(['fresh']);
  });
});

describe("the Worker's own responses", () => {
  it.each([
    ['GET', '/api/auth/get-session'],
    ['POST', '/sync/pull'],
    ['GET', '/photos/usage'],
    ['POST', '/account/delete'],
  ])('%s %s is not cached or sniffed', async (method, path) => {
    const response = await fetchApp(env, path, { method });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
