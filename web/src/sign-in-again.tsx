// The inline sign-in a writing page shows when its session has expired.
// Whoever signs in, App decides what happens to the loaded logbook (R22).
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { signInAgain, type SignInError } from './api';

export function SignInAgain({ onSignedIn }: { onSignedIn: (userId: string) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<SignInError | null>(null);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void signInAgain(email, password).then((result) => {
      if ('error' in result) setError(result.error);
      else onSignedIn(result.userId);
    });
  };
  return (
    <form className="inline-sign-in" onSubmit={onSubmit}>
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
      <button type="submit" className="secondary">
        {t('account.signIn')}
      </button>
      {error && <p className="danger">{t(`account.error.${error}`)}</p>}
    </form>
  );
}
