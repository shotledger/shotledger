// Passkeys (#681) end to end on workerd: the real Worker, D1 and
// `@better-auth/passkey`, driven by a software authenticator. The challenge
// travels as the `x-passkey-challenge` header (src/lib/cookies.ts).
import {
  applyD1Migrations,
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  AuthConfigError,
  createAuth,
  passkeyRpId,
  WEB_SESSION_TTL_MS,
} from '../src/auth/better-auth';
import { ALL_MIGRATIONS } from '../src/db/migrations';
import { PASSKEY_CHALLENGE_HEADER } from '../src/lib/cookies';
import worker from '../src/index';
import { softAuthenticator, type SoftAuthenticator } from './soft-authenticator';

const ORIGIN = 'https://localhost';
const RP_ID = 'localhost';

// A deployed env (wrangler.jsonc `env.production`) on the test host: the rp
// id comes from BETTER_AUTH_URL, and the rate limiter is on.
const deployedEnv: Env = {
  ...env,
  ENVIRONMENT: 'production',
  BETTER_AUTH_SECRET: 'test-only-secret-0123456789abcdefghijklmnopqrstuvwxyz',
  BETTER_AUTH_URL: ORIGIN,
  BETTER_AUTH_TRUSTED_ORIGINS: 'shotledger://',
};

let ipCounter = 0;
/** A fresh client IP per call site, so one test's rate limit is not another's. */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function fetchApp(path: string, init: RequestInit & { ip: string; origin?: string }) {
  const { ip, origin = ORIGIN, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('origin', origin);
  headers.set('cf-connecting-ip', ip);
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`${ORIGIN}${path}`, { ...rest, headers }),
    deployedEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function signUp(email: string): Promise<string> {
  const response = await fetchApp('/api/auth/sign-up/email', {
    ip: freshIp(),
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: 'Test User', password: 'correct horse battery staple' }),
  });
  expect(response.status).toBe(200);
  await response.text();
  return response.headers.get('set-auth-token')!;
}

interface Ceremony {
  options: { challenge: string };
  challenge: string;
}

async function options(path: string, ip: string, token?: string): Promise<Ceremony> {
  const response = await fetchApp(`/api/auth/passkey/${path}`, {
    ip,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  expect(response.status).toBe(200);
  expect(response.headers.has('set-cookie')).toBe(false);
  const challenge = response.headers.get(PASSKEY_CHALLENGE_HEADER);
  expect(challenge).toMatch(/^__Secure-better-auth\.better-auth-passkey=/);
  return { options: await response.json(), challenge: challenge! };
}

function verify(
  path: string,
  body: unknown,
  {
    ip,
    challenge,
    token,
    origin,
  }: { ip: string; challenge?: string; token?: string; origin?: string },
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (challenge) headers[PASSKEY_CHALLENGE_HEADER] = challenge;
  if (token) headers.authorization = `Bearer ${token}`;
  return fetchApp(`/api/auth/passkey/${path}`, {
    ip,
    origin,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function register(token: string, authenticator: SoftAuthenticator, name = 'Laptop') {
  const ip = freshIp();
  const ceremony = await options('generate-register-options', ip, token);
  const response = await authenticator.register(ceremony.options);
  return verify(
    'verify-registration',
    { response, name },
    { ip, challenge: ceremony.challenge, token },
  );
}

async function signInWith(authenticator: SoftAuthenticator, query = '') {
  const ip = freshIp();
  const ceremony = await options('generate-authenticate-options', ip);
  const response = await authenticator.authenticate(ceremony.options);
  return verify(
    `verify-authentication${query}`,
    { response },
    { ip, challenge: ceremony.challenge },
  );
}

async function passkeyRows(userId?: string): Promise<{ name: string; user_id: string }[]> {
  const statement = userId
    ? env.DB.prepare('SELECT name, user_id FROM passkey WHERE user_id = ?').bind(userId)
    : env.DB.prepare('SELECT name, user_id FROM passkey');
  return (await statement.all<{ name: string; user_id: string }>()).results;
}

async function userIdOf(token: string): Promise<string> {
  const response = await fetchApp('/api/auth/get-session', {
    ip: freshIp(),
    headers: { authorization: `Bearer ${token}` },
  });
  return (await response.json<{ user: { id: string } }>()).user.id;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

describe('adding a passkey', () => {
  it('registers a passkey on the signed-in account', async () => {
    const token = await signUp('add@example.com');
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);

    const response = await register(token, authenticator, 'Work laptop');

    expect(response.status).toBe(200);
    const rows = await passkeyRows(await userIdOf(token));
    expect(rows.map((row) => row.name)).toEqual(['Work laptop']);
  });

  it('needs a signed-in session', async () => {
    const response = await fetchApp('/api/auth/passkey/generate-register-options', {
      ip: freshIp(),
    });
    expect(response.status).toBe(401);
  });

  it('refuses a registration without the challenge header', async () => {
    const token = await signUp('no-challenge@example.com');
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);
    const ip = freshIp();
    const ceremony = await options('generate-register-options', ip, token);

    const response = await verify(
      'verify-registration',
      { response: await authenticator.register(ceremony.options) },
      { ip, token },
    );

    expect(response.status).toBe(400);
    expect(await passkeyRows(await userIdOf(token))).toEqual([]);
  });

  it('refuses a credential made for another origin', async () => {
    const token = await signUp('phished@example.com');
    const authenticator = await softAuthenticator(RP_ID, 'https://shotledger.example');

    const response = await register(token, authenticator);

    expect(response.status).not.toBe(200);
    expect(await passkeyRows(await userIdOf(token))).toEqual([]);
  });

  it('accepts a ceremony only from the web origin, not from any trusted origin', async () => {
    const token = await signUp('scheme@example.com');
    // `shotledger://` passes better-auth's Origin check (the app's scheme),
    // but a passkey must be bound to the web origin.
    const authenticator = await softAuthenticator(RP_ID, 'shotledger://');
    const ip = freshIp();
    const ceremony = await options('generate-register-options', ip, token);

    const response = await verify(
      'verify-registration',
      { response: await authenticator.register(ceremony.options) },
      { ip, challenge: ceremony.challenge, token, origin: 'shotledger://' },
    );

    expect(response.status).not.toBe(200);
    expect(await passkeyRows(await userIdOf(token))).toEqual([]);
  });

  it('refuses a credential already registered to another account', async () => {
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);
    expect((await register(await signUp('first@example.com'), authenticator)).status).toBe(200);
    const second = await signUp('second@example.com');

    const response = await register(second, authenticator);

    expect(response.status).not.toBe(200);
    expect(await passkeyRows(await userIdOf(second))).toEqual([]);
  });
});

describe('signing in with a passkey', () => {
  it('answers a bearer token for the account the passkey belongs to', async () => {
    const token = await signUp('signin@example.com');
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);
    expect((await register(token, authenticator)).status).toBe(200);

    const response = await signInWith(authenticator);

    expect(response.status).toBe(200);
    expect(response.headers.has('set-cookie')).toBe(false);
    const signedIn = response.headers.get('set-auth-token');
    expect(signedIn).toBeTruthy();
    expect(await userIdOf(signedIn!)).toBe(await userIdOf(token));
  });

  it('gives a sign-in that asks not to be remembered the web session length', async () => {
    const token = await signUp('web@example.com');
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);
    expect((await register(token, authenticator)).status).toBe(200);

    const web = await (
      await signInWith(authenticator, '?rememberMe=false')
    ).json<{
      session: { createdAt: string; expiresAt: string };
    }>();
    const phone = await (
      await signInWith(authenticator)
    ).json<{
      session: { createdAt: string; expiresAt: string };
    }>();

    const span = (s: { createdAt: string; expiresAt: string }) =>
      Date.parse(s.expiresAt) - Date.parse(s.createdAt);
    expect(span(web.session)).toBe(WEB_SESSION_TTL_MS);
    expect(span(phone.session)).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it('uses a challenge once', async () => {
    const token = await signUp('replay@example.com');
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);
    expect((await register(token, authenticator)).status).toBe(200);
    const ip = freshIp();
    const ceremony = await options('generate-authenticate-options', ip);
    const body = { response: await authenticator.authenticate(ceremony.options) };

    const first = await verify('verify-authentication', body, {
      ip,
      challenge: ceremony.challenge,
    });
    const replay = await verify('verify-authentication', body, {
      ip,
      challenge: ceremony.challenge,
    });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(400);
  });

  it('refuses a passkey nobody registered', async () => {
    const response = await signInWith(await softAuthenticator(RP_ID, ORIGIN));
    expect(response.status).toBe(401);
    expect(response.headers.has('set-auth-token')).toBe(false);
  });

  it('refuses a forged challenge header', async () => {
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);
    expect((await register(await signUp('forged@example.com'), authenticator)).status).toBe(200);
    const ip = freshIp();
    const ceremony = await options('generate-authenticate-options', ip);
    const forged = ceremony.challenge.replace(/=.*/, '=made-up.c2ln');

    const response = await verify(
      'verify-authentication',
      { response: await authenticator.authenticate(ceremony.options) },
      { ip, challenge: forged },
    );

    expect(response.status).toBe(400);
  });

  it('refuses the sixth sign-in attempt from one IP within 60 s', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await verify('verify-authentication', { response: { id: 'x' } }, { ip });
      statuses.push(response.status);
      await response.text();
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });
});

describe('managing passkeys', () => {
  it('lists, renames and removes them; a removed one no longer signs in', async () => {
    const token = await signUp('manage@example.com');
    const authenticator = await softAuthenticator(RP_ID, ORIGIN);
    expect((await register(token, authenticator, 'Phone')).status).toBe(200);
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const listed = await fetchApp('/api/auth/passkey/list-user-passkeys', {
      ip: freshIp(),
      headers: auth,
    });
    const [only] = await listed.json<{ id: string; name: string; publicKey: string }[]>();
    expect(only!.name).toBe('Phone');

    const renamed = await fetchApp('/api/auth/passkey/update-passkey', {
      ip: freshIp(),
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ id: only!.id, name: 'Old phone' }),
    });
    expect(renamed.status).toBe(200);

    const removed = await fetchApp('/api/auth/passkey/delete-passkey', {
      ip: freshIp(),
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ id: only!.id }),
    });
    expect(removed.status).toBe(200);
    expect(await passkeyRows(await userIdOf(token))).toEqual([]);
    expect((await signInWith(authenticator)).status).toBe(401);
  });

  it("cannot remove another account's passkey", async () => {
    const owner = await signUp('owner@example.com');
    expect((await register(owner, await softAuthenticator(RP_ID, ORIGIN))).status).toBe(200);
    const [row] = (
      await env.DB.prepare('SELECT id FROM passkey WHERE user_id = ?')
        .bind(await userIdOf(owner))
        .all<{ id: string }>()
    ).results;
    const other = await signUp('other@example.com');

    const response = await fetchApp('/api/auth/passkey/delete-passkey', {
      ip: freshIp(),
      method: 'POST',
      headers: { authorization: `Bearer ${other}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: row!.id }),
    });

    expect(response.status).toBe(401);
    expect(await passkeyRows(await userIdOf(owner))).toHaveLength(1);
  });

  it('deleting the account deletes its passkeys', async () => {
    const token = await signUp('gone@example.com');
    expect((await register(token, await softAuthenticator(RP_ID, ORIGIN))).status).toBe(200);
    const userId = await userIdOf(token);

    const response = await fetchApp('/account/delete', {
      ip: freshIp(),
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    });

    expect(response.status).toBe(200);
    expect(await passkeyRows(userId)).toEqual([]);
  });
});

describe('the passkey rp id', () => {
  it.each([
    [undefined, 'app.shotledger.example', 'app.shotledger.example'],
    ['', 'app.shotledger.example', 'app.shotledger.example'],
    ['shotledger.example', 'app.shotledger.example', 'shotledger.example'],
    [' Shotledger.Example ', 'app.shotledger.example', 'shotledger.example'],
  ])('PASSKEY_RP_ID %j on %s is %s', (configured, host, expected) => {
    expect(passkeyRpId(configured, host)).toBe(expected);
  });

  it.each([
    ['REPLACE_ME.invalid', 'app.shotledger.example'],
    ['other.example', 'app.shotledger.example'],
    ['ledger.example', 'app.shotledger.example'],
    ['example', 'app.shotledger.example'],
    ['deep.app.shotledger.example', 'app.shotledger.example'],
  ])('refuses %s on %s', (configured, host) => {
    expect(() => passkeyRpId(configured, host)).toThrow(AuthConfigError);
  });

  it('a deployed env with a bad PASSKEY_RP_ID does not start', () => {
    expect(() => createAuth({ ...deployedEnv, PASSKEY_RP_ID: 'other.example' })).toThrow(
      AuthConfigError,
    );
  });
});

describe('the purge cron', () => {
  it('deletes expired verification rows, a cancelled passkey prompt among them', async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind('expired', 'cancelled-prompt', '{}', now - 1_000, now - 301_000, now - 301_000),
      env.DB.prepare(
        'INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind('live', 'open-prompt', '{}', now + 299_000, now, now),
    ]);

    await worker.scheduled(createScheduledController(), env);

    const { results } = await env.DB.prepare(
      "SELECT id FROM verification WHERE id IN ('expired', 'live')",
    ).all<{ id: string }>();
    expect(results.map((row) => row.id)).toEqual(['live']);
  });
});
