import {
  DEFAULT_ANALYTICS_FILTER,
  type AnalyticsFilterState,
} from '@shotledger/shared/src/analytics-rows';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Account } from './account/account';
import { currentAccount, hasSession, loadAccount, signOut } from './api';
import { BulkEdit } from './bulk/bulk';
import { SessionEdit, type Done } from './edit/edit';
import { Entry } from './entry/entry';
import { Firearms } from './firearms/firearms';
import { LicenseCheck } from './license-check';
import { type PulledAccount } from './pull';
import { afterReauth, type LoadedAccount, type ReauthOutcome } from './reauth';
import { replacementHash, routeFromHash, type Route } from './shell/route';
import { Shell } from './shell/shell';
import { NO_PICKS, picksOf, withPicks, type Picks } from './sessions/picks';
import { Sessions } from './sessions/sessions';
import { Settings } from './settings/settings';
import { SignIn } from './sign-in';
import { Statistics } from './statistics';
import { installTheme } from './theme';

installTheme();

type State =
  | { kind: 'signedOut' }
  | { kind: 'deleted' }
  | { kind: 'loading'; rows: number }
  | { kind: 'failed' }
  | { kind: 'ready'; tables: PulledAccount };

export function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(() =>
    hasSession() ? { kind: 'loading', rows: 0 } : { kind: 'signedOut' },
  );
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  // An address no page answers is shown as Statistics, so the bar says #statistics.
  useEffect(() => {
    const fix = () => {
      const replacement = replacementHash(window.location.hash);
      if (replacement !== null) window.history.replaceState(null, '', replacement);
    };
    fix();
    window.addEventListener('hashchange', fix);
    return () => window.removeEventListener('hashchange', fix);
  }, []);
  const { page } = route;
  // What an edit or delete said, for the page it went to; gone once the user moves on.
  const [notice, setNotice] = useState<Done | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedAccount>({ userId: null, generation: 0 });
  // The Statistics filters stay while you move between pages (statistics.md);
  // signing out or in as another account starts them afresh.
  const [statsFilter, setStatsFilter] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTER);

  useEffect(() => {
    const onHashChange = () => {
      const { hash } = window.location;
      setRoute(routeFromHash(hash));
      setNotice((was) => (was?.hash === hash ? was : null));
      window.scrollTo(0, 0);
    };
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
  const { generation } = loaded;
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void currentAccount()
      .catch(() => null)
      .then((user) => {
        if (!current) return;
        setEmail(user?.email ?? null);
        if (user) setLoaded((was) => ({ ...was, userId: user.userId }));
      });
    return () => {
      current = false;
    };
  }, [signedIn, generation]);

  // The inline sign-in on a writing page (R22): another account reloads the
  // logbook and remounts the pages, so nothing of the old one stays on screen.
  const onReauthenticated = (userId: string): ReauthOutcome => {
    const { outcome, next } = afterReauth(loaded, userId);
    if (outcome === 'switched') {
      setStatsFilter(DEFAULT_ANALYTICS_FILTER);
      setLoaded(next);
      setEmail(null);
      setState({ kind: 'loading', rows: 0 });
    }
    return outcome;
  };

  // Kept across pages; tied to the loaded tables, so another account starts empty.
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const tables = state.kind === 'ready' ? state.tables : null;
  const onPicked = useCallback(
    (ids: readonly string[]) => {
      if (tables) setPicks(withPicks(tables, ids));
    },
    [tables],
  );

  // After a save: pull again in place, so the page stays and every page
  // shows server truth (spec §3.5).
  const refresh = () =>
    loadAccount().then(
      (fresh) => {
        setState({ kind: 'ready', tables: fresh });
        // The same account's tables, pulled again: the photo picks carry over.
        setPicks((was) => (was.owner === tables ? withPicks(fresh, was.ids) : was));
        return true;
      },
      () => false,
    );

  const onDone = (done: Done) => {
    setNotice(done);
    window.location.hash = done.hash;
  };

  const onSignOut = () => {
    setPicks(NO_PICKS);
    setStatsFilter(DEFAULT_ANALYTICS_FILTER);
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
      {state.kind === 'ready' && page === 'sessions' && route.edit && route.sessionId && (
        <SessionEdit
          key={`${generation}:${route.sessionId}`}
          tables={state.tables}
          sessionId={route.sessionId}
          refresh={refresh}
          onReauthenticated={onReauthenticated}
          onDone={onDone}
        />
      )}
      {state.kind === 'ready' && page === 'sessions' && !route.edit && (
        <Sessions
          key={generation}
          tables={state.tables}
          sessionId={route.sessionId}
          compare={route.compare}
          picked={picksOf(picks, state.tables)}
          onPicked={onPicked}
          writer={{ refresh, onReauthenticated, onDone }}
          notice={notice?.hash === window.location.hash ? notice.lines : []}
        />
      )}
      {state.kind === 'ready' && page === 'statistics' && route.check && (
        <LicenseCheck key={generation} tables={state.tables} view={route.check} />
      )}
      {state.kind === 'ready' && page === 'statistics' && !route.check && (
        <Statistics
          key={generation}
          tables={state.tables}
          filter={statsFilter}
          onFilterChange={setStatsFilter}
        />
      )}
      {state.kind === 'ready' && page === 'firearms' && (
        <Firearms key={generation} tables={state.tables} firearmId={route.firearmId} />
      )}
      {state.kind === 'ready' && page === 'entry' && (
        <Entry
          key={generation}
          tables={state.tables}
          refresh={refresh}
          onReauthenticated={onReauthenticated}
        />
      )}
      {state.kind === 'ready' && page === 'settings' && (
        <Settings
          key={generation}
          tables={state.tables}
          refresh={refresh}
          onReauthenticated={onReauthenticated}
        />
      )}
      {state.kind === 'ready' && page === 'bulk' && (
        <BulkEdit
          key={generation}
          tables={state.tables}
          refresh={refresh}
          onReauthenticated={onReauthenticated}
        />
      )}
      {state.kind === 'ready' && page === 'account' && (
        <Account
          key={generation}
          tables={state.tables}
          onDeleted={() => {
            setPicks(NO_PICKS);
            setStatsFilter(DEFAULT_ANALYTICS_FILTER);
            setState({ kind: 'deleted' });
          }}
        />
      )}
    </Shell>
  );
}
