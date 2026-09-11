// Settings → WebShooter connect/disconnect (integration spec §A.10, PR #19
// auth refinement). Primary: in-app password login, POSTed device→
// webshooter.se directly — a Laravel Passport password grant, confirmed
// 2026-09-11. Neither path ever calls a ShotLedger backend.
//
// The OAuth client secret is read from webshooter.se at login time — it is
// published there to every anonymous visitor — so nothing secret is shipped
// or stored, and a rotation on their side heals itself. The env fallback
// only covers the case where that page cannot be read.
import { useCallback, useEffect, useState } from 'react';
import {
  createSpaLoginClient,
  WebShooterSpaLoginClientRejectedError,
  WebShooterSpaLoginRejectedError,
  WebShooterSpaLoginUnconfiguredError,
} from '@shotledger/shared/src/integrations/webshooter/api/spaLogin';
import { resolveIdentity } from '@shotledger/shared/src/integrations/webshooter/identity';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { clearWebShooterToken, setWebShooterToken } from '@/platform/secure-store';
import {
  getWebShooterClient,
  loadTokenCache,
  setTokenCache,
  WEBSHOOTER_BASE_URL,
  WEBSHOOTER_SITE_URL,
} from './client';

const CARD_NUMBER_SETTING_KEY = 'webshooterCardNumber';

/**
 * Fallback only, for a build made against a changed webshooter.se. Normally
 * both are undefined and discovery supplies the secret.
 */
const OAUTH_CLIENT_FALLBACK = {
  clientId: process.env.EXPO_PUBLIC_WEBSHOOTER_CLIENT_ID,
  clientSecret: process.env.EXPO_PUBLIC_WEBSHOOTER_CLIENT_SECRET,
};

export interface WebShooterConnectionState {
  connected: boolean;
  cardNumber: string | null;
  loading: boolean;
  error: string | null;
  errorDetail: string | null;
  connectWithPassword: (username: string, password: string) => Promise<void>;
  connectWithToken: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

function loadStoredCardNumber(): string | null {
  if (!db) return null;
  return getSetting<string | null>(db, CARD_NUMBER_SETTING_KEY, null);
}

export function useWebShooterConnection(): WebShooterConnectionState {
  const [connected, setConnected] = useState(false);
  const [cardNumber, setCardNumber] = useState<string | null>(() => loadStoredCardNumber());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The status line or exception text behind `error`, shown small under the
  // message — useless to most readers, the whole bug report to the one who
  // has to fix it.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTokenCache().then((token) => {
      if (!cancelled) setConnected(token !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const finishConnect = useCallback(async (token: string) => {
    await setWebShooterToken(token);
    setTokenCache(token);
    const client = getWebShooterClient();
    const resolved = await resolveIdentity({
      override: null,
      stored: loadStoredCardNumber(),
      fetchAuthenticatedUser: async () => {
        const user = await client.authenticateUser();
        return { shooting_card_number: user.shooting_card_number };
      },
    });
    if (db) setSetting<string>(db, CARD_NUMBER_SETTING_KEY, resolved);
    setCardNumber(resolved);
    setConnected(true);
  }, []);

  const connectWithPassword = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      setError(null);
      setErrorDetail(null);
      try {
        const loginClient = createSpaLoginClient(fetch, {
          baseUrl: WEBSHOOTER_BASE_URL,
          siteUrl: WEBSHOOTER_SITE_URL,
          fallback: OAUTH_CLIENT_FALLBACK,
        });
        const result = await loginClient.login({ username, password });
        await finishConnect(result.token);
      } catch (err) {
        // Each failure gets its own message, because each needs a different
        // thing from the reader: retype the password, check the connection,
        // wait, or report that WebShooter changed and this needs updating.
        // A single "login unavailable" for all of them leaves a field
        // failure with nothing to act on.
        if (err instanceof WebShooterSpaLoginRejectedError) {
          setError('loginRejected');
        } else if (err instanceof WebShooterSpaLoginUnconfiguredError) {
          setError(err.failure === 'unreachable' ? 'loginUnreachable' : 'loginNeedsUpdate');
          setErrorDetail(err.detail);
        } else if (err instanceof WebShooterSpaLoginClientRejectedError) {
          // Their server refused our client credentials outright: the same
          // class of problem as a page we can no longer read.
          setError('loginNeedsUpdate');
          setErrorDetail('invalid_client');
        } else {
          // Not a failure we can name. "Check the token" is wrong here —
          // this path has no token — so it gets its own message, and the
          // detail underneath is the only thing that will identify it.
          setError('loginFailed');
          setErrorDetail(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [finishConnect],
  );

  const connectWithToken = useCallback(
    async (token: string) => {
      setLoading(true);
      setError(null);
      setErrorDetail(null);
      try {
        await finishConnect(token.trim());
      } catch {
        setError('connectFailed');
      } finally {
        setLoading(false);
      }
    },
    [finishConnect],
  );

  const disconnect = useCallback(async () => {
    await clearWebShooterToken();
    setTokenCache(null);
    if (db) setSetting<string | null>(db, CARD_NUMBER_SETTING_KEY, null);
    setCardNumber(null);
    setConnected(false);
  }, []);

  return {
    connected,
    cardNumber,
    loading,
    error,
    errorDetail,
    connectWithPassword,
    connectWithToken,
    disconnect,
  };
}
