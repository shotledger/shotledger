// The page frame: menu pane on the left with the version at its foot, the
// page title and the profile menu along the top.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { version } from '../../../app/package.json';
import { BrandMark, ChartIcon, PrinterIcon, UserIcon } from './icons';
import { UserMenu } from './user-menu';

export type Page = 'statistics' | 'log' | 'account';

export const pageFromHash = (hash: string): Page =>
  hash === '#account' ? 'account' : hash === '#log' ? 'log' : 'statistics';

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
    { id: 'statistics', label: t('stats.title'), icon: <ChartIcon />, groupStart: false },
    { id: 'log', label: t('web.log.title'), icon: <PrinterIcon />, groupStart: false },
    { id: 'account', label: t('web.account.title'), icon: <UserIcon />, groupStart: true },
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
