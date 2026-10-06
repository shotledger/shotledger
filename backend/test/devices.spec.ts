// The web account page's device list (#277): better-auth's own list-sessions
// and revoke-session, through the real shared client and the real Worker.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import { createAccountApi, createHttpSyncTransport, PROTOCOL_VERSION } from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://example.com';
const PASSWORD = 'correct horse battery staple';

/** A bearer token is the session token plus its signature. */
const sessionToken = (bearer: string | null) => bearer!.split('.')[0]!;

async function fetchApp(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(input, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function device() {
  let token: string | null = null;
  const config = { fetchImpl: fetchApp, baseUrl: BASE_URL, getToken: () => token };
  const account = createAccountApi(config);
  const transport = createHttpSyncTransport(config);
  return {
    account,
    get token() {
      return token;
    },
    async signIn(email: string) {
      token = (await account.signIn(email, PASSWORD)).token;
    },
    async signUp(email: string) {
      token = (await account.signUp(email, PASSWORD, 'Test User')).token;
    },
    pull: () =>
      transport.pull({
        protocolVersion: PROTOCOL_VERSION,
        tables: [{ tableName: 'sessions', cursor: 0 }],
      }),
  };
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

describe('signed-in devices', () => {
  it('lists every session on the account and marks the caller', async () => {
    const phone = device();
    const browser = device();
    await phone.signUp('devices-list@example.com');
    await browser.signIn('devices-list@example.com');

    const devices = await browser.account.listDevices();

    expect(devices.map((d) => d.token).sort()).toEqual(
      [sessionToken(phone.token), sessionToken(browser.token)].sort(),
    );
    expect(devices.filter((d) => d.isCurrent).map((d) => d.token)).toEqual([
      sessionToken(browser.token),
    ]);
  });

  it('revoking a device signs it out and leaves the caller signed in', async () => {
    const phone = device();
    const browser = device();
    await phone.signUp('devices-revoke@example.com');
    await browser.signIn('devices-revoke@example.com');
    await expect(phone.pull()).resolves.toBeDefined();

    await browser.account.revokeDevice(sessionToken(phone.token));

    await expect(phone.pull()).rejects.toMatchObject({ status: 401 });
    await expect(browser.pull()).resolves.toBeDefined();
    expect((await browser.account.listDevices()).map((d) => d.token)).toEqual([
      sessionToken(browser.token),
    ]);
  });

  it("cannot revoke another account's session", async () => {
    const victim = device();
    const other = device();
    await victim.signUp('devices-victim@example.com');
    await other.signUp('devices-other@example.com');

    await other.account.revokeDevice(sessionToken(victim.token));

    await expect(victim.pull()).resolves.toBeDefined();
  });
});
