// Same-origin calls to the Worker (ADR 0013). The token lives in
// sessionStorage, so it goes when the tab does.
import { PROTOCOL_VERSION } from '@shotledger/shared/src/sync';
import {
  AuthError,
  createAccountApi,
  createHttpSyncTransport,
  type HttpClientConfig,
} from '@shotledger/shared/src/sync-client/http';

import { pullAll, type PulledTables } from './pull';

const TOKEN_KEY = 'shotledger.token';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEY);
    else sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked: the session lasts as long as the page.
  }
}

let memoryToken = readToken();

const config: HttpClientConfig = {
  fetchImpl: (input, init) => fetch(input, init),
  baseUrl: window.location.origin,
  getToken: () => memoryToken,
};

const account = createAccountApi(config);
const transport = createHttpSyncTransport(config);

export function hasSession(): boolean {
  return memoryToken !== null;
}

export type SignInError = 'invalidCredentials' | 'network' | 'unknown';

export async function signIn(email: string, password: string): Promise<SignInError | null> {
  try {
    const session = await account.signIn(email, password);
    memoryToken = session.token;
    writeToken(session.token);
    return null;
  } catch (error: unknown) {
    // Mirrors the app's mapping (features/account/use-account.ts).
    if (error instanceof AuthError) {
      if ([400, 401, 403, 422].includes(error.status)) return 'invalidCredentials';
      return error.status >= 500 ? 'network' : 'unknown';
    }
    return 'network';
  }
}

export async function signOut(): Promise<void> {
  try {
    await account.signOut();
  } catch {
    // The token is dropped either way.
  }
  memoryToken = null;
  writeToken(null);
}

export function loadAccount(onProgress?: (rows: number) => void): Promise<PulledTables> {
  return pullAll(transport, PROTOCOL_VERSION, onProgress);
}
