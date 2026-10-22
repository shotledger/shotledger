// The passkey calls' wire shape: what the Worker expects (backend/test/passkey.spec.ts
// runs them against the real one), checked here without it.
import { describe, expect, it } from 'vitest';

import { AuthError, createAccountApi } from './index';

const BASE = 'https://example.invalid';
const CHALLENGE = 'better-auth.better-auth-passkey=abc.sig';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function recording(
  respond: (call: Call) => Response,
  token: string | null = 'tok',
): { calls: Call[]; api: ReturnType<typeof createAccountApi> } {
  const calls: Call[] = [];
  const api = createAccountApi({
    baseUrl: BASE,
    getToken: () => token,
    fetchImpl: async (url, init) => {
      const call = {
        url,
        method: init?.method ?? 'GET',
        headers: init?.headers as Record<string, string>,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      };
      calls.push(call);
      return respond(call);
    },
  });
  return { calls, api };
}

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

describe('passkey ceremonies', () => {
  it('registration options are a GET with the bearer token, and keep the challenge', async () => {
    const { calls, api } = recording(() =>
      json({ challenge: 'c' }, { 'x-passkey-challenge': CHALLENGE }),
    );

    const ceremony = await api.passkeyRegistrationOptions();

    expect(ceremony).toEqual({ options: { challenge: 'c' }, challenge: CHALLENGE });
    expect(calls[0]).toMatchObject({
      url: `${BASE}/api/auth/passkey/generate-register-options`,
      method: 'GET',
      body: undefined,
      headers: { authorization: 'Bearer tok', origin: BASE },
    });
  });

  it('options without a challenge header are an error', async () => {
    const { api } = recording(() => json({ challenge: 'c' }));
    await expect(api.passkeySignInOptions()).rejects.toBeInstanceOf(AuthError);
  });

  it('options that are not an object are an error', async () => {
    const { api } = recording(() => json(null, { 'x-passkey-challenge': CHALLENGE }));
    await expect(api.passkeySignInOptions()).rejects.toBeInstanceOf(AuthError);
  });

  it('sign-in options name no account', async () => {
    const { calls, api } = recording(() => json({}, { 'x-passkey-challenge': CHALLENGE }));
    await api.passkeySignInOptions();
    expect(calls[0]!.url).toBe(`${BASE}/api/auth/passkey/generate-authenticate-options`);
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it('adding a passkey sends the response, its name and the challenge', async () => {
    const { calls, api } = recording(() => json({}));
    await api.addPasskey({ options: {}, challenge: CHALLENGE }, { id: 'cred' }, 'Laptop');
    expect(calls[0]).toMatchObject({
      url: `${BASE}/api/auth/passkey/verify-registration`,
      method: 'POST',
      body: { response: { id: 'cred' }, name: 'Laptop' },
      headers: { authorization: 'Bearer tok', 'x-passkey-challenge': CHALLENGE },
    });
  });

  it.each([
    [{ remember: false }, '?rememberMe=false'],
    [{}, ''],
  ])('signing in with %j asks for %j and answers the session', async (options, query) => {
    const { calls, api } = recording(
      () => json({ user: { id: 'u1', email: 'a@example.invalid' } }, { 'set-auth-token': 'new' }),
      null,
    );

    const session = await api.signInWithPasskey(
      { options: {}, challenge: CHALLENGE },
      { id: 'cred' },
      options,
    );

    expect(session).toEqual({ token: 'new', userId: 'u1', email: 'a@example.invalid' });
    expect(calls[0]).toMatchObject({
      url: `${BASE}/api/auth/passkey/verify-authentication${query}`,
      body: { response: { id: 'cred' } },
      headers: { 'x-passkey-challenge': CHALLENGE },
    });
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it('a refused sign-in throws its status', async () => {
    const { api } = recording(() => json({ code: 'PASSKEY_NOT_FOUND' }, {}, 401));
    await expect(
      api.signInWithPasskey({ options: {}, challenge: CHALLENGE }, {}),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('managing passkeys', () => {
  it('lists them with missing fields as null', async () => {
    const { calls, api } = recording(() =>
      json([
        { id: 'p1', name: 'Laptop', createdAt: '2026-10-19T22:00:00.000Z', aaguid: 'a', x: 1 },
        { id: 'p2' },
      ]),
    );

    expect(await api.listPasskeys()).toEqual([
      { id: 'p1', name: 'Laptop', createdAt: '2026-10-19T22:00:00.000Z', aaguid: 'a' },
      { id: 'p2', name: null, createdAt: null, aaguid: null },
    ]);
    expect(calls[0]).toMatchObject({
      url: `${BASE}/api/auth/passkey/list-user-passkeys`,
      method: 'GET',
    });
  });

  it('removes one by id', async () => {
    const { calls, api } = recording(() => json({ status: true }));
    await api.removePasskey('p1');
    expect(calls[0]).toMatchObject({
      url: `${BASE}/api/auth/passkey/delete-passkey`,
      method: 'POST',
      body: { id: 'p1' },
    });
  });
});
