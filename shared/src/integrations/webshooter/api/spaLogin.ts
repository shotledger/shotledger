// In-app Webshooter login. Per the maintainer's PR #19 comment (2026-09-01):
// device to webshooter.se directly — credentials and token NEVER transit or
// touch a ShotLedger backend.
//
// The VERIFY this module carried ("inspect the SPA login network request")
// was resolved on 2026-09-11 by reading webshooter.se's own AngularJS client:
// it is a Laravel Passport **password grant**. The user's email and password
// authenticate the user; `client_id`/`client_secret` identify the calling
// application.
//
// The client secret is READ FROM webshooter.se AT LOGIN TIME rather than
// shipped. It is published to every anonymous visitor in an inline <script>
// on their homepage — it has to be, since their own client is JavaScript in
// a browser — so fetching it is just reading what the browser reads, and it
// means a rotation on their side heals itself instead of bricking login
// until someone notices. Nothing is stored, in the tree or in the build.
export interface WebshooterSpaLoginRequest {
  username: string;
  password: string;
}

export interface WebshooterSpaLoginResult {
  token: string;
}

export interface WebshooterSpaLoginClient {
  login(request: WebshooterSpaLoginRequest): Promise<WebshooterSpaLoginResult>;
}

/** The OAuth client identity, supplied by the host so no secret lives in this tree. */
export interface WebshooterOAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export class WebshooterSpaLoginNotVerifiedError extends Error {
  constructor() {
    super(
      'Webshooter SPA login endpoint is not verified (VERIFY: inspect the SPA login network ' +
        'request — path, request body field names, response shape — before implementing). ' +
        'Credentials/token must never transit a ShotLedger backend once implemented.',
    );
    this.name = 'WebshooterSpaLoginNotVerifiedError';
  }
}

/** The client secret could be neither read from webshooter.se nor fallen back to. */
export class WebshooterSpaLoginUnconfiguredError extends Error {
  /** Which way discovery failed — the three need different things from the user. */
  readonly failure: ClientSecretDiscoveryFailure;
  /** Status line or exception text, for a bug report. */
  readonly detail: string;

  constructor(failure: ClientSecretDiscoveryFailure, detail: string) {
    super(
      `Webshooter's published OAuth client secret could not be read (${failure}: ${detail}), ` +
        'and this build carries no fallback. Use a manual API token instead.',
    );
    this.name = 'WebshooterSpaLoginUnconfiguredError';
    this.failure = failure;
    this.detail = detail;
  }
}

/** Wrong username or password — the user's half of the request. */
export class WebshooterSpaLoginRejectedError extends Error {
  constructor() {
    super('Webshooter rejected the username or password.');
    this.name = 'WebshooterSpaLoginRejectedError';
  }
}

/**
 * Webshooter rejected the *app*, not the user — `invalid_client`.
 *
 * Almost always means they rotated the client secret, which they can do
 * without warning. Distinguished from a bad password because the two need
 * opposite responses: one the user can fix, the other only we can.
 */
export class WebshooterSpaLoginClientRejectedError extends Error {
  constructor() {
    super("Webshooter rejected this app's OAuth client credentials (invalid_client).");
    this.name = 'WebshooterSpaLoginClientRejectedError';
  }
}

/**
 * Stub client: `login()` always rejects and never calls `fetchImpl`. Kept for
 * builds with no OAuth client config — see `createSpaLoginClient`.
 */
export function createUnverifiedSpaLoginClient(
  fetchImpl: typeof fetch,
  baseUrl: string,
): WebshooterSpaLoginClient {
  return {
    login(_request: WebshooterSpaLoginRequest): Promise<WebshooterSpaLoginResult> {
      void fetchImpl;
      void baseUrl;
      return Promise.reject(new WebshooterSpaLoginNotVerifiedError());
    },
  };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * The real password-grant client.
 *
 * `grant_type=password` with the app's client credentials alongside the
 * user's. Nothing here is stored: the password exists for the duration of
 * one request, and only `access_token` is returned to the caller.
 */
export function createWebshooterSpaLoginClient(
  fetchImpl: typeof fetch,
  baseUrl: string,
  client: WebshooterOAuthClientConfig,
): WebshooterSpaLoginClient {
  return {
    async login(request: WebshooterSpaLoginRequest): Promise<WebshooterSpaLoginResult> {
      const response = await fetchImpl(joinUrl(baseUrl, 'oauth/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'password',
          client_id: client.clientId,
          client_secret: client.clientSecret,
          username: request.username,
          password: request.password,
        }),
      });

      // Read the body before branching on status: Passport puts the reason
      // (`invalid_grant` vs `invalid_client`) in the body, and the status
      // alone does not separate "your password is wrong" from "our client
      // registration is stale".
      const body: unknown = await response.json().catch(() => null);
      const error =
        typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;

      if (error === 'invalid_client') throw new WebshooterSpaLoginClientRejectedError();
      if (error === 'invalid_grant' || response.status === 401)
        throw new WebshooterSpaLoginRejectedError();
      if (!response.ok) {
        // webshooter.se answers a failed login with an opaque 500 and a
        // Swedish "an error occurred" rather than Passport's invalid_grant
        // (verified against the live host 2026-09-11, with valid client
        // credentials and deliberately wrong user credentials). So the
        // status alone says nothing — carry their message, or the reader
        // is left with "could not connect" and no way to tell a wrong
        // password from a broken endpoint.
        const message =
          typeof body === 'object' && body !== null
            ? (body as { message?: unknown }).message
            : undefined;
        throw new Error(
          `Webshooter login failed: HTTP ${response.status}` +
            (typeof message === 'string' && message !== '' ? ` — ${message}` : ''),
        );
      }

      const token =
        typeof body === 'object' && body !== null
          ? (body as { access_token?: unknown }).access_token
          : undefined;
      if (typeof token !== 'string' || token === '')
        throw new Error('Webshooter login returned no access_token');

      return { token };
    },
  };
}

/**
 * The web SPA's Passport client id, hard-coded as `client_id = 1` in their
 * own bundle. An identifier, not a credential — it belongs in source.
 */
export const WEBSHOOTER_WEB_CLIENT_ID = '1';

/**
 * How reading the published secret failed.
 *
 * - `unreachable` — no response at all; the user's connection, or the host.
 * - `rejected` — a response, but not a 200; webshooter.se having a bad day.
 * - `absent` — a page that no longer carries the constant. This one is ours
 *   to fix: they changed something and this code has to follow.
 */
export type ClientSecretDiscoveryFailure = 'unreachable' | 'rejected' | 'absent';

export type ClientSecretDiscovery =
  { secret: string } | { secret: null; failure: ClientSecretDiscoveryFailure; detail: string };

/** Matches `app.value('oauthClientSecret', '…')` however it is quoted or spaced. */
const PUBLISHED_SECRET = /oauthClientSecret['"]\s*,\s*['"]([^'"]+)['"]/;

/**
 * Reads the client secret webshooter.se publishes to anonymous visitors.
 *
 * Never throws — a login must not die because a scrape did — but always
 * reports HOW it failed. The three failures need different things: one is
 * the user's network, one is webshooter.se being down, and one means they
 * changed their page and this code needs updating. Collapsing them into a
 * bare null leaves a field failure with nothing to go on.
 */
export async function discoverPublishedClientSecret(
  fetchImpl: typeof fetch,
  siteUrl: string,
): Promise<ClientSecretDiscovery> {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetchImpl(siteUrl, { headers: { Accept: 'text/html' } });
  } catch (err) {
    return {
      secret: null,
      failure: 'unreachable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) return { secret: null, failure: 'rejected', detail: `HTTP ${response.status}` };

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    return {
      secret: null,
      failure: 'unreachable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const match = PUBLISHED_SECRET.exec(body);
  if (!match?.[1])
    return {
      secret: null,
      failure: 'absent',
      detail: `no oauthClientSecret in ${body.length} bytes`,
    };

  return { secret: match[1] };
}

export interface SpaLoginClientOptions {
  /** API root, e.g. https://webshooter.se/api/v4.1.9 */
  baseUrl: string;
  /** Site root the client secret is published on, e.g. https://webshooter.se/ */
  siteUrl: string;
  /**
   * Used only when the page cannot be read. Optional by design: the normal
   * path needs no configured secret at all.
   */
  fallback?: Partial<WebshooterOAuthClientConfig> | null;
}

/**
 * Login client that reads the client secret from webshooter.se per login,
 * falling back to a configured value if the page cannot be read.
 *
 * The fallback is what keeps a page redesign from taking login out entirely;
 * discovery is what keeps a rotation from doing the same. Neither covers the
 * other, which is why both are here.
 */
export function createSpaLoginClient(
  fetchImpl: typeof fetch,
  options: SpaLoginClientOptions,
): WebshooterSpaLoginClient {
  return {
    async login(request: WebshooterSpaLoginRequest): Promise<WebshooterSpaLoginResult> {
      const discovered = await discoverPublishedClientSecret(fetchImpl, options.siteUrl);
      const clientSecret = discovered.secret ?? options.fallback?.clientSecret;
      if (!clientSecret)
        throw new WebshooterSpaLoginUnconfiguredError(
          discovered.secret === null ? discovered.failure : 'absent',
          discovered.secret === null ? discovered.detail : '',
        );

      return createWebshooterSpaLoginClient(fetchImpl, options.baseUrl, {
        clientId: options.fallback?.clientId || WEBSHOOTER_WEB_CLIENT_ID,
        clientSecret,
      }).login(request);
    },
  };
}
