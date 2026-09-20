// Settings → Webshooter connect/disconnect (integration spec §A.10, PR #19
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
  WebshooterSpaLoginClientRejectedError,
  WebshooterSpaLoginRejectedError,
  WebshooterSpaLoginUnconfiguredError,
} from '@shotledger/shared/src/integrations/webshooter/api/spaLogin';
import { resolveIdentity } from '@shotledger/shared/src/integrations/webshooter/identity';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { clearWebshooterToken, setWebshooterToken } from '@/platform/secure-store';
import {
  getWebshooterClient,
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

export interface WebshooterConnectionState {
  connected: boolean;
  cardNumber: string | null;
  loading: boolean;
  error: string | null;
  errorDetail: string | null;
  retryIdentity: () => Promise<void>;
  connectWithPassword: (username: string, password: string) => Promise<void>;
  connectWithToken: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

function loadStoredCardNumber(): string | null {
  if (!db) return null;
  return getSetting<string | null>(db, CARD_NUMBER_SETTING_KEY, null);
}

export function useWebshooterConnection(): WebshooterConnectionState {
  const [connected, setConnected] = useState(false);
  const [cardNumber, setCardNumber] = useState<string | null>(() => loadStoredCardNumber());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The status line or exception text behind `error`, shown small under the
  // message — useless to most readers, the whole bug report to the one who
  // has to fix it.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    loadTokenCache().then((token) => {
      if (!canceled) setConnected(token !== null);
    });
    return () => {
      canceled = true;
    };
  }, []);

  /**
   * Resolves the card number with the token already in place.
   *
   * Split out because identity can fail on its own: the token stores fine,
   * the app reports connected, and nothing in the UI could ever fill the
   * card number in afterwards — a dead end only a disconnect could clear.
   * Now it is retryable without re-entering a password.
   */
  const resolveAndStoreIdentity = useCallback(async () => {
    const client = getWebshooterClient();
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
  }, []);

  const retryIdentity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    try {
      await resolveAndStoreIdentity();
    } catch (err) {
      console.error('[webshooter] identity resolution failed', err);
      setError('identityFailed');
      setErrorDetail(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [resolveAndStoreIdentity]);

  const finishConnect = useCallback(
    async (token: string) => {
      await setWebshooterToken(token);
      setTokenCache(token);
      await resolveAndStoreIdentity();
      setConnected(true);
    },
    [resolveAndStoreIdentity],
  );

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
        // Deliberately not inside the same try as the login: once a token
        // has come back, the password worked, and a failure resolving the
        // card number after that is a different problem with a different
        // fix. Folding them together reports a working login as a failed
        // one, which is the most misleading answer available.
        try {
          await finishConnect(result.token);
        } catch (err) {
          // Logged as well as shown: a screen truncates, and this is the
          // branch where the exact text is the finding.
          console.error('[webshooter] identity resolution failed', err);
          setError('identityFailed');
          setErrorDetail(err instanceof Error ? err.message : String(err));
          return;
        }
      } catch (err) {
        // Each failure gets its own message, because each needs a different
        // thing from the reader: retype the password, check the connection,
        // wait, or report that Webshooter changed and this needs updating.
        // A single "login unavailable" for all of them leaves a field
        // failure with nothing to act on.
        if (err instanceof WebshooterSpaLoginRejectedError) {
          setError('loginRejected');
        } else if (err instanceof WebshooterSpaLoginUnconfiguredError) {
          setError(err.failure === 'unreachable' ? 'loginUnreachable' : 'loginNeedsUpdate');
          setErrorDetail(err.detail);
        } else if (err instanceof WebshooterSpaLoginClientRejectedError) {
          // Their server refused our client credentials outright: the same
          // class of problem as a page we can no longer read.
          setError('loginNeedsUpdate');
          setErrorDetail('invalid_client');
        } else {
          // Not a failure we can name. "Check the token" is wrong here —
          // this path has no token — so it gets its own message, and the
          // detail underneath is the only thing that will identify it.
          console.error('[webshooter] login failed', err);
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
    await clearWebshooterToken();
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
    retryIdentity,
    connectWithPassword,
    connectWithToken,
    disconnect,
  };
}
