// The page frame: menu pane on the left with the version at its foot, the
// page title and the profile menu along the top.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { version } from '../../../app/package.json';
import {
  BrandMark,
  ChartIcon,
  KeyboardIcon,
  ListChecksIcon,
  ListIcon,
  SlidersIcon,
  UserIcon,
} from './icons';
import type { Page } from './route';
import { UserMenu } from './user-menu';

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
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          ShotLedger
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
          <h1>{pages.find(({ id }) => id === page)?.label}</h1>
          <UserMenu email={email} onSignOut={onSignOut} />
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
