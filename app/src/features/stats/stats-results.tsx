// The Statistics results (#822, direction A "Instrument"): what the tab opens
// on, for the filter above it. Results lead: one headline number with its
// trend against the previous equal period and its chart, then the detail
// (per shot, shot SD, X), where the shots land, and the counts Home used to
// carry. Below that, everything the old generated report held, so no number
// was lost when the Generate Report step went: records, totals, fält,
// training vs competition, sighter vs result, the two other charts, the
// pooled shot plot and the JSON export.
import { useRouter } from 'expo-router';
import { useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type ScrollView } from 'react-native';
import { tenthsToScore } from '@shotledger/shared';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChartCaption } from '@/components/chart-kit/axis';
import { DistributionBarChart } from '@/components/distribution-bar-chart';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { ShotHeatmap } from '@/components/shot-heatmap';
import { Stat } from '@/components/stat';
import { ThemedText } from '@/components/themed-text';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { CHART_LINE_COLORS, groupByDiscipline } from '@/components/time-series-chart-math';
import { ZoomableView } from '@/components/zoomable-view';
import { useDateFormat } from '@/features/dates/use-date-format';
import { localDayOf } from '@/features/dates/local-day';
import { useReportExport } from '@/features/export/use-report-export';
import { disciplineLabel } from '@/features/session/labels';
import { formatTotalScore } from '@/features/stats/format-total-score';
import { ReportSectionIndex } from '@/features/stats/report-section-index';
import {
  MIN_INDEXED_SECTIONS,
  reportSections,
  type ReportSectionKey,
} from '@/features/stats/report-sections';
import { SessionTypeComparisonCard } from '@/features/stats/session-type-comparison-card';
import { SighterRelationCard } from '@/features/stats/sighter-relation-card';
import { trendLine } from '@/features/stats/stats-filters';
import { useCrossSessionGroup } from '@/features/stats/use-cross-session-group';
import {
  periodRange,
  statsHeadline,
  type AnalyticsFilterState,
  type AnalyticsReportData,
  type NamedRecord,
} from '@/features/stats/use-stats-data';
import { useResolvedThemeName } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

const DASH = '–';

function score(tenths: number | null): string {
  return tenths === null ? DASH : tenthsToScore(tenths).toFixed(1);
}

function percent(share: number | null): string {
  return share === null ? DASH : `${(share * 100).toFixed(0)}%`;
}

export function StatsResults({
  filter,
  data,
  previous,
  scrollRef,
  contentRef,
}: {
  filter: AnalyticsFilterState;
  data: AnalyticsReportData;
  previous: AnalyticsReportData | null;
  scrollRef: RefObject<ScrollView | null>;
  contentRef: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const { exportJson, statusText } = useReportExport(t);
  const themeName = useResolvedThemeName();

  // One ref per section, measured on tap rather than cached from onLayout: on
  // web onLayout fires only on a resize, so a section pushed down by a card
  // above it kept a stale top.
  const shotsRef = useRef<View>(null);
  const recordsRef = useRef<View>(null);
  const totalsRef = useRef<View>(null);
  const faltRef = useRef<View>(null);
  const typeComparisonRef = useRef<View>(null);
  const sighterRef = useRef<View>(null);
  const chartsRef = useRef<View>(null);
  const exportRef = useRef<View>(null);
  const jumpTo = (key: ReportSectionKey) => {
    const section = {
      shots: shotsRef,
      records: recordsRef,
      totals: totalsRef,
      falt: faltRef,
      typeComparison: typeComparisonRef,
      sighter: sighterRef,
      charts: chartsRef,
      export: exportRef,
    }[key].current;
    const content = contentRef.current;
    if (!section || !content) return;
    section.measureLayout(content, (_x, y) => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - Spacing.three), animated: true });
    });
  };

  const formatDate = dates.date;
  const formatShortDate = dates.axis;
  const range = periodRange(filter);
  // Cross-session group: every photo-scored mark in the period, pooled.
  const crossSession = useCrossSessionGroup(
    range.fromIso ? localDayOf(range.fromIso) : null,
    range.toIso ? localDayOf(range.toIso) : null,
    filter.disciplineId,
  );

  // One line per discipline: a precision session (max 350) and a milsnabb
  // session (max 600) on one axis produce a saw-tooth that says nothing about
  // either (#349). Values go to the chart in points, as its ticks print them.
  const ringChart = (pick: (point: AnalyticsReportData['points'][number]) => number | null) =>
    groupByDiscipline(
      data.points,
      (point) => {
        const tenths = pick(point as AnalyticsReportData['points'][number]);
        return tenths === null ? null : tenthsToScore(tenths);
      },
      (disciplineId) => disciplineLabel(t, disciplineId),
      CHART_LINE_COLORS[themeName],
    );
  const faltChart = () =>
    data.falt
      ? groupByDiscipline(
          data.falt.points,
          (point) => point.hitsPerStation,
          (disciplineId) => disciplineLabel(t, disciplineId),
          CHART_LINE_COLORS[themeName],
        )
      : null;
  const chartBody = (grouped: ReturnType<typeof groupByDiscipline>, testID?: string) => (
    <TimeSeriesChart
      testID={testID}
      lines={grouped.lines}
      formatDate={formatShortDate}
      emptyLabel={t('stats.trendEmpty')}
      omittedLabel={
        grouped.omittedCount === 0
          ? null
          : t('stats.chartDisciplinesOmitted', { count: grouped.omittedCount })
      }
    />
  );

  const headline = statsHeadline(data, previous);
  const trend = trendLine(t, filter, data, previous);
  const faltLeads = headline?.kind === 'hitRate';

  const sections = reportSections({
    hasCrossSession: crossSession !== null,
    hasMatches: data.hasMatches,
    showRingCards: data.showRingCards,
    hasFalt: Boolean(data.falt),
    hasTypeComparison: data.typeComparison.length > 0,
    hasSighterRelation: data.sighterRelation.length > 0,
  });

  const recordRow = (label: string, record: NamedRecord | null, value: string) =>
    record === null ? (
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.recordNone', { label })}
      </ThemedText>
    ) : (
      <DrillDownRow
        title={label}
        subtitle={`${record.sessionName} · ${formatDate(record.startedAt)}`}
        value={value}
        onPress={() => router.push({ pathname: '/session/[id]', params: { id: record.sessionId } })}
      />
    );

  const totals = data.totals;
  const crossSessionCard = crossSession && (
    <Card testID="cross-session-group" ref={shotsRef}>
      <ThemedText type="smallBold">{t('stats.crossSessionTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.crossSessionSubtitle', {
          shots: crossSession.analysis.shotCount,
          sessions: crossSession.sessionCount,
          discipline: disciplineLabel(t, crossSession.disciplineId),
        })}
      </ThemedText>

      <ZoomableView
        contentWidth={300}
        contentHeight={300}
        style={styles.heatmapCanvas}
        testID="cross-session-heatmap"
      >
        {(box) => (
          <ShotHeatmap target={crossSession.target} shots={crossSession.marks} size={box.width} />
        )}
      </ZoomableView>

      {crossSession.hint && (
        <>
          <ThemedText type="smallBold" testID="coaching-hint">
            {t(`stats.hint.${crossSession.hint.kind}`)}
          </ThemedText>
          {crossSession.hint.kind !== 'sample' && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('stats.hintNumbers', {
                position: (crossSession.hint.pointsToPosition ?? 0).toFixed(1),
                size: (crossSession.hint.pointsToSize ?? 0).toFixed(1),
              })}
            </ThemedText>
          )}
          {/* What the numbers cannot tell you, said plainly rather than
              implied by silence. */}
          <ThemedText type="small" themeColor="textSecondary">
            {t('stats.hintCaveat')}
          </ThemedText>
        </>
      )}
    </Card>
  );

  if (!data.hasMatches) {
    return (
      <>
        <EmptyState title={t('stats.emptyFilteredTitle')} body={t('stats.emptyFilteredBody')} />
        {crossSessionCard}
      </>
    );
  }

  const fChart = faltChart();

  return (
    <>
      {/* The lead: one number, how it moved, and its chart. */}
      {headline && (
        <Card testID="stats-headline">
          <Stat
            bare
            size="score"
            testID={faltLeads ? 'stat-headline-hit-rate' : 'stat-mean-series'}
            label={faltLeads ? t('stats.faltHitRate') : t('statsA.headlineMeanPerSeries')}
            value={
              faltLeads
                ? percent(headline.value)
                : headline.value === null
                  ? DASH
                  : headline.value.toFixed(1)
            }
          />
          {trend && (
            <ThemedText type="small" themeColor="textSecondary" testID="stats-trend">
              {trend}
            </ThemedText>
          )}
          {faltLeads
            ? fChart && chartBody(fChart, 'stats-headline-chart')
            : chartBody(
                ringChart((point) => point.meanSeriesTotalTenths),
                'stats-headline-chart',
              )}
        </Card>
      )}

      {/* The detail under it. X is always counted, 0 included. */}
      {data.showRingCards && (
        <Card testID="stats-detail">
          <View style={styles.gridRow}>
            <Stat
              bare
              testID="stat-mean"
              label={t('stats.mean')}
              value={score(totals.meanShotTenths)}
              style={styles.cell}
            />
            <Stat
              bare
              testID="stat-sd"
              label={t('statsA.shotSd')}
              value={data.sdTenths === null ? DASH : tenthsToScore(data.sdTenths).toFixed(2)}
              style={styles.cell}
            />
          </View>
          <View style={styles.gridRow}>
            <Stat
              bare
              testID="stat-x-percent"
              label={t('stats.xPercent')}
              value={
                totals.scoredShotCount === 0
                  ? DASH
                  : percent(totals.innerTenCount / totals.scoredShotCount)
              }
              style={styles.cell}
            />
            <Stat
              bare
              testID="stat-inner-tens"
              label={t('stats.innerTens')}
              value={String(totals.innerTenCount)}
              style={styles.cell}
            />
          </View>
        </Card>
      )}

      {data.showRingCards && (
        <Card testID="stats-distribution">
          <ThemedText type="smallBold">{t('statsA.distributionTitle')}</ThemedText>
          {data.distribution.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('stats.distributionEmpty')}
            </ThemedText>
          ) : (
            <>
              <DistributionBarChart buckets={data.distribution} />
              <ChartCaption>
                {t('statsA.distributionCaption', {
                  count: totals.scoredShotCount,
                  x: totals.innerTenCount,
                })}
              </ChartCaption>
            </>
          )}
        </Card>
      )}

      {/* The counts Home used to show for all time, for this filter. */}
      <Card testID="stats-counts">
        <View style={styles.gridRow}>
          <Stat
            bare
            testID="stat-sessions"
            label={t('stats.sessions')}
            value={String(totals.sessionCount)}
            style={styles.cell}
          />
          <Stat
            bare
            testID="stat-total-shots"
            label={t('stats.totalShots')}
            value={String(totals.volumeShotCount)}
            style={styles.cell}
          />
          <Stat
            bare
            testID="stat-competitions"
            label={t('statsA.competitions')}
            value={String(data.competitionCount)}
            style={styles.cell}
          />
        </View>
      </Card>

      {sections.length >= MIN_INDEXED_SECTIONS && (
        <ReportSectionIndex sections={sections} onJump={jumpTo} />
      )}

      {data.showRingCards && (
        <Card ref={recordsRef}>
          <ThemedText type="smallBold">{t('stats.summaryTitle')}</ThemedText>
          {recordRow(
            t('stats.recordSessionScore'),
            data.bestSessionScore,
            formatTotalScore(data.bestSessionScore?.value ?? null),
          )}
          {recordRow(
            t('stats.recordInnerTens'),
            data.mostInnerTens,
            String(data.mostInnerTens?.value ?? DASH),
          )}
          {recordRow(t('stats.recordTens'), data.mostTens, String(data.mostTens?.value ?? DASH))}
        </Card>
      )}

      {data.showRingCards && (
        <Card ref={totalsRef}>
          <ThemedText type="smallBold">{t('stats.sumTitle')}</ThemedText>
          <View style={styles.gridRow}>
            <Stat
              bare
              testID="stat-total-score"
              label={t('stats.totalScore')}
              value={formatTotalScore(totals.sumTenths)}
              style={styles.cell}
            />
            <Stat
              bare
              testID="stat-series"
              label={t('stats.seriesCount')}
              value={String(totals.scoredSeriesCount)}
              style={styles.cell}
            />
          </View>
          <View style={styles.gridRow}>
            <Stat
              bare
              testID="stat-tens"
              label={t('stats.tens')}
              value={String(totals.tenCount)}
              style={styles.cell}
            />
            {/* SPSF-specific, so only where there is one (shared report.ts). */}
            {data.goldSeriesCount > 0 ? (
              <Stat
                bare
                testID="stat-gold-series-count"
                label={t('stats.goldSeriesCount')}
                value={String(data.goldSeriesCount)}
                style={styles.cell}
              />
            ) : (
              <View style={styles.cell} />
            )}
          </View>
        </Card>
      )}

      {data.falt && (
        <Card testID="stats-falt" ref={faltRef}>
          <ThemedText type="smallBold">{disciplineLabel(t, 'spsf-falt')}</ThemedText>
          <View style={styles.gridRow}>
            <Stat
              bare
              testID="stat-falt-stations"
              label={t('stats.faltStations')}
              value={String(data.falt.totals.stationCount)}
              style={styles.cell}
            />
            <Stat
              bare
              testID="stat-falt-hit-rate"
              label={t('stats.faltHitRate')}
              value={percent(data.falt.totals.hitRate)}
              style={styles.cell}
            />
          </View>
          <View style={styles.gridRow}>
            <Stat
              bare
              testID="stat-falt-hits"
              label={t('stats.faltHits')}
              value={String(data.falt.totals.hits)}
              style={styles.cell}
            />
            <Stat
              bare
              testID="stat-falt-figures"
              label={t('stats.faltFiguresHit')}
              value={String(data.falt.totals.figuresHit)}
              style={styles.cell}
            />
          </View>
          {/* Already the lead chart when the hit rate is the headline. */}
          {!faltLeads && fChart && (
            <>
              <ThemedText type="smallBold">{t('stats.chartFaltHitsPerStation')}</ThemedText>
              {chartBody(fChart)}
            </>
          )}
        </Card>
      )}

      {data.showRingCards && (
        <>
          {data.typeComparison.length > 0 && (
            <View ref={typeComparisonRef}>
              <SessionTypeComparisonCard rows={data.typeComparison} />
            </View>
          )}

          {data.sighterRelation.length > 0 && (
            <View ref={sighterRef}>
              <SighterRelationCard entries={data.sighterRelation} />
            </View>
          )}

          <View style={styles.section} ref={chartsRef}>
            <Card>
              <ThemedText type="smallBold">{t('stats.chartShotMean')}</ThemedText>
              {chartBody(ringChart((point) => point.meanShotTenths))}
            </Card>

            <Card>
              <ThemedText type="smallBold">{t('stats.chartSessionScore')}</ThemedText>
              {chartBody(
                ringChart((point) =>
                  point.scoredSeriesCount === 0 ? null : point.sessionTotalTenths,
                ),
              )}
            </Card>
          </View>
        </>
      )}

      {crossSessionCard}

      <View style={styles.section} ref={exportRef}>
        <Button
          variant="secondary"
          testID="stats-export"
          label={t('stats.exportJson')}
          onPress={() =>
            void exportJson({
              filter,
              range,
              sessionIds: data.sessionIds,
              totals: data.totals,
              records: data.records,
            })
          }
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('stats.exportHint')}
        </ThemedText>
        {statusText && (
          <ThemedText type="small" themeColor="textSecondary" testID="stats-export-status">
            {statusText}
          </ThemedText>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heatmapCanvas: {
    height: 300,
  },
  section: {
    gap: Spacing.three,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
