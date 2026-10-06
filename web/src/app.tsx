import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { hasSession, loadAccount, signOut } from './api';
import { type PulledTables } from './pull';
import { SignIn } from './sign-in';
import { Statistics } from './statistics';
import { installTheme } from './theme';

installTheme();

type State =
  | { kind: 'signedOut' }
  | { kind: 'loading'; rows: number }
  | { kind: 'failed' }
  | { kind: 'ready'; tables: PulledTables };

export function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(() =>
    hasSession() ? { kind: 'loading', rows: 0 } : { kind: 'signedOut' },
  );

  const loading = state.kind === 'loading';
  useEffect(() => {
    if (!loading) return;
    let current = true;
    loadAccount((rows) => {
      if (current) setState({ kind: 'loading', rows });
    })
      .then((tables) => {
        if (current) setState({ kind: 'ready', tables });
      })
      .catch(() => {
        if (current) setState({ kind: 'failed' });
      });
    return () => {
      current = false;
    };
  }, [loading]);

  const onSignOut = () => {
    void signOut().then(() => setState({ kind: 'signedOut' }));
  };

  if (state.kind === 'signedOut') {
    return <SignIn onSignedIn={() => setState({ kind: 'loading', rows: 0 })} />;
  }

  return (
    <main>
      <header>
        <h1>{t('stats.title')}</h1>
        <button className="secondary" onClick={onSignOut}>
          {t('account.signOut')}
        </button>
      </header>
      {state.kind === 'loading' && (
        <p className="muted">{t('web.loading', { count: state.rows })}</p>
      )}
      {state.kind === 'failed' && <p className="danger">{t('web.loadFailed')}</p>}
      {state.kind === 'ready' && <Statistics tables={state.tables} />}
    </main>
  );
}
