// M6 (§4 M6): builds the shooting-log PDF HTML for a chosen period/firearm.
// Data assembly only — the HTML itself is the pure, snapshot-tested
// shared/src/export/pdf-log.ts; this file's job is turning DB rows +
// i18n labels into that function's plain-data input.
import type { TFunction } from 'i18next';
import {
  buildShootingLogHtml,
  sumValueTenths,
  tenthsToScore,
  type PdfLogEntry,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { getFirearm } from '@/db/queries/firearms';
import { listSeriesForSession } from '@/db/queries/series';
import { listSessions } from '@/db/queries/sessions';
import { listScoredShotsForSession } from '@/db/queries/shots';
import { disciplineLabel } from '@/features/session/labels';

export interface PdfExportFilters {
  startedFromIso: string | null;
  startedToIso: string | null;
  firearmId: string | null;
  /**
   * Restricts the log to exactly these sessions. The analytics report
   * passes the ids its own filter matched (session type, discipline,
   * shots per series, tags) — dimensions this date/firearm-shaped filter
   * cannot express. `null` = no restriction.
   */
  sessionIds?: readonly string[] | null;
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/** Builds the shooting-log HTML for the given filters, or `null` with no DB (web preview). */
export function buildShootingLogHtmlForFilters(
  t: TFunction,
  locale: string,
  filters: PdfExportFilters,
): string | null {
  if (!db) return null;

  const allowed = filters.sessionIds ? new Set(filters.sessionIds) : null;
  const sessions = listSessions(db, {
    startedFrom: filters.startedFromIso ?? undefined,
    startedTo: filters.startedToIso ?? undefined,
  })
    .filter((session) => !filters.firearmId || session.firearmId === filters.firearmId)
    .filter((session) => allowed === null || allowed.has(session.id));

  const entries: PdfLogEntry[] = sessions.map((session) => {
    const nonSighterSeries = listSeriesForSession(db, session.id).filter((s) => s.isSighter === 0);
    const totalTenths = sumValueTenths(listScoredShotsForSession(db, session.id));
    return {
      date: formatDate(session.startedAt, locale),
      discipline: disciplineLabel(t, session.disciplineId),
      type: t(`sessionType.${session.type}`),
      seriesCount: nonSighterSeries.length,
      score: tenthsToScore(totalTenths).toFixed(1),
      location: session.location ?? '',
    };
  });

  const firearm = filters.firearmId ? getFirearm(db, filters.firearmId) : null;
  const totalShots = entries.reduce(
    (sum, entry, i) => sum + listScoredShotsForSession(db, sessions[i]!.id).length,
    0,
  );

  return buildShootingLogHtml(
    {
      title: t('compliance.pdfTitle'),
      periodLabel: t('compliance.pdfPeriodLabel', {
        from: filters.startedFromIso ? formatDate(filters.startedFromIso, locale) : t('stats.all'),
        to: filters.startedToIso
          ? formatDate(filters.startedToIso, locale)
          : t('compliance.pdfNow'),
      }),
      firearmLabel: firearm ? `${firearm.make} ${firearm.model}` : null,
      totalSessions: entries.length,
      totalShots,
      generatedAtLabel: t('compliance.pdfGeneratedAt', {
        date: formatDate(new Date().toISOString(), locale),
      }),
      columns: {
        date: t('compliance.pdfColDate'),
        discipline: t('compliance.pdfColDiscipline'),
        type: t('compliance.pdfColType'),
        seriesCount: t('compliance.pdfColSeries'),
        score: t('compliance.pdfColScore'),
        location: t('compliance.pdfColLocation'),
        empty: t('compliance.pdfEmpty'),
      },
    },
    entries,
  );
}
