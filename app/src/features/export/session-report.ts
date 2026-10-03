// The Session Report (#499): one session's series, targets and group figures
// as a PDF for the share sheet. Data assembly only — the HTML is the pure,
// tested shared/src/export/session-report.ts.
import type { TFunction } from 'i18next';
import {
  analyzeGroup,
  buildSessionReportHtml,
  getDiscipline,
  getTargetFace,
  tenthsToScore,
  type SessionReportSeries,
} from '@shotledger/shared';

import { formatShotValue } from '@/components/shot-chips';
import { db } from '@/db/client';
import { listMarksForSeries } from '@/db/queries/shot-marks';
import { formatSessionDate } from '@/features/home/format-session-date';
import { disciplineLabel } from '@/features/session/labels';
import { loadSessionDetail } from '@/features/session/use-session-detail';

/** The report HTML for a session, or `null` with no DB or no such session. */
export function buildSessionReportHtmlFor(
  t: TFunction,
  language: string,
  sessionId: string,
): string | null {
  if (!db) return null;
  const detail = loadSessionDetail(sessionId);
  const { session } = detail;
  if (!session) return null;

  const target = getTargetFace(getDiscipline(session.disciplineId)?.targetFace ?? '') ?? null;
  const mm = (value: number) => t('photoScoring.millimeters', { value: value.toFixed(1) });

  // Main series first, then the final, each in position order — as the
  // session view lists them.
  const rows = [
    ...detail.seriesRows.filter((row) => !row.isFinal),
    ...detail.seriesRows.filter((row) => row.isFinal),
  ];
  const series: SessionReportSeries[] = rows.map((row) => {
    const marks = listMarksForSeries(db!, row.id);
    const group =
      marks.length >= 2 ? analyzeGroup(marks.map((m) => ({ xMm: m.xMm, yMm: m.yMm }))) : null;
    return {
      title: t('session.seriesTitle', { position: row.position }),
      tags: [
        ...(row.isSighter ? [t('session.sighter')] : []),
        ...(row.isFinal ? [t('session.final')] : []),
      ],
      total: String(tenthsToScore(row.totalTenths)),
      values: row.shots.map((shot) => formatShotValue(shot, detail.scoringMode)),
      marks: marks.map((m) => ({ xMm: m.xMm, yMm: m.yMm, caliberMm: m.caliberMm })),
      figures: group
        ? [
            { label: t('photoScoring.windage'), value: mm(group.windageMm) },
            { label: t('photoScoring.elevation'), value: mm(group.elevationMm) },
            { label: t('photoScoring.meanRadius'), value: mm(group.meanRadiusMm) },
            { label: t('photoScoring.maxSpread'), value: mm(group.extremeSpreadMm) },
          ]
        : [],
    };
  });

  return buildSessionReportHtml(
    {
      title: session.name,
      fields: [
        { label: t('session.date'), value: formatSessionDate(session.startedAt, language) },
        { label: t('session.discipline'), value: disciplineLabel(t, session.disciplineId) },
        {
          label: t('session.firearm'),
          value: detail.firearmName ?? t('compliance.pdfNoFirearm'),
        },
        { label: t('session.total'), value: String(tenthsToScore(detail.results.totalTenths)) },
        { label: t('session.innerTenCount'), value: String(detail.innerTenCount) },
      ],
      generatedAtLabel: t('compliance.pdfGeneratedAt', {
        date: formatSessionDate(new Date().toISOString(), language),
      }),
      emptyLabel: t('session.noSeries'),
    },
    target,
    series,
  );
}
