// The Session Report (#499): one session's series, targets and group figures
// as a PDF for the share sheet. Data assembly only — the HTML is the pure,
// tested shared/src/export/session-report.ts.
import type { TFunction } from 'i18next';
import {
  analyzeGroup,
  buildSessionReportHtml,
  getTargetFace,
  seriesTargetFace,
  tenthsToScore,
  type SessionReportField,
  type SessionReportMark,
  type SessionReportPlot,
  type SessionReportSeries,
  type TargetFaceDefinition,
} from '@shotledger/shared';

import { formatShotValue } from '@/components/shot-chips';
import { db } from '@/db/client';
import { listMarksForSeries } from '@/db/queries/shot-marks';
import { formatSessionDate } from '@/features/home/format-session-date';
import { disciplineLabel } from '@/features/session/labels';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { loadSessionStats } from '@/features/session/use-session-stats';

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

  const mm = (value: number) => t('photoScoring.millimeters', { value: value.toFixed(1) });
  const groupFigures = (marks: readonly SessionReportMark[]): SessionReportField[] => {
    if (marks.length < 2) return [];
    const group = analyzeGroup(marks.map((m) => ({ xMm: m.xMm, yMm: m.yMm })));
    if (!group) return [];
    return [
      { label: t('photoScoring.windage'), value: mm(group.windageMm) },
      { label: t('photoScoring.elevation'), value: mm(group.elevationMm) },
      { label: t('photoScoring.meanRadius'), value: mm(group.meanRadiusMm) },
      { label: t('photoScoring.maxSpread'), value: mm(group.extremeSpreadMm) },
    ];
  };
  // Scoring marks pooled per face for the summary; a sighter scores nothing.
  const pooled = new Map<
    string,
    {
      target: TargetFaceDefinition;
      marks: SessionReportMark[];
      stages: Set<string | null>;
      marked: number;
    }
  >();
  const scoringPerFace = new Map<string, number>();

  // Main series first, then the final, each in position order — as the
  // session view lists them.
  const rows = [
    ...detail.seriesRows.filter((row) => !row.isFinal),
    ...detail.seriesRows.filter((row) => row.isFinal),
  ];
  const series: SessionReportSeries[] = rows.map((row) => {
    const faceId = seriesTargetFace(session.disciplineId, session.programId, row.position);
    const target = (faceId && getTargetFace(faceId)) || null;
    const marks: SessionReportMark[] = listMarksForSeries(db!, row.id).map((m) => ({
      xMm: m.xMm,
      yMm: m.yMm,
      caliberMm: m.caliberMm,
    }));
    if (faceId && !row.isSighter) scoringPerFace.set(faceId, (scoringPerFace.get(faceId) ?? 0) + 1);
    if (target && faceId && marks.length > 0 && !row.isSighter) {
      const entry = pooled.get(faceId) ?? { target, marks: [], stages: new Set(), marked: 0 };
      entry.marks.push(...marks);
      entry.stages.add(row.stage);
      entry.marked += 1;
      pooled.set(faceId, entry);
    }
    return {
      title: t('session.seriesTitle', { position: row.position }),
      tags: [
        ...(row.isSighter ? [t('session.sighter')] : []),
        ...(row.isFinal ? [t('session.final')] : []),
      ],
      total: String(tenthsToScore(row.totalTenths)),
      values: row.shots.map((shot) => formatShotValue(shot, detail.scoringMode)),
      marks,
      figures: groupFigures(marks),
      target,
    };
  });

  // One plot per face; a helmatch delmoment is named.
  // When only some series have a photo, the caption says how many it covers.
  const plots: SessionReportPlot[] = [...pooled.entries()].map(([faceId, entry]) => {
    const [stage] = entry.stages;
    const scoring = scoringPerFace.get(faceId) ?? entry.marked;
    const coverage =
      entry.marked === scoring
        ? t('session.reportAllSeries')
        : t('session.reportMarkedSeries', { marked: entry.marked, total: scoring });
    const caption =
      pooled.size > 1 && entry.stages.size === 1 && stage
        ? `${t(`stage.${session.programId}.${stage}`)} · ${coverage}`
        : coverage;
    return {
      caption,
      target: entry.target,
      marks: entry.marks,
      figures: groupFigures(entry.marks),
      heatmapCaption: `${caption} · ${t('photoScoring.heatmapMode')}`,
    };
  });

  const { results } = detail;
  const stats = loadSessionStats(sessionId);
  // Highest value first, as a score sheet reads; X counts under 10 (DistributionBucket).
  const distribution =
    stats.shotCount > 0
      ? {
          heading: t('stats.distributionTitleWithCount', { count: stats.shotCount }),
          buckets: [...stats.distribution]
            .sort((a, b) => b.value - a.value)
            .map((bucket) => ({ label: String(bucket.value), value: String(bucket.count) })),
        }
      : null;
  const resultFields: SessionReportField[] = [
    ...detail.stageSubtotals.map((subtotal) => ({
      label: t(`stage.${session.programId}.${subtotal.stage}`),
      value: String(tenthsToScore(subtotal.totalTenths)),
    })),
    ...(results.hasFinal
      ? [
          {
            label: t('session.beforeFinal'),
            value: String(tenthsToScore(results.beforeFinalTenths)),
          },
          { label: t('session.final'), value: String(tenthsToScore(results.finalTenths)) },
        ]
      : []),
    { label: t('session.total'), value: String(tenthsToScore(results.totalTenths)) },
    {
      label: t('session.seriesAverage'),
      value:
        detail.seriesAverageTenths === null
          ? '\u2013'
          : tenthsToScore(detail.seriesAverageTenths).toFixed(1),
    },
    { label: t('session.innerTenCount'), value: String(detail.innerTenCount) },
    {
      label: t('session.innerTenAverage'),
      value: detail.innerTenAverage === null ? '\u2013' : detail.innerTenAverage.toFixed(1),
    },
  ];

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
      ],
      summaryHeading: t('session.reportSummary'),
      results: resultFields,
      plots,
      distribution,
      generatedAtLabel: t('compliance.pdfGeneratedAt', {
        date: formatSessionDate(new Date().toISOString(), language),
      }),
      emptyLabel: t('session.noSeries'),
    },
    series,
  );
}
