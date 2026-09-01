// Settings → WebShooter connect/disconnect (integration spec §A.10, PR #19
// auth refinement). Primary: in-app password login, POSTed device→
// webshooter.se directly via createUnverifiedSpaLoginClient — VERIFY-stubbed
// in shared/src/integrations/webshooter/api/spaLogin.ts pending the real
// endpoint shape, so this always surfaces the "not yet available" message
// and falls back to manual token paste. Neither path ever calls a
// ShotLedger backend.
import { useCallback, useEffect, useState } from 'react';
import {
  createUnverifiedSpaLoginClient,
  WebShooterSpaLoginNotVerifiedError,
} from '@shotledger/shared/src/integrations/webshooter/api/spaLogin';
import { resolveIdentity } from '@shotledger/shared/src/integrations/webshooter/identity';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { clearWebShooterToken, setWebShooterToken } from '@/platform/secure-store';
import { getWebShooterClient, loadTokenCache, setTokenCache, WEBSHOOTER_BASE_URL } from './client';

const CARD_NUMBER_SETTING_KEY = 'webshooterCardNumber';

export interface WebShooterConnectionState {
  connected: boolean;
  cardNumber: string | null;
  loading: boolean;
  error: string | null;
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

  const connectWithPassword = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const loginClient = createUnverifiedSpaLoginClient(fetch, WEBSHOOTER_BASE_URL);
      const result = await loginClient.login({ username, password });
      await finishConnect(result.token);
    } catch (err) {
      if (err instanceof WebShooterSpaLoginNotVerifiedError) {
        setError('spaLoginNotVerified');
      } else {
        setError('connectFailed');
      }
    } finally {
      setLoading(false);
    }
  }, [finishConnect]);

  const connectWithToken = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      await finishConnect(token.trim());
    } catch {
      setError('connectFailed');
    } finally {
      setLoading(false);
    }
  }, [finishConnect]);

  const disconnect = useCallback(async () => {
    await clearWebShooterToken();
    setTokenCache(null);
    if (db) setSetting<string | null>(db, CARD_NUMBER_SETTING_KEY, null);
    setCardNumber(null);
    setConnected(false);
  }, []);

  return { connected, cardNumber, loading, error, connectWithPassword, connectWithToken, disconnect };
}
