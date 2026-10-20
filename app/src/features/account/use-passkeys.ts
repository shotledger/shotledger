// The Passkeys card on Account & Sync (#681): list, add and remove the
// account's passkeys, as the web's account page does (web/src/account/account.tsx).
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AccountPasskey } from '@shotledger/shared';

import { getAccountApi } from '@/features/sync/client';
import { passkeyErrorKey, type PasskeyErrorKey } from '@/features/account/passkey-error';
import { createPasskey, passkeysSupported } from '@/platform/passkey';

export type PasskeysError = PasskeyErrorKey | 'removeFailed' | 'listFailed';

export interface PasskeysState {
  supported: boolean;
  /** null until the first list arrives. */
  passkeys: AccountPasskey[] | null;
  /** True while adding or removing one. */
  busy: boolean;
  error: PasskeysError | null;
  add: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function usePasskeys(signedIn: boolean): PasskeysState {
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<AccountPasskey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PasskeysError | null>(null);
  const [supported] = useState(passkeysSupported);

  const reload = useCallback(async () => {
    try {
      setPasskeys(await getAccountApi().listPasskeys());
    } catch {
      setError('listFailed');
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let canceled = false;
    void (async () => {
      const list = await getAccountApi()
        .listPasskeys()
        .catch(() => null);
      if (canceled) return;
      if (list === null) setError('listFailed');
      else setPasskeys(list);
    })();
    return () => {
      canceled = true;
    };
  }, [signedIn]);

  const add = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const api = getAccountApi();
      const ceremony = await api.passkeyRegistrationOptions();
      const response = await createPasskey(ceremony.options);
      // The name the list shows; the web names its passkeys after the browser.
      const os = Platform.OS === 'ios' ? 'iOS' : 'Android';
      await api.addPasskey(ceremony, response, t('account.passkey.appName', { os }));
    } catch (err) {
      const key = passkeyErrorKey(err, 'add');
      // Closing the OS prompt is a choice, not a failure.
      if (key !== 'cancelled') setError(key);
    } finally {
      setBusy(false);
      await reload();
    }
  }, [reload, t]);

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        await getAccountApi().removePasskey(id);
      } catch {
        setError('removeFailed');
      } finally {
        setBusy(false);
        await reload();
      }
    },
    [reload],
  );

  // Signed out, the last account's list and error no longer apply.
  return {
    supported,
    passkeys: signedIn ? passkeys : null,
    busy,
    error: signedIn ? error : null,
    add,
    remove,
  };
}
