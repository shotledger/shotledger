// Webshooter client wiring (integration spec §A.11): builds the real
// createWebshooterClient against webshooter.se with a live token, or (dev
// builds only, opt-in) the dev-mock transport from ./dev-mock.ts. Device→
// webshooter.se directly — never through any ShotLedger backend (PR #19).
import { createHttpClient } from '@shotledger/shared/src/integrations/webshooter/api/httpClient';
import {
  createWebshooterClient,
  type WebshooterClient,
} from '@shotledger/shared/src/integrations/webshooter/api/client';

import { db } from '@/db/client';
import { getSetting } from '@/db/queries/settings';
import { getWebshooterToken } from '@/platform/secure-store';
import { createDevMockHttpClient } from './dev-mock';

// The version segment is part of the API root, not an accident of it.
// Without it webshooter.se serves its SPA's index.html with a 200, so every
// request "succeeded" and then died in schema parsing (verified against the
// live host 2026-09-11: /api/competitions returns HTML, /api/v4.1.9/
// competitions returns JSON). Same root wscli uses.
export const WEBSHOOTER_BASE_URL = 'https://webshooter.se/api/v4.1.9';

/** Site root, where the OAuth client secret is published to anonymous visitors. */
export const WEBSHOOTER_SITE_URL = 'https://webshooter.se/';

/** __DEV__-only opt-in flag (Settings dev section), never on in production builds. */
export function isDevMockEnabled(): boolean {
  if (!__DEV__ || !db) return false;
  return getSetting<boolean>(db, 'webshooterDevMock', false);
}

let cachedClient: WebshooterClient | null = null;
let cachedClientUsedMock = false;

/**
 * Lazily built, memoized per (mock-mode) session — the underlying client
 * owns its own in-memory TTL cache (§A.11), so re-creating it on every call
 * would defeat that caching. Recreated if the dev-mock flag flips (a dev
 * convenience only) or after disconnect (see resetWebshooterClient below).
 */
export function getWebshooterClient(): WebshooterClient {
  const useMock = isDevMockEnabled();
  if (cachedClient && cachedClientUsedMock === useMock) return cachedClient;

  const httpClient = useMock
    ? createDevMockHttpClient()
    : createHttpClient({
        fetchImpl: fetch,
        baseUrl: WEBSHOOTER_BASE_URL,
        getToken: () => tokenCache,
      });

  cachedClient = createWebshooterClient(httpClient);
  cachedClientUsedMock = useMock;
  return cachedClient;
}

/** Drops the cached client (and its TTL cache) — call after connect/disconnect. */
export function resetWebshooterClient(): void {
  cachedClient = null;
}

// The core httpClient's getToken() is synchronous (spec §2.2) but
// SecureStore is async — this in-memory mirror is populated at app start
// and on every connect/disconnect, never read from SecureStore mid-request.
let tokenCache: string | null = null;

export function setTokenCache(token: string | null): void {
  tokenCache = token;
  resetWebshooterClient();
}

/** Call once at app start (or first Webshooter screen mount) to warm the in-memory token mirror. */
export async function loadTokenCache(): Promise<string | null> {
  tokenCache = await getWebshooterToken();
  return tokenCache;
}
