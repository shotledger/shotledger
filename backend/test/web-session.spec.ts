// A web sign-in leaves no cookie credential and ends on the server after
// WEB_SESSION_TTL_MS (#743); a phone's sign-in keeps renewing with use.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import { createAccountApi, createHttpSyncTransport, PROTOCOL_VERSION } from '@shotledger/shared';

import { WEB_SESSION_TTL_MS } from '../src/auth/better-auth';
import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://localhost';
const PASSWORD = 'correct horse battery staple';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PULL_BODY = JSON.stringify({
  protocolVersion: PROTOCOL_VERSION,
  tables: [{ tableName: 'sessions', cursor: 0 }],
});

async function fetchApp(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(input, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

/** Records every response, so a test can look at the sign-in's headers. */
function client(remember: boolean) {
  let token: string | null = null;
  const responses: Response[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const response = await fetchApp(input, init);
    responses.push(response.clone());
    return response;
  };
  const config = { fetchImpl, baseUrl: BASE_URL, getToken: () => token };
  const account = createAccountApi(config);
  const transport = createHttpSyncTransport(config);
  return {
    account,
    responses,
    get token() {
      return token!;
    },
    async signUp(email: string) {
      token = (await account.signUp(email, PASSWORD, 'Test User')).token;
    },
    async signIn(email: string) {
      token = (await account.signIn(email, PASSWORD, remember ? {} : { remember: false })).token;
    },
    pull: () =>
      transport.pull({
        protocolVersion: PROTOCOL_VERSION,
        tables: [{ tableName: 'sessions', cursor: 0 }],
      }),
  };
}

/** The session row behind a bearer token (the token before its signature). */
async function sessionRow(bearer: string): Promise<{ createdAt: number; expiresAt: number }> {
  const row = await env.DB.prepare(
    'SELECT created_at AS createdAt, expires_at AS expiresAt FROM session WHERE token = ?',
  )
    .bind(bearer.split('.')[0])
    .first<{ createdAt: number; expiresAt: number }>();
  return row!;
}

async function setSessionTimes(bearer: string, createdAt: number, expiresAt: number) {
  await env.DB.prepare('UPDATE session SET created_at = ?, expires_at = ? WHERE token = ?')
    .bind(createdAt, expiresAt, bearer.split('.')[0])
    .run();
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

describe('web sign-in', () => {
  it('sets no cookie, on the web or on the phone, and still hands out the bearer token', async () => {
    const phone = client(true);
    const browser = client(false);
    await phone.signUp('web-cookie@example.com');
    await phone.signIn('web-cookie@example.com');
    await browser.signIn('web-cookie@example.com');

    for (const response of [...phone.responses, ...browser.responses]) {
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(browser.token).toBeTruthy();
    await expect(browser.pull()).resolves.toBeDefined();
  });

  it('refuses a request that carries the session only as a cookie', async () => {
    const browser = client(false);
    const phone = client(true);
    await phone.signUp('web-cookie-only@example.com');
    await browser.signIn('web-cookie-only@example.com');
    // What better-auth's cookie held: the same signed token the bearer carries.
    const cookie = `better-auth.session_token=${encodeURIComponent(browser.token)}`;

    const pull = await fetchApp(`${BASE_URL}/sync/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: BASE_URL },
      body: PULL_BODY,
    });
    expect(pull.status).toBe(401);

    const session = await fetchApp(`${BASE_URL}/api/auth/get-session`, {
      headers: { cookie, origin: BASE_URL },
    });
    expect(await session.json()).toBeNull();
  });

  it('lasts WEB_SESSION_TTL_MS from sign-in, where a phone gets days', async () => {
    const phone = client(true);
    const browser = client(false);
    await phone.signUp('web-ttl@example.com');
    await browser.signIn('web-ttl@example.com');

    const web = await sessionRow(browser.token);
    const native = await sessionRow(phone.token);
    expect(web.expiresAt - web.createdAt).toBe(WEB_SESSION_TTL_MS);
    expect(native.expiresAt - native.createdAt).toBeGreaterThan(6 * DAY_MS);
  });

  it('is never extended by use, while a phone session renews', async () => {
    const phone = client(true);
    const browser = client(false);
    await phone.signUp('web-refresh@example.com');
    await browser.signIn('web-refresh@example.com');
    const now = Date.now();
    // Both due for renewal by better-auth's rule (expiry within 6 days).
    await setSessionTimes(browser.token, now - 10 * HOUR_MS, now + 2 * HOUR_MS);
    await setSessionTimes(phone.token, now - 2 * DAY_MS, now + 5 * DAY_MS);

    await expect(browser.account.currentUser()).resolves.not.toBeNull();
    await expect(browser.pull()).resolves.toBeDefined();
    await expect(phone.account.currentUser()).resolves.not.toBeNull();

    expect((await sessionRow(browser.token)).expiresAt).toBe(now + 2 * HOUR_MS);
    expect((await sessionRow(phone.token)).expiresAt).toBeGreaterThan(now + 6 * DAY_MS);
  });

  it('once over, refuses the tab and drops off the device list', async () => {
    const phone = client(true);
    const browser = client(false);
    await phone.signUp('web-expired@example.com');
    await browser.signIn('web-expired@example.com');
    const now = Date.now();
    await setSessionTimes(browser.token, now - WEB_SESSION_TTL_MS - HOUR_MS, now - HOUR_MS);

    await expect(browser.pull()).rejects.toMatchObject({ status: 401 });
    await expect(browser.account.currentUser()).resolves.toBeNull();
    const devices = await phone.account.listDevices();
    expect(devices.map((d) => d.token)).toEqual([phone.token.split('.')[0]]);
  });
});
