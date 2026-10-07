// Same-origin calls to the Worker (ADR 0013). The token lives in
// sessionStorage, so it goes when the tab does.
import { PROTOCOL_VERSION, type ClientChange } from '@shotledger/shared/src/sync';
import { pushChanges, type PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import {
  AuthError,
  createAccountApi,
  createHttpSyncTransport,
  createPhotoApi,
  type AccountDevice,
  type PhotoUsage,
  type HttpClientConfig,
} from '@shotledger/shared/src/sync-client/http';

import { createFetchPhoto } from './photo-fetch';
import { pullAll, type PulledTables, type WebTable } from './pull';

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
const photos = createPhotoApi(config);

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

/** Only the given tables, from cursor 0. */
export function loadTables(only: readonly WebTable[]): Promise<PulledTables> {
  return pullAll(transport, PROTOCOL_VERSION, undefined, only);
}

/** One request, never retried here (ADR 0019); Retry is the user's. */
export function pushEntry(changes: readonly ClientChange[]): Promise<PushOutcome> {
  return pushChanges(transport, PROTOCOL_VERSION, changes);
}

export async function currentEmail(): Promise<string | null> {
  return (await account.currentUser())?.email ?? null;
}

export function listDevices(): Promise<AccountDevice[]> {
  return account.listDevices();
}

export function revokeDevice(sessionToken: string): Promise<void> {
  return account.revokeDevice(sessionToken);
}

export function photoUsage(): Promise<PhotoUsage> {
  return photos.usage();
}

export function downloadPhoto(photoId: string): Promise<ArrayBuffer> {
  return photos.download(photoId);
}

/** A photo for display: typed, and abortable when nothing shows it any more. */
export const fetchPhoto = createFetchPhoto(config.fetchImpl, config.baseUrl, config.getToken);

/** Counts per kind of server data. Once deleted, the session is gone too. */
export async function deleteAccount(dryRun: boolean): Promise<Record<string, number>> {
  const counts = await account.deleteAccount(dryRun);
  if (!dryRun) {
    memoryToken = null;
    writeToken(null);
  }
  return counts;
}
