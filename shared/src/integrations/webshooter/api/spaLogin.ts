// In-app WebShooter login. Per the maintainer's PR #19 comment (2026-09-01):
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
export interface WebShooterSpaLoginRequest {
  username: string;
  password: string;
}

export interface WebShooterSpaLoginResult {
  token: string;
}

export interface WebShooterSpaLoginClient {
  login(request: WebShooterSpaLoginRequest): Promise<WebShooterSpaLoginResult>;
}

/** The OAuth client identity, supplied by the host so no secret lives in this tree. */
export interface WebShooterOAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export class WebShooterSpaLoginNotVerifiedError extends Error {
  constructor() {
    super(
      'WebShooter SPA login endpoint is not verified (VERIFY: inspect the SPA login network ' +
        'request — path, request body field names, response shape — before implementing). ' +
        'Credentials/token must never transit a ShotLedger backend once implemented.',
    );
    this.name = 'WebShooterSpaLoginNotVerifiedError';
  }
}

/** The client secret could be neither read from webshooter.se nor fallen back to. */
export class WebShooterSpaLoginUnconfiguredError extends Error {
  constructor() {
    super(
      "WebShooter's published OAuth client secret could not be read, and this build " +
        'carries no fallback. Use a manual API token instead.',
    );
    this.name = 'WebShooterSpaLoginUnconfiguredError';
  }
}

/** Wrong username or password — the user's half of the request. */
export class WebShooterSpaLoginRejectedError extends Error {
  constructor() {
    super('WebShooter rejected the username or password.');
    this.name = 'WebShooterSpaLoginRejectedError';
  }
}

/**
 * WebShooter rejected the *app*, not the user — `invalid_client`.
 *
 * Almost always means they rotated the client secret, which they can do
 * without warning. Distinguished from a bad password because the two need
 * opposite responses: one the user can fix, the other only we can.
 */
export class WebShooterSpaLoginClientRejectedError extends Error {
  constructor() {
    super("WebShooter rejected this app's OAuth client credentials (invalid_client).");
    this.name = 'WebShooterSpaLoginClientRejectedError';
  }
}

/**
 * Stub client: `login()` always rejects and never calls `fetchImpl`. Kept for
 * builds with no OAuth client config — see `createSpaLoginClient`.
 */
export function createUnverifiedSpaLoginClient(
  fetchImpl: typeof fetch,
  baseUrl: string,
): WebShooterSpaLoginClient {
  return {
    login(_request: WebShooterSpaLoginRequest): Promise<WebShooterSpaLoginResult> {
      void fetchImpl;
      void baseUrl;
      return Promise.reject(new WebShooterSpaLoginNotVerifiedError());
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
export function createWebShooterSpaLoginClient(
  fetchImpl: typeof fetch,
  baseUrl: string,
  client: WebShooterOAuthClientConfig,
): WebShooterSpaLoginClient {
  return {
    async login(request: WebShooterSpaLoginRequest): Promise<WebShooterSpaLoginResult> {
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

      if (error === 'invalid_client') throw new WebShooterSpaLoginClientRejectedError();
      if (error === 'invalid_grant' || response.status === 401)
        throw new WebShooterSpaLoginRejectedError();
      if (!response.ok) throw new Error(`WebShooter login failed with status ${response.status}`);

      const token =
        typeof body === 'object' && body !== null
          ? (body as { access_token?: unknown }).access_token
          : undefined;
      if (typeof token !== 'string' || token === '')
        throw new Error('WebShooter login returned no access_token');

      return { token };
    },
  };
}

/**
 * The web SPA's Passport client id, hard-coded as `client_id = 1` in their
 * own bundle. An identifier, not a credential — it belongs in source.
 */
export const WEBSHOOTER_WEB_CLIENT_ID = '1';

/** Matches `app.value('oauthClientSecret', '…')` however it is quoted or spaced. */
const PUBLISHED_SECRET = /oauthClientSecret['"]\s*,\s*['"]([^'"]+)['"]/;

/**
 * Reads the client secret webshooter.se publishes to anonymous visitors.
 *
 * Returns null on anything unexpected — an unreachable host, a changed page,
 * a redesign that moves the constant — so the caller can fall back rather
 * than fail. Never throws: a login must not die because a scrape did.
 */
export async function discoverPublishedClientSecret(
  fetchImpl: typeof fetch,
  siteUrl: string,
): Promise<string | null> {
  try {
    const response = await fetchImpl(siteUrl, { headers: { Accept: 'text/html' } });
    if (!response.ok) return null;
    const match = PUBLISHED_SECRET.exec(await response.text());
    return match?.[1] ?? null;
  } catch {
    return null;
  }
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
  fallback?: Partial<WebShooterOAuthClientConfig> | null;
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
): WebShooterSpaLoginClient {
  return {
    async login(request: WebShooterSpaLoginRequest): Promise<WebShooterSpaLoginResult> {
      const discovered = await discoverPublishedClientSecret(fetchImpl, options.siteUrl);
      const clientSecret = discovered ?? options.fallback?.clientSecret;
      if (!clientSecret) throw new WebShooterSpaLoginUnconfiguredError();

      return createWebShooterSpaLoginClient(fetchImpl, options.baseUrl, {
        clientId: options.fallback?.clientId || WEBSHOOTER_WEB_CLIENT_ID,
        clientSecret,
      }).login(request);
    },
  };
}
