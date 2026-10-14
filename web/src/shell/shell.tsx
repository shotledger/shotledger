// The page frame: menu pane on the left with the version at its foot, the
// page title and the profile menu along the top.
//
// One h1 per page, and it names what the page shows (#822, finding "Repeated
// labels and double titles"): the menu entry's label by default, or what a
// page puts there with `PageTitle` — a session's name on its detail, where
// the h1 used to stay "Sessions" with the name as an h2 under it.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { version } from '../../../app/package.json';
import {
  ChartIcon,
  KeyboardIcon,
  ListChecksIcon,
  ListIcon,
  SlidersIcon,
  UserIcon,
  Wordmark,
} from './icons';
import type { Page } from './route';
import { UserMenu } from './user-menu';
import './shell.css';

const PageTitleContext = createContext<(title: string | null) => void>(() => undefined);

/** Names the page in the shell's h1 while it is shown. Draws nothing. */
export function PageTitle({ title }: { title: string }) {
  const setTitle = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
  return null;
}

export function Shell({
  page,
  email,
  onSignOut,
  children,
}: {
  page: Page;
  email: string | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const main = useRef<HTMLElement>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const pages = [
    { id: 'sessions', label: t('sessions.title'), icon: <ListIcon />, groupStart: false },
    { id: 'statistics', label: t('stats.title'), icon: <ChartIcon />, groupStart: false },
    { id: 'entry', label: t('web.entry.title'), icon: <KeyboardIcon />, groupStart: false },
    { id: 'bulk', label: t('web.bulk.title'), icon: <ListChecksIcon />, groupStart: false },
    { id: 'settings', label: t('settings.title'), icon: <SlidersIcon />, groupStart: true },
    { id: 'account', label: t('web.account.title'), icon: <UserIcon />, groupStart: false },
  ] as const;

  return (
    <div className="shell">
      {/* The hash is the route, so the link moves the focus instead of the address. */}
      <a
        className="skip-link"
        href="#content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        {t('web.shell.skipToContent')}
      </a>
      <aside className="sidebar" aria-label={t('web.shell.sidebar')}>
        <div className="brand">
          <Wordmark />
        </div>
        <nav aria-label={t('web.shell.menu')}>
          <ul>
            {pages.map(({ id, label, icon, groupStart }) => (
              <li key={id} className={groupStart ? 'group-start' : undefined}>
                <a href={`#${id}`} aria-current={page === id ? 'page' : undefined}>
                  {icon}
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="version">
          <span className="sr-only">{t('web.shell.version')} </span>
          {version}
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <h1>{pageTitle ?? pages.find(({ id }) => id === page)?.label}</h1>
          <UserMenu email={email} onSignOut={onSignOut} />
        </header>
        <main id="content" ref={main} tabIndex={-1}>
          <PageTitleContext.Provider value={setPageTitle}>{children}</PageTitleContext.Provider>
        </main>
      </div>
    </div>
  );
}
