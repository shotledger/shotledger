// M6 (§4 M6): builds the shooting-log PDF HTML for a chosen period/firearm.
// Data assembly only — the HTML itself is the pure, snapshot-tested
// shared/src/export/pdf-log.ts; this file's job is turning DB rows +
// i18n labels into that function's plain-data input.
import type { TFunction } from 'i18next';
import { buildShootingLogHtml, type PdfLogEntry } from '@shotledger/shared';

import { db } from '@/db/client';
import { getFirearm } from '@/db/queries/firearms';
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

  // Firearm names are resolved once: a six-month log is hundreds of rows and
  // most of them share a handful of firearms.
  const firearmNames = new Map<string, string>();
  function firearmName(firearmId: string | null): string {
    // Never blank. A row with no firearm says so, because dropping it would
    // lose a session that did count towards the requirement (#308).
    if (!firearmId) return t('compliance.pdfNoFirearm');
    const cached = firearmNames.get(firearmId);
    if (cached !== undefined) return cached;
    const firearm = getFirearm(db!, firearmId);
    const name = firearm ? `${firearm.make} ${firearm.model}` : t('compliance.pdfNoFirearm');
    firearmNames.set(firearmId, name);
    return name;
  }

  const entries: PdfLogEntry[] = sessions.map((session) => ({
    date: formatDate(session.startedAt, locale),
    location: session.location ?? '',
    // "Skytteaktivitet" on the paper form is a phrase, not a pair of columns:
    // real entries read "Träning MSG", "KM Milsnabb", "P3".
    activity: `${disciplineLabel(t, session.disciplineId)} · ${t(`sessionType.${session.type}`)}`,
    firearm: firearmName(session.firearmId),
  }));

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
      // The app stores no shooter name — it is PII it has no reason to hold —
      // so the export carries the paper form's blank line instead, to be
      // written in by hand like the signature column.
      shooterLabel: t('compliance.pdfShooterBlank'),
      firearmLabel: firearm ? `${firearm.make} ${firearm.model}` : null,
      totalsLabel: t('compliance.pdfTotals', { sessions: entries.length, shots: totalShots }),
      generatedAtLabel: t('compliance.pdfGeneratedAt', {
        date: formatDate(new Date().toISOString(), locale),
      }),
      attestationNote: t('compliance.pdfAttestationNote'),
      columns: {
        date: t('compliance.pdfColDate'),
        location: t('compliance.pdfColLocation'),
        activity: t('compliance.pdfColActivity'),
        firearm: t('compliance.pdfColFirearm'),
        attestedBy: t('compliance.pdfColAttestedBy'),
        empty: t('compliance.pdfEmpty'),
      },
    },
    entries,
  );
}
