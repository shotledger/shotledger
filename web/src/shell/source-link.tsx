// AGPL-3.0 §13 (ADR 0017): a hosted web app offers its users the
// Corresponding Source. Every page links to it: the sign-in page, the
// menu pane's foot and, where a narrow screen hides that, the profile menu.
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
