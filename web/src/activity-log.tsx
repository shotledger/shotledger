// The föreningsintyg shooting log: the phone's export, printed through the
// browser's own dialog. The HTML is the phone's, byte for byte, so it is shown
// in an iframe where none of this page's styles reach it.
import { periodRange } from '@shotledger/shared/src/analytics-rows';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logSessions, shootingLogHtml } from '../../app/src/features/export/shooting-log';
import { logInputs } from './log-inputs';
import type { PulledTables } from './pull';

export function ActivityLog({ tables }: { tables: PulledTables }) {
  const { t, i18n } = useTranslation();
  const inputs = useMemo(() => logInputs(tables), [tables]);
  const [customFrom, setFrom] = useState<string | null>(null);
  const [customTo, setTo] = useState<string | null>(null);
  const sheet = useRef<HTMLIFrameElement>(null);

  const { sessions, html } = useMemo(() => {
    const range = periodRange({ period: 'custom', customFrom, customTo });
    const filters = { startedFromIso: range.fromIso, startedToIso: range.toIso, firearmId: null };
    const selected = logSessions(inputs.sessions, filters);
    return {
      sessions: selected,
      html: shootingLogHtml(t, i18n.language, {
        sessions: selected,
        filters,
        firearm: (id) => inputs.firearms.get(id),
        totalShots: selected.reduce((sum, { id }) => sum + (inputs.volumes.get(id) ?? 0), 0),
        now: new Date(),
      }),
    };
  }, [inputs, customFrom, customTo, t, i18n.language]);

  // The sheet grows to its content, so the page scrolls rather than the frame.
  // The html box's own height: scrollHeight never drops below the frame's.
  const fit = () => {
    const frame = sheet.current;
    const root = frame?.contentDocument?.documentElement;
    if (frame && root) frame.style.height = `${Math.ceil(root.getBoundingClientRect().height)}px`;
  };
  const print = () => sheet.current?.contentWindow?.print();

  // Ctrl+P prints the frame too: Chrome does not page an iframe printed as
  // part of its parent, so a long log would come out clipped.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        sheet.current?.contentWindow?.print();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="log-layout">
      <aside className="filters card log-controls">
        <section>
          <h2>{t('web.log.period')}</h2>
          <div className="dates">
            <label>
              {t('period.from')}
              <input
                type="date"
                value={customFrom ?? ''}
                onChange={(event) => setFrom(event.target.value || null)}
              />
            </label>
            <label>
              {t('period.to')}
              <input
                type="date"
                value={customTo ?? ''}
                onChange={(event) => setTo(event.target.value || null)}
              />
            </label>
          </div>
        </section>
        <button type="button" onClick={print}>
          {t('web.log.print')}
        </button>
      </aside>
      <div>
        <p className="match-count">{t('stats.matchCount', { count: sessions.length })}</p>
        <iframe
          ref={sheet}
          className="log-sheet"
          title={t('compliance.pdfTitle')}
          srcDoc={html}
          onLoad={fit}
        />
      </div>
    </div>
  );
}
