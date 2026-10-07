import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import { createAuth } from '../src/auth/better-auth';
import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const ORIGIN = 'https://example.com';

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
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, init), target, ctx);
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

describe('better-auth rate limiting', () => {
  it('a deployed env refuses the fourth sign-in from one IP within 10 s', async () => {
    const results: number[] = [];
    for (let i = 0; i < 4; i += 1) results.push((await signIn(deployedEnv, '192.0.2.1')).status);
    expect(results.slice(0, 3)).not.toContain(429);
    expect(results[3]).toBe(429);
  });

  it('counts each client IP separately, in D1', async () => {
    for (let i = 0; i < 4; i += 1) await signIn(deployedEnv, '192.0.2.2');
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

describe('the dev secret', () => {
  it('is refused outside local development', () => {
    expect(() =>
      createAuth({ ...deployedEnv, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET }),
    ).toThrow(/dev placeholder/);
  });
});
