import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Account } from './account/account';
import { ActivityLog } from './activity-log';
import { currentEmail, hasSession, loadAccount, signOut } from './api';
import { type PulledTables } from './pull';
import { pageFromHash, Shell, type Page } from './shell/shell';
import { SignIn } from './sign-in';
import { Statistics } from './statistics';
import { installTheme } from './theme';

installTheme();

type State =
  | { kind: 'signedOut' }
  | { kind: 'deleted' }
  | { kind: 'loading'; rows: number }
  | { kind: 'failed' }
  | { kind: 'ready'; tables: PulledTables };

export function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(() =>
    hasSession() ? { kind: 'loading', rows: 0 } : { kind: 'signedOut' },
  );
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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

  const signedIn = state.kind !== 'signedOut' && state.kind !== 'deleted';
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void currentEmail()
      .catch(() => null)
      .then((value) => {
        if (current) setEmail(value);
      });
    return () => {
      current = false;
    };
  }, [signedIn]);

  const onSignOut = () => {
    void signOut().then(() => setState({ kind: 'signedOut' }));
  };

  if (state.kind === 'deleted') {
    return (
      <main>
        <section className="sign-in card">
          <h1>{t('account.deletedTitle')}</h1>
          <p className="muted">{t('web.account.deletedBody')}</p>
        </section>
      </main>
    );
  }

  if (state.kind === 'signedOut') {
    return <SignIn onSignedIn={() => setState({ kind: 'loading', rows: 0 })} />;
  }

  return (
    <Shell page={page} email={email} onSignOut={onSignOut}>
      {state.kind === 'loading' && (
        <p className="muted">{t('web.loading', { count: state.rows })}</p>
      )}
      {state.kind === 'failed' && <p className="danger">{t('web.loadFailed')}</p>}
      {state.kind === 'ready' && page === 'statistics' && <Statistics tables={state.tables} />}
      {state.kind === 'ready' && page === 'log' && <ActivityLog tables={state.tables} />}
      {state.kind === 'ready' && page === 'account' && (
        <Account tables={state.tables} onDeleted={() => setState({ kind: 'deleted' })} />
      )}
    </Shell>
  );
}
