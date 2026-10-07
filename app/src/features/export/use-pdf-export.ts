// M6 (§4 M6): builds the shooting-log PDF HTML for a chosen period/firearm.
// Data assembly only — the rows come from the database here, and
// shooting-log.ts turns them into shared/src/export/pdf-log.ts's input.
import type { TFunction } from 'i18next';

import { db } from '@/db/client';
import { getFirearm } from '@/db/queries/firearms';
import { listSessions } from '@/db/queries/sessions';
import { totalVolumeRoundsFor } from '@/db/queries/volume';
import { logSessions, shootingLogHtml, type ShootingLogFilters } from './shooting-log';

export type PdfExportFilters = ShootingLogFilters;

/** Builds the shooting-log HTML for the given filters. */
export function buildShootingLogHtmlForFilters(
  t: TFunction,
  locale: string,
  filters: PdfExportFilters,
): string {
  const sessions = logSessions(
    listSessions(db, {
      startedFrom: filters.startedFromIso ?? undefined,
      startedTo: filters.startedToIso ?? undefined,
    }),
    filters,
  );

  return shootingLogHtml(t, locale, {
    sessions,
    filters,
    firearm: (id) => getFirearm(db, id),
    // Every shot fired, sighters and extra rounds included (#512): the same
    // figure as Shots Logged, over the printed sessions.
    totalShots: totalVolumeRoundsFor(
      db,
      sessions.map((session) => session.id),
    ),
    now: new Date(),
  });
}
