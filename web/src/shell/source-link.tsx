// AGPL-3.0 §13 (ADR 0017): a hosted web app offers its users the
// Corresponding Source. One link, in the profile menu, reachable from every
// page at every width and out of the way otherwise (maintainer, 2026-10-13).
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { REPO_URL } from '../../../app/src/constants/links';

export function SourceLink({
  className,
  role,
  icon,
  onClick,
}: {
  className?: string;
  role?: 'menuitem';
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <a
      className={className}
      role={role}
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
    >
      {icon}
      {t('web.shell.sourceCode')}
    </a>
  );
}
