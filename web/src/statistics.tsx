import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { PulledTables } from './pull';
import { statsInputs } from './stats-inputs';

/** Placeholder until the report lands on top of this layer. */
export function Statistics({ tables }: { tables: PulledTables }) {
  const { t } = useTranslation();
  const inputs = useMemo(() => statsInputs(tables), [tables]);
  return (
    <section className="card">
      <p>{t('stats.matchCount', { count: inputs.sessions.length })}</p>
    </section>
  );
}
