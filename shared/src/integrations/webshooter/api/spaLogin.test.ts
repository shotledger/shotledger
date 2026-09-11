import { describe, expect, it, vi } from 'vitest';
import {
  createSpaLoginClient,
  discoverPublishedClientSecret,
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

const SITE = 'https://webshooter.se/';

/** The homepage as it is actually served, verified against the live host 2026-09-11. */
const REAL_PAGE_SHAPE = `<!DOCTYPE html><html lang="sv" ng-app="app"><body>
<script>app.value('ApiEndpointUrl', 'https://webshooter.se/api/v4.1.9/');</script>
<script>app.value('oauthClientSecret', 'published-secret');</script>
</body></html>`;

function html(status: number, body: string): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    }),
  ) as unknown as typeof fetch;
}

describe('discoverPublishedClientSecret', () => {
  it('reads the value out of the page webshooter.se serves anonymously', async () => {
    await expect(discoverPublishedClientSecret(html(200, REAL_PAGE_SHAPE), SITE)).resolves.toEqual({
      secret: 'published-secret',
    });
  });

  it('tolerates double quotes and loose spacing', async () => {
    const page = `<script>app.value( "oauthClientSecret" ,  "other-secret" );</script>`;
    await expect(discoverPublishedClientSecret(html(200, page), SITE)).resolves.toEqual({
      secret: 'other-secret',
    });
  });

  it('says the constant is absent, not merely that it failed', async () => {
    // 'absent' is the one failure meaning WebShooter changed and this code
    // has to follow. It must not read like a network blip.
    await expect(discoverPublishedClientSecret(html(200, '<html></html>'), SITE)).resolves.toEqual({
      secret: null,
      failure: 'absent',
      detail: 'no oauthClientSecret in 13 bytes',
    });
  });

  it('reports a non-ok response with its status', async () => {
    await expect(discoverPublishedClientSecret(html(503, ''), SITE)).resolves.toEqual({
      secret: null,
      failure: 'rejected',
      detail: 'HTTP 503',
    });
  });

  it('never throws when the host is unreachable, and keeps the reason', async () => {
    // A login must not die because a scrape did — the fallback cannot run if
    // discovery throws — but the reason has to survive it, or a failure in
    // the field has nothing to go on.
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error('network down')),
    ) as unknown as typeof fetch;

    await expect(discoverPublishedClientSecret(fetchImpl, SITE)).resolves.toEqual({
      secret: null,
      failure: 'unreachable',
      detail: 'network down',
    });
  });
});

describe('createSpaLoginClient', () => {
  function siteThenToken(page: string | null, token: unknown): typeof fetch {
    return vi.fn((url: string) =>
      url === SITE
        ? Promise.resolve({
            ok: page !== null,
            status: page === null ? 404 : 200,
            text: () => Promise.resolve(page ?? ''),
          })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(token) }),
    ) as unknown as typeof fetch;
  }

  it('logs in with the secret it just read, sending no configured value', async () => {
    const fetchImpl = siteThenToken(REAL_PAGE_SHAPE, { access_token: 'tok' });

    await expect(
      createSpaLoginClient(fetchImpl, { baseUrl: BASE, siteUrl: SITE }).login({
        username: 'a',
        password: 'b',
      }),
    ).resolves.toEqual({ token: 'tok' });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toBe(SITE);
    expect(JSON.parse((calls[1]![1] as { body: string }).body)).toMatchObject({
      client_id: '1',
      client_secret: 'published-secret',
    });
  });

  it('picks up a rotated secret without a rebuild', async () => {
    // The whole point of reading it per login: their value changes, ours
    // follows, and nobody has to notice.
    const rotated = REAL_PAGE_SHAPE.replace('published-secret', 'rotated-secret');
    const fetchImpl = siteThenToken(rotated, { access_token: 'tok' });

    await createSpaLoginClient(fetchImpl, { baseUrl: BASE, siteUrl: SITE }).login({
      username: 'a',
      password: 'b',
    });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((calls[1]![1] as { body: string }).body).client_secret).toBe(
      'rotated-secret',
    );
  });

  it('falls back to a configured secret when the page cannot be read', async () => {
    const fetchImpl = siteThenToken(null, { access_token: 'tok' });

    await createSpaLoginClient(fetchImpl, {
      baseUrl: BASE,
      siteUrl: SITE,
      fallback: CLIENT,
    }).login({ username: 'a', password: 'b' });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((calls[1]![1] as { body: string }).body).client_secret).toBe('test-secret');
  });

  it('prefers the published secret over a stale configured one', async () => {
    const fetchImpl = siteThenToken(REAL_PAGE_SHAPE, { access_token: 'tok' });

    await createSpaLoginClient(fetchImpl, {
      baseUrl: BASE,
      siteUrl: SITE,
      fallback: CLIENT,
    }).login({ username: 'a', password: 'b' });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse((calls[1]![1] as { body: string }).body).client_secret).toBe(
      'published-secret',
    );
  });

  it('never sends credentials when it has no secret at all, and says why', async () => {
    const fetchImpl = siteThenToken(null, { access_token: 'tok' });

    const error = await createSpaLoginClient(fetchImpl, { baseUrl: BASE, siteUrl: SITE })
      .login({ username: 'a', password: 'b' })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WebShooterSpaLoginUnconfiguredError);
    // The reason reaches the caller rather than dying in a catch block.
    expect((error as WebShooterSpaLoginUnconfiguredError).failure).toBe('rejected');
    expect((error as WebShooterSpaLoginUnconfiguredError).detail).toBe('HTTP 404');
    expect((error as Error).message).toContain('HTTP 404');

    // One call, to the site. The password never left the device.
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(SITE);
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
