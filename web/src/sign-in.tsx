import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { signIn, signInWithPasskey, type SignInError } from './api';
import type { PasskeyError } from './passkey-error';

type Failure = { kind: 'password'; error: SignInError } | { kind: 'passkey'; error: PasskeyError };

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const passkeys = browserSupportsWebAuthn();

  const afterPasskey = (failure: PasskeyError | null) => {
    setBusy(false);
    if (failure === null) onSignedIn();
    // Closing the browser's prompt is a choice, not a failure.
    else if (failure !== 'cancelled') setError({ kind: 'passkey', error: failure });
  };

  // A saved passkey offered among the email field's suggestions, where the
  // browser can (conditional UI); the button below covers the rest.
  useEffect(() => {
    let current = true;
    void browserSupportsWebAuthnAutofill().then((autofill) => {
      if (!autofill || !current) return;
      void signInWithPasskey(true).then((failure) => current && afterPasskey(failure));
    });
    return () => {
      current = false;
      WebAuthnAbortService.cancelCeremony();
    };
    // Once per visit to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    void signIn(email, password).then((failure) => {
      setBusy(false);
      setError(failure && { kind: 'password', error: failure });
      if (failure === null) onSignedIn();
    });
  };

  const onPasskey = () => {
    setBusy(true);
    setError(null);
    void signInWithPasskey().then(afterPasskey);
  };

  return (
    <main>
      <form className="sign-in card" onSubmit={onSubmit}>
        <h1>ShotLedger</h1>
        <p className="muted">{t('web.signInIntro')}</p>
        <input
          type="email"
          autoComplete="username webauthn"
          placeholder={t('account.emailPlaceholder')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder={t('account.passwordPlaceholder')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error?.kind === 'password' && (
          <p className="danger">{t(`account.error.${error.error}`)}</p>
        )}
        {error?.kind === 'passkey' && (
          <p className="danger">{t(`web.passkey.error.${error.error}`)}</p>
        )}
        <button type="submit" disabled={busy}>
          {t('account.signIn')}
        </button>
        {passkeys && (
          <button type="button" className="secondary" disabled={busy} onClick={onPasskey}>
            {t('web.passkey.signIn')}
          </button>
        )}
      </form>
    </main>
  );
}
