import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { signIn, type SignInError } from './api';
import { SourceLink } from './shell/source-link';

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    void signIn(email, password).then((failure) => {
      setBusy(false);
      setError(failure);
      if (failure === null) onSignedIn();
    });
  };

  return (
    <main>
      <form className="sign-in card" onSubmit={onSubmit}>
        <h1>ShotLedger</h1>
        <p className="muted">{t('web.signInIntro')}</p>
        <input
          type="email"
          autoComplete="username"
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
        {error && <p className="danger">{t(`account.error.${error}`)}</p>}
        <button type="submit" disabled={busy}>
          {t('account.signIn')}
        </button>
      </form>
      <p className="sign-in-source muted">
        <SourceLink />
      </p>
    </main>
  );
}
