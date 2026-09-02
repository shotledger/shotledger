// WebShooter client wiring (integration spec §A.11): builds the real
// createWebShooterClient against webshooter.se with a live token, or (dev
// builds only, opt-in) the dev-mock transport from ./dev-mock.ts. Device→
// webshooter.se directly — never through any ShotLedger backend (PR #19).
import { createHttpClient } from '@shotledger/shared/src/integrations/webshooter/api/httpClient';
import {
  createWebShooterClient,
  type WebShooterClient,
} from '@shotledger/shared/src/integrations/webshooter/api/client';

import { db } from '@/db/client';
import { getSetting } from '@/db/queries/settings';
import { getWebShooterToken } from '@/platform/secure-store';
import { createDevMockHttpClient } from './dev-mock';

export const WEBSHOOTER_BASE_URL = 'https://webshooter.se/api';

/** __DEV__-only opt-in flag (Settings dev section), never on in production builds. */
export function isDevMockEnabled(): boolean {
  if (!__DEV__ || !db) return false;
  return getSetting<boolean>(db, 'webshooterDevMock', false);
}

let cachedClient: WebShooterClient | null = null;
let cachedClientUsedMock = false;

/**
 * Lazily built, memoized per (mock-mode) session — the underlying client
 * owns its own in-memory TTL cache (§A.11), so re-creating it on every call
 * would defeat that caching. Recreated if the dev-mock flag flips (a dev
 * convenience only) or after disconnect (see resetWebShooterClient below).
 */
export function getWebShooterClient(): WebShooterClient {
  const useMock = isDevMockEnabled();
  if (cachedClient && cachedClientUsedMock === useMock) return cachedClient;

  const httpClient = useMock
    ? createDevMockHttpClient()
    : createHttpClient({
        fetchImpl: fetch,
        baseUrl: WEBSHOOTER_BASE_URL,
        getToken: () => tokenCache,
      });

  cachedClient = createWebShooterClient(httpClient);
  cachedClientUsedMock = useMock;
  return cachedClient;
}

/** Drops the cached client (and its TTL cache) — call after connect/disconnect. */
export function resetWebShooterClient(): void {
  cachedClient = null;
}

// The core httpClient's getToken() is synchronous (spec §2.2) but
// SecureStore is async — this in-memory mirror is populated at app start
// and on every connect/disconnect, never read from SecureStore mid-request.
let tokenCache: string | null = null;

export function setTokenCache(token: string | null): void {
  tokenCache = token;
  resetWebShooterClient();
}

/** Call once at app start (or first WebShooter screen mount) to warm the in-memory token mirror. */
export async function loadTokenCache(): Promise<string | null> {
  tokenCache = await getWebShooterToken();
  return tokenCache;
}
