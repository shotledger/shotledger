// Share cards: turns DB rows + i18n labels into the pure
// card-model input, mirroring the session/local split in
// app/src/features/export/session-report.ts. Never reads session.location or
// any shooter-identity field (AGENTS.md rule 7) — only discipline, weapon
// group/class, firearm and scores.
import type { TFunction } from 'i18next';
import { formatGroupAndClass, tenthsToScore } from '@shotledger/shared';

import { db } from '@/db/client';
import { getFirearm } from '@/db/queries/firearms';
import {
  buildSessionShareCard,
  buildSeriesShareCard,
  type SeriesShareCardModel,
  type SessionShareCardModel,
} from '@/features/share/card-model';
import { formatShotValue } from '@/components/shot-chips';
import { formatDate } from '@/features/dates/format';
import { formatTotalScore } from '@/features/stats/format-total-score';
import { disciplineLabel } from '@/features/session/labels';
import { type SessionDetail, type SeriesRow } from '@/features/session/use-session-detail';

const APP_NAME = 'ShotLedger';

function xCountOf(shots: readonly { isInnerTen: boolean }[]): number {
  return shots.filter((shot) => shot.isInnerTen).length;
}

/** Builds the session card model, or `null` for an unknown session. */
export function buildSessionShareCardModel(
  t: TFunction,
  locale: string,
  detail: SessionDetail,
  note: string,
): SessionShareCardModel | null {
  if (!detail.session) return null;
  const session = detail.session;
  const firearm = session.firearmId ? getFirearm(db, session.firearmId) : null;

  return buildSessionShareCard({
    appName: APP_NAME,
    dateLabel: formatDate(session.startedAt, locale),
    disciplineLabel: disciplineLabel(t, session.disciplineId),
    weaponLabel: formatGroupAndClass(session.weaponGroup, session.shooterClass) || null,
    firearmLabel: firearm ? `${firearm.make} ${firearm.model}` : null,
    totalLabel: formatTotalScore(detail.results.totalTenths, { mode: detail.scoringMode }),
    averageLabel:
      detail.seriesAverageTenths === null
        ? null
        : tenthsToScore(detail.seriesAverageTenths).toFixed(1),
    xCount: detail.innerTenCount,
    series: detail.seriesRows.map((row) => ({
      position: row.position,
      isSighter: row.isSighter,
      totalLabel: formatTotalScore(row.totalTenths, { mode: detail.scoringMode }),
      xCount: row.isTotalOverride ? 0 : xCountOf(row.shots),
    })),
    note,
  });
}

/** Builds a single series' card model, or `null` when the series has no shots to show. */
export function buildSeriesShareCardModel(
  t: TFunction,
  locale: string,
  detail: SessionDetail,
  row: SeriesRow,
  note: string,
): SeriesShareCardModel | null {
  if (!detail.session) return null;
  return buildSeriesShareCard({
    appName: APP_NAME,
    dateLabel: formatDate(detail.session.startedAt, locale),
    disciplineLabel: disciplineLabel(t, detail.session.disciplineId),
    seriesLabel: t('session.seriesTitle', { position: row.position }),
    totalLabel: formatTotalScore(row.totalTenths, { mode: detail.scoringMode }),
    xCount: row.isTotalOverride ? 0 : xCountOf(row.shots),
    shots: row.shots.map((shot) => ({
      label: formatShotValue(shot, detail.scoringMode),
      isX: shot.isInnerTen,
    })),
    note,
  });
}
