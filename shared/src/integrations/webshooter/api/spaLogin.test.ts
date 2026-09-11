import { describe, expect, it, vi } from 'vitest';
import {
  createSpaLoginClient,
  createUnverifiedSpaLoginClient,
  createWebShooterSpaLoginClient,
  WebShooterSpaLoginClientRejectedError,
  WebShooterSpaLoginNotVerifiedError,
  WebShooterSpaLoginRejectedError,
  WebShooterSpaLoginUnconfiguredError,
} from './spaLogin';

const CLIENT = { clientId: '1', clientSecret: 'test-secret' };
const BASE = 'https://webshooter.se/api/v4.1.9';

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  ) as unknown as typeof fetch;
}

describe('createWebShooterSpaLoginClient', () => {
  it('posts a password grant carrying both identities', async () => {
    const fetchImpl = respond(200, { access_token: 'tok', token_type: 'Bearer' });
    const client = createWebShooterSpaLoginClient(fetchImpl, BASE, CLIENT);

    await expect(client.login({ username: 'a@b.se', password: 'pw' })).resolves.toEqual({
      token: 'tok',
    });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [url, init] = call as [string, { method: string; body: string }];
    expect(url).toBe('https://webshooter.se/api/v4.1.9/oauth/token');
    expect(init.method).toBe('POST');
    // The user's half and the app's half travel together; the grant is
    // rejected if either is missing.
    expect(JSON.parse(init.body)).toEqual({
      grant_type: 'password',
      client_id: '1',
      client_secret: 'test-secret',
      username: 'a@b.se',
      password: 'pw',
    });
  });

  it('joins the URL without doubling or dropping the slash', async () => {
    const fetchImpl = respond(200, { access_token: 'tok' });
    await createWebShooterSpaLoginClient(fetchImpl, `${BASE}/`, CLIENT).login({
      username: 'a',
      password: 'b',
    });

    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      'https://webshooter.se/api/v4.1.9/oauth/token',
    );
  });

  it("reads a wrong password as the user's failure", async () => {
    const client = createWebShooterSpaLoginClient(
      respond(400, { error: 'invalid_grant', message: 'These credentials do not match' }),
      BASE,
      CLIENT,
    );

    await expect(client.login({ username: 'a', password: 'wrong' })).rejects.toBeInstanceOf(
      WebShooterSpaLoginRejectedError,
    );
  });

  it("reads invalid_client as OUR failure, not the user's", async () => {
    // The distinction is the point: a rotated client secret looks like a
    // login failure to the user, who would then retype a correct password
    // forever. Only we can fix it.
    const client = createWebShooterSpaLoginClient(
      respond(401, { error: 'invalid_client' }),
      BASE,
      CLIENT,
    );

    await expect(client.login({ username: 'a', password: 'pw' })).rejects.toBeInstanceOf(
      WebShooterSpaLoginClientRejectedError,
    );
  });

  it('treats a 401 with no error body as a rejected login', async () => {
    const client = createWebShooterSpaLoginClient(respond(401, null), BASE, CLIENT);

    await expect(client.login({ username: 'a', password: 'pw' })).rejects.toBeInstanceOf(
      WebShooterSpaLoginRejectedError,
    );
  });

  it('refuses a 200 that carries no access_token', async () => {
    // webshooter.se answers an unrouted path with its SPA's HTML and a 200.
    // A success status is not evidence that a token came back.
    const client = createWebShooterSpaLoginClient(respond(200, { message: 'ok' }), BASE, CLIENT);

    await expect(client.login({ username: 'a', password: 'pw' })).rejects.toThrow(
      'no access_token',
    );
  });

  it('refuses a 200 whose body is not JSON at all', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Unexpected token <')),
      }),
    ) as unknown as typeof fetch;

    await expect(
      createWebShooterSpaLoginClient(fetchImpl, BASE, CLIENT).login({
        username: 'a',
        password: 'pw',
      }),
    ).rejects.toThrow('no access_token');
  });

  it('surfaces any other non-ok status rather than inventing a token', async () => {
    const client = createWebShooterSpaLoginClient(respond(500, { message: 'fel' }), BASE, CLIENT);

    await expect(client.login({ username: 'a', password: 'pw' })).rejects.toThrow('status 500');
  });
});

describe('createSpaLoginClient', () => {
  it('never sends a request when the build carries no client config', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = createSpaLoginClient(fetchImpl, BASE, null);

    await expect(client.login({ username: 'a', password: 'b' })).rejects.toBeInstanceOf(
      WebShooterSpaLoginUnconfiguredError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats a half-configured build as unconfigured', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = createSpaLoginClient(fetchImpl, BASE, { clientId: '1' });

    await expect(client.login({ username: 'a', password: 'b' })).rejects.toBeInstanceOf(
      WebShooterSpaLoginUnconfiguredError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the real client once both halves are present', async () => {
    const fetchImpl = respond(200, { access_token: 'tok' });

    await expect(
      createSpaLoginClient(fetchImpl, BASE, CLIENT).login({ username: 'a', password: 'b' }),
    ).resolves.toEqual({ token: 'tok' });
  });
});

describe('createUnverifiedSpaLoginClient', () => {
  it('login() always rejects with WebShooterSpaLoginNotVerifiedError', async () => {
    const fetchImpl = vi.fn();
    const client = createUnverifiedSpaLoginClient(fetchImpl, 'https://webshooter.se');

    await expect(client.login({ username: 'a', password: 'b' })).rejects.toBeInstanceOf(
      WebShooterSpaLoginNotVerifiedError,
    );
  });

  it('the error names itself and explains what is unverified and the credential-handling constraint', () => {
    const error = new WebShooterSpaLoginNotVerifiedError();
    expect(error.name).toBe('WebShooterSpaLoginNotVerifiedError');
    expect(error.message).toContain('VERIFY: inspect the SPA login network');
    expect(error.message).toContain('request — path, request body field names, response shape');
    expect(error.message).toContain('Credentials/token must never transit a ShotLedger backend');
  });

  it('never calls fetchImpl', async () => {
    const fetchImpl = vi.fn();
    const client = createUnverifiedSpaLoginClient(fetchImpl, 'https://webshooter.se');

    await client.login({ username: 'a', password: 'b' }).catch(() => undefined);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
