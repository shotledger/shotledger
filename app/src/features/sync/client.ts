// Wiring: the shared HTTP adapters bound to this app's base URL and the
// SecureStore-backed session token (docs/specs/sync-app-spec.md §7).
// The token mirror is in memory because the shared client's getToken() is
// synchronous while SecureStore is not — same pattern as the WebShooter
// client's tokenCache.
import {
  createAccountApi,
  createHttpSyncTransport,
  createPhotoApi,
  type AccountApi,
  type PhotoApi,
  type SyncTransport,
} from '@shotledger/shared';

import { apiBaseUrl } from '@/constants/backend';
import { getSessionToken } from '@/platform/secure-store';

let tokenCache: string | null = null;

export function setSessionTokenCache(token: string | null): void {
  tokenCache = token;
}

export function getSessionTokenCache(): string | null {
  return tokenCache;
}

/** Warms the in-memory mirror at app start / first Account screen mount. */
export async function loadSessionTokenCache(): Promise<string | null> {
  tokenCache = await getSessionToken();
  return tokenCache;
}

function config() {
  return {
    fetchImpl: fetch,
    baseUrl: apiBaseUrl(),
    getToken: () => tokenCache,
  };
}

export function getSyncTransport(): SyncTransport {
  return createHttpSyncTransport(config());
}

export function getAccountApi(): AccountApi {
  return createAccountApi(config());
}

export function getPhotoApi(): PhotoApi {
  return createPhotoApi(config());
}
