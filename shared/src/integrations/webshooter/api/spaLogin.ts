// In-app WebShooter login. Per the maintainer's PR #19 comment (2026-09-01):
// device to webshooter.se directly — credentials and token NEVER transit or
// touch a ShotLedger backend.
//
// The VERIFY this module carried ("inspect the SPA login network request")
// was resolved on 2026-09-11 by reading webshooter.se's own AngularJS client:
// it is a Laravel Passport **password grant**. The user's email and password
// authenticate the user; `client_id`/`client_secret` identify the calling
// application, and are webshooter.se's own published web-client values. They
// are injected, never hard-coded — see ~/agents/shotledger/webshooter.env.
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

/** The build carries no OAuth client config, so password login cannot be attempted. */
export class WebShooterSpaLoginUnconfiguredError extends Error {
  constructor() {
    super(
      'WebShooter password login needs EXPO_PUBLIC_WEBSHOOTER_CLIENT_ID and ' +
        'EXPO_PUBLIC_WEBSHOOTER_CLIENT_SECRET at build time; this build has neither.',
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
 * Picks the real client when the build carries OAuth client config, and the
 * rejecting stub when it does not — so a build without the config fails with
 * a message that says why, rather than sending a request that cannot succeed.
 */
export function createSpaLoginClient(
  fetchImpl: typeof fetch,
  baseUrl: string,
  client: Partial<WebShooterOAuthClientConfig> | null,
): WebShooterSpaLoginClient {
  if (!client?.clientId || !client.clientSecret) {
    return {
      login: () => Promise.reject(new WebShooterSpaLoginUnconfiguredError()),
    };
  }
  return createWebShooterSpaLoginClient(fetchImpl, baseUrl, {
    clientId: client.clientId,
    clientSecret: client.clientSecret,
  });
}
