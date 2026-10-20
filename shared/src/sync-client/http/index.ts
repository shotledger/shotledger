/**
 * HTTP adapters for the sync client (docs/specs/sync-app-spec.md §1).
 *
 * These are I/O, not decisions — they live under `sync-client/http/` rather
 * than beside the pure modules precisely so the coverage/mutation gauntlet
 * (which globs `sync-client/*.ts`, non-recursively) does not claim to have
 * proven a `fetch` wrapper. They live in `shared/` rather than `app/` only
 * so the end-to-end integration suite can drive the *real* client code
 * against the real Worker.
 *
 * `fetch` is a web standard present in React Native, Node and workerd alike;
 * it is still injected so tests never touch a global.
 */
import type { PullRequest, PullResponse, PushRequest, PushResponse } from '../../sync/protocol';
import { PullResponseSchema, PushResponseSchema } from '../../sync/protocol';
import type { SyncErrorKey } from '../backoff';
import type { SyncTransport } from '../ports';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientConfig {
  fetchImpl: FetchLike;
  /** No trailing slash. */
  baseUrl: string;
  /** Bearer session token, or null when signed out. */
  getToken: () => string | null;
}

/** Carries the HTTP status so the controller can classify the failure. */
export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    readonly errorKey: SyncErrorKey,
    message: string,
  ) {
    super(message);
    this.name = 'SyncHttpError';
  }
}

function errorKeyForStatus(status: number): SyncErrorKey {
  if (status === 401 || status === 403) return 'unauthenticated';
  if (status === 409) return 'versionUnsupported';
  if (status === 413) return 'payloadTooLarge';
  if (status >= 500 || status === 408 || status === 429) return 'network';
  return 'unknown';
}

async function postJson(config: HttpClientConfig, path: string, body: unknown): Promise<unknown> {
  const token = config.getToken();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;

  const response = await config.fetchImpl(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new SyncHttpError(
      response.status,
      errorKeyForStatus(response.status),
      `${path} failed: ${response.status} ${text.slice(0, 200)}`,
    );
  }
  return response.json();
}

export function createHttpSyncTransport(config: HttpClientConfig): SyncTransport {
  return {
    async pull(request: PullRequest): Promise<PullResponse> {
      return PullResponseSchema.parse(await postJson(config, '/sync/pull', request));
    },
    async push(request: PushRequest): Promise<PushResponse> {
      return PushResponseSchema.parse(await postJson(config, '/sync/push', request));
    },
  };
}

// ---------------------------------------------------------------------------
// Account (better-auth email + password; no social provider is configured on
// the backend, so none is offered here — spec §1).
// ---------------------------------------------------------------------------

export interface AccountSession {
  token: string;
  userId: string;
  email: string;
}

/** One signed-in session on the account. */
export interface AccountDevice {
  /** The session token (unsigned): what `revokeDevice` takes. */
  token: string;
  createdAt: string;
  /** Last time better-auth refreshed the session, roughly "last seen". */
  updatedAt: string;
  expiresAt: string;
  userAgent: string | null;
  /** The session making this request. */
  isCurrent: boolean;
}

/** One registered passkey, as the account page lists it. */
export interface AccountPasskey {
  id: string;
  name: string | null;
  createdAt: string | null;
  /** The authenticator model; all zeros when the platform keeps it private. */
  aaguid: string | null;
}

/**
 * A passkey ceremony's options (WebAuthn's JSON form, passed through to the
 * platform untouched) and the challenge handle its verify call must send
 * back (`x-passkey-challenge`, backend/src/lib/cookies.ts).
 */
export interface PasskeyCeremony {
  options: Record<string, unknown>;
  challenge: string;
}

const PASSKEY_CHALLENGE_HEADER = 'x-passkey-challenge';

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

async function authRequest(
  config: Pick<HttpClientConfig, 'fetchImpl' | 'baseUrl'>,
  path: string,
  body: unknown,
  token?: string | null,
  extraHeaders: Record<string, string> = {},
): Promise<{ response: Response; json: unknown }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // better-auth requires an Origin it trusts; on a device there is no
    // browser origin, so we send the API's own.
    origin: config.baseUrl,
    ...extraHeaders,
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await config.fetchImpl(`${config.baseUrl}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new AuthError(response.status, text.slice(0, 300));
  }
  return { response, json: text.length > 0 ? (JSON.parse(text) as unknown) : null };
}

async function passkeyCeremony(
  config: HttpClientConfig,
  path: string,
  token: string | null,
): Promise<PasskeyCeremony> {
  const { response, json } = await authRequest(config, path, undefined, token);
  const challenge = response.headers.get(PASSKEY_CHALLENGE_HEADER);
  if (!challenge || typeof json !== 'object' || json === null) {
    throw new AuthError(response.status, 'passkey options carried no challenge');
  }
  return { options: json as Record<string, unknown>, challenge };
}

function sessionFrom(response: Response, json: unknown): AccountSession {
  // The bearer plugin returns the session token in a response header, not a
  // cookie — a mobile client has no cookie jar worth trusting.
  const token = response.headers.get('set-auth-token');
  const user = (json as { user?: { id?: string; email?: string } } | null)?.user;
  if (!token || !user?.id) {
    throw new AuthError(response.status, 'auth response carried no session token');
  }
  return { token, userId: user.id, email: user.email ?? '' };
}

export function createAccountApi(config: HttpClientConfig) {
  return {
    async signUp(email: string, password: string, name: string): Promise<AccountSession> {
      const { response, json } = await authRequest(config, '/sign-up/email', {
        email,
        password,
        name,
      });
      return sessionFrom(response, json);
    },

    /**
     * `remember: false` is a browser tab's sign-in: the server ends it after
     * a fixed few hours instead of keeping it alive with use.
     */
    async signIn(
      email: string,
      password: string,
      options: { remember?: boolean } = {},
    ): Promise<AccountSession> {
      const body =
        options.remember === false ? { email, password, rememberMe: false } : { email, password };
      const { response, json } = await authRequest(config, '/sign-in/email', body);
      return sessionFrom(response, json);
    },

    /** Options for adding a passkey to the signed-in account. */
    passkeyRegistrationOptions(): Promise<PasskeyCeremony> {
      return passkeyCeremony(config, '/passkey/generate-register-options', config.getToken());
    },

    /** Stores the platform's new credential on the account. */
    async addPasskey(ceremony: PasskeyCeremony, response: unknown, name: string): Promise<void> {
      await authRequest(
        config,
        '/passkey/verify-registration',
        { response, name },
        config.getToken(),
        {
          [PASSKEY_CHALLENGE_HEADER]: ceremony.challenge,
        },
      );
    },

    /** Options for signing in with any passkey; no account is named. */
    passkeySignInOptions(): Promise<PasskeyCeremony> {
      return passkeyCeremony(config, '/passkey/generate-authenticate-options', null);
    },

    /** `remember: false` as for `signIn`; it goes in the query (backend asksNotToBeRemembered). */
    async signInWithPasskey(
      ceremony: PasskeyCeremony,
      response: unknown,
      options: { remember?: boolean } = {},
    ): Promise<AccountSession> {
      const query = options.remember === false ? '?rememberMe=false' : '';
      const result = await authRequest(
        config,
        `/passkey/verify-authentication${query}`,
        { response },
        null,
        { [PASSKEY_CHALLENGE_HEADER]: ceremony.challenge },
      );
      return sessionFrom(result.response, result.json);
    },

    async listPasskeys(): Promise<AccountPasskey[]> {
      const { json } = await authRequest(
        config,
        '/passkey/list-user-passkeys',
        undefined,
        config.getToken(),
      );
      return (json as Partial<AccountPasskey>[]).map((row) => ({
        id: row.id ?? '',
        name: row.name ?? null,
        createdAt: row.createdAt ?? null,
        aaguid: row.aaguid ?? null,
      }));
    },

    async removePasskey(id: string): Promise<void> {
      await authRequest(config, '/passkey/delete-passkey', { id }, config.getToken());
    },

    async signOut(): Promise<void> {
      await authRequest(config, '/sign-out', {}, config.getToken());
    },

    /**
     * `null` when the stored token is no longer a valid session. A server
     * that cannot answer (5xx, 408, 429) throws a `network` SyncHttpError
     * instead: that is not a sign-out.
     */
    async currentUser(): Promise<{ userId: string; email: string } | null> {
      const token = config.getToken();
      if (token === null) return null;
      const response = await config.fetchImpl(`${config.baseUrl}/api/auth/get-session`, {
        headers: { authorization: `Bearer ${token}`, origin: config.baseUrl },
      });
      if (!response.ok) {
        const errorKey = errorKeyForStatus(response.status);
        if (errorKey === 'network') {
          throw new SyncHttpError(response.status, errorKey, `get-session: ${response.status}`);
        }
        return null;
      }
      const json = (await response.json()) as { user?: { id?: string; email?: string } } | null;
      if (!json?.user?.id) return null;
      return { userId: json.user.id, email: json.user.email ?? '' };
    },

    /**
     * The account's signed-in sessions, one per device or browser. better-auth
     * answers 403 once the caller's own session is over a day old (its
     * `freshAge`), so this suits a fresh sign-in, not a long-lived phone token.
     */
    async listDevices(): Promise<AccountDevice[]> {
      const token = config.getToken();
      const response = await config.fetchImpl(`${config.baseUrl}/api/auth/list-sessions`, {
        headers: { authorization: `Bearer ${token ?? ''}`, origin: config.baseUrl },
      });
      const text = await response.text();
      if (!response.ok) throw new AuthError(response.status, text.slice(0, 300));
      // The bearer token is the session token plus its signature.
      const current = token?.split('.')[0];
      const rows = JSON.parse(text) as {
        token: string;
        createdAt: string;
        updatedAt: string;
        expiresAt: string;
        userAgent?: string | null;
      }[];
      return rows.map((row) => ({
        token: row.token,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt,
        userAgent: row.userAgent ?? null,
        isCurrent: row.token === current,
      }));
    },

    /** Signs another device out; its next request answers 401. */
    async revokeDevice(sessionToken: string): Promise<void> {
      await authRequest(config, '/revoke-session', { token: sessionToken }, config.getToken());
    },

    /** GDPR delete. `dryRun` returns the counts without deleting anything. */
    async deleteAccount(dryRun = false): Promise<Record<string, number>> {
      const json = await postJson(config, '/account/delete', { dryRun });
      return (json as { deleted?: Record<string, number> }).deleted ?? {};
    },
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;

// ---------------------------------------------------------------------------
// Photos (R2 through the Worker).
// ---------------------------------------------------------------------------

export interface PhotoUsage {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
}

export class PhotoHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PhotoHttpError';
  }
}

export function createPhotoApi(config: HttpClientConfig) {
  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = config.getToken();
    return token === null ? extra : { ...extra, authorization: `Bearer ${token}` };
  }

  return {
    async upload(photoId: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
      const response = await config.fetchImpl(`${config.baseUrl}/photos/upload/${photoId}`, {
        method: 'POST',
        headers: authHeaders({
          'content-type': contentType,
          // The Worker rejects the request before reading the body when this
          // is missing or over the cap — sending it is not optional.
          'content-length': String(bytes.byteLength),
        }),
        body: bytes,
      });
      if (!response.ok) {
        throw new PhotoHttpError(response.status, await response.text().catch(() => ''));
      }
    },

    async download(photoId: string): Promise<ArrayBuffer> {
      const response = await config.fetchImpl(`${config.baseUrl}/photos/${photoId}`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new PhotoHttpError(response.status, await response.text().catch(() => ''));
      }
      return response.arrayBuffer();
    },

    async remove(photoId: string): Promise<void> {
      const response = await config.fetchImpl(`${config.baseUrl}/photos/${photoId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      // 404 means it is already gone, which is the state the caller wanted.
      if (!response.ok && response.status !== 404) {
        throw new PhotoHttpError(response.status, await response.text().catch(() => ''));
      }
    },

    async usage(): Promise<PhotoUsage> {
      const response = await config.fetchImpl(`${config.baseUrl}/photos/usage`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new PhotoHttpError(response.status, await response.text().catch(() => ''));
      }
      return (await response.json()) as PhotoUsage;
    },
  };
}

export type PhotoApi = ReturnType<typeof createPhotoApi>;

/**
 * Maps any thrown value to the status key the Account & sync screen shows.
 *
 * Anything that is not one of our own HTTP errors never got a status back, so
 * the request did not reach the server — that is a connectivity problem, not
 * an unknown one. (`instanceof TypeError` is not enough: React Native's fetch
 * rejection did not match it on device, and the screen said "something went
 * wrong" for a plain DNS failure.)
 */
export function classifySyncError(error: unknown): SyncErrorKey {
  if (error instanceof SyncHttpError) return error.errorKey;
  if (error instanceof AuthError) return error.status === 401 ? 'unauthenticated' : 'unknown';
  return 'network';
}
