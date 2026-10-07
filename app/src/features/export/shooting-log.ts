// Session rows + i18n labels to the shooting log's HTML, with no database: the
// phone (use-pdf-export.ts) and the web app both print through it. Relative
// imports only, because the web build has no `@/` alias.
import type { TFunction } from 'i18next';
import { buildShootingLogHtml, formatGroupAndClass, type PdfLogEntry } from '@shotledger/shared';

import { disciplineLabel } from '../session/labels';

export interface ShootingLogSession {
  id: string;
  startedAt: string;
  type: string;
  competitionName: string | null;
  disciplineId: string;
  weaponGroup: string | null;
  shooterClass: string | null;
  location: string | null;
  firearmId: string | null;
}

export interface ShootingLogFirearm {
  make: string;
  model: string;
}

export interface ShootingLogFilters {
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

/**
 * The sessions a log prints, newest first: inside the period (both ends
 * inclusive, compared as ISO strings like the phone's query), then the
 * firearm and id restrictions.
 */
export function logSessions<S extends ShootingLogSession>(
  sessions: readonly S[],
  filters: ShootingLogFilters,
): S[] {
  const { startedFromIso: from, startedToIso: to } = filters;
  const allowed = filters.sessionIds ? new Set(filters.sessionIds) : null;
  return sessions
    .filter((session) => !from || session.startedAt >= from)
    .filter((session) => !to || session.startedAt <= to)
    .filter((session) => !filters.firearmId || session.firearmId === filters.firearmId)
    .filter((session) => allowed === null || allowed.has(session.id))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

export interface ShootingLogInput {
  /** Already selected and ordered by `logSessions`. */
  sessions: readonly ShootingLogSession[];
  filters: ShootingLogFilters;
  /** A live firearm by id, else null. */
  firearm: (id: string) => ShootingLogFirearm | null | undefined;
  /** Every shot fired over `sessions`, sighters and extra rounds included. */
  totalShots: number;
  now: Date;
}

/** Builds the shooting-log HTML for sessions already selected. */
export function shootingLogHtml(t: TFunction, locale: string, input: ShootingLogInput): string {
  const { sessions, filters } = input;

  // Firearm names are resolved once: a six-month log is hundreds of rows and
  // most of them share a handful of firearms.
  const firearmNames = new Map<string, string>();
  function firearmName(firearmId: string | null): string {
    // Never blank. A row with no firearm says so, because dropping it would
    // lose a session that did count towards the requirement (#308).
    if (!firearmId) return t('compliance.pdfNoFirearm');
    const cached = firearmNames.get(firearmId);
    if (cached !== undefined) return cached;
    const firearm = input.firearm(firearmId);
    const name = firearm ? `${firearm.make} ${firearm.model}` : t('compliance.pdfNoFirearm');
    firearmNames.set(firearmId, name);
    return name;
  }

  const entries: PdfLogEntry[] = sessions.map((session) => ({
    date: formatDate(session.startedAt, locale),
    // Never blank, for the same reason the firearm column is not: every row in
    // a real completed log carries a place, and an empty cell in a document
    // offered as evidence reads as a row nobody could vouch for (#350).
    location: session.location?.trim() || t('compliance.pdfNoLocation'),
    // "Skytteaktivitet" on the paper form is a phrase, not a pair of columns.
    // Real completed rows read "Pistol-SM Fält C", "KM Milsnabb",
    // "Tävling precision A", "Träning MSG" — so what identifies a row is the
    // COMPETITION and the weapon group, not the word "competition". The old
    // "Precision · Tävling" threw away both, though the session carries them
    // (verified against a real accepted attachment, 2026-09-20).
    activity: [
      session.competitionName?.trim() || t(`sessionType.${session.type}`),
      disciplineLabel(t, session.disciplineId),
      formatGroupAndClass(session.weaponGroup, session.shooterClass),
    ]
      .filter(Boolean)
      .join(' · '),
    firearm: firearmName(session.firearmId),
  }));

  const firearm = filters.firearmId ? input.firearm(filters.firearmId) : null;

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
      // The paper form asks for a personnummer beside the name. The app stores
      // neither — both are PII it has no reason to hold — so both are printed
      // as the form's own blank line, to be written in by hand (#350).
      personalIdLabel: t('compliance.pdfPersonalIdBlank'),
      firearmLabel: firearm ? `${firearm.make} ${firearm.model}` : null,
      totalsLabel: t('compliance.pdfTotals', { sessions: entries.length, shots: input.totalShots }),
      generatedAtLabel: t('compliance.pdfGeneratedAt', {
        date: formatDate(input.now.toISOString(), locale),
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
