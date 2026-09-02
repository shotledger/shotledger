// Settings -> Account & sync (docs/specs/sync-app-spec.md §1). Email +
// password only: the backend's better-auth config enables emailAndPassword
// and the bearer plugin and configures no social provider, so there is no
// Google/Apple button to render that could work.
import { AuthError } from '@shotledger/shared';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/db/client';
import { resetSyncState } from '@/db/queries/sync-store';
import { clearSessionToken, setSessionToken } from '@/platform/secure-store';
import { getAccountApi, loadSessionTokenCache, setSessionTokenCache } from '@/features/sync/client';
import {
  refreshPendingCount,
  requestSync,
  resetSyncController,
} from '@/features/sync/sync-controller';

export type AccountErrorKey =
  'invalidCredentials' | 'emailInUse' | 'weakPassword' | 'network' | 'unknown';

export interface AccountState {
  loading: boolean;
  signedIn: boolean;
  email: string | null;
  error: AccountErrorKey | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
}

/** better-auth answers 401/422 with a JSON body; the status is the reliable part. */
function errorKeyFor(error: unknown, intent: 'signIn' | 'signUp'): AccountErrorKey {
  if (error instanceof AuthError) {
    if (error.status === 401 || error.status === 403) return 'invalidCredentials';
    if (error.status === 422 || error.status === 400) {
      return intent === 'signUp' ? 'emailInUse' : 'invalidCredentials';
    }
    if (error.status >= 500) return 'network';
    return 'unknown';
  }
  // No AuthError means no HTTP status came back at all — the request never
  // reached the server. See classifySyncError for why `instanceof TypeError`
  // is not a reliable test for that on React Native.
  return 'network';
}

export function useAccount(): AccountState {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<AccountErrorKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await loadSessionTokenCache();
      if (token === null) {
        if (!cancelled) setLoading(false);
        return;
      }
      // A stored token can have been revoked (sign-out elsewhere, account
      // deleted); verify before claiming the user is signed in.
      const user = await getAccountApi()
        .currentUser()
        .catch(() => null);
      if (cancelled) return;
      if (user === null) {
        setSessionTokenCache(null);
        await clearSessionToken();
      } else {
        setSignedIn(true);
        setEmail(user.email);
      }
      setLoading(false);
      void refreshPendingCount();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishSignIn = useCallback(async (token: string, userEmail: string) => {
    await setSessionToken(token);
    setSessionTokenCache(token);
    setSignedIn(true);
    setEmail(userEmail);
    void requestSync();
  }, []);

  const signUp = useCallback(
    async (address: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const session = await getAccountApi().signUp(address.trim(), password, address.trim());
        await finishSignIn(session.token, session.email);
      } catch (err) {
        setError(errorKeyFor(err, 'signUp'));
      } finally {
        setLoading(false);
      }
    },
    [finishSignIn],
  );

  const signIn = useCallback(
    async (address: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const session = await getAccountApi().signIn(address.trim(), password);
        await finishSignIn(session.token, session.email);
      } catch (err) {
        setError(errorKeyFor(err, 'signIn'));
      } finally {
        setLoading(false);
      }
    },
    [finishSignIn],
  );

  const forgetSession = useCallback(async () => {
    setSessionTokenCache(null);
    await clearSessionToken();
    // Cursors and queued changes belong to the account that produced them.
    // The logbook itself is untouched — the app stays fully usable offline.
    if (db) resetSyncState(db);
    resetSyncController();
    setSignedIn(false);
    setEmail(null);
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await getAccountApi()
        .signOut()
        .catch(() => undefined); // a dead session is already signed out
      await forgetSession();
    } finally {
      setLoading(false);
    }
  }, [forgetSession]);

  const deleteAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await getAccountApi().deleteAccount(false);
      await forgetSession();
      return true;
    } catch (err) {
      setError(errorKeyFor(err, 'signIn'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [forgetSession]);

  return { loading, signedIn, email, error, signUp, signIn, signOut, deleteAccount };
}
