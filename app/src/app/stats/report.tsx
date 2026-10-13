// The generated analytics report: a header card echoing the filter, the
// records inside the filtered set, both the sum and the per-shot totals,
// and three hand-drawn charts over time. Generated on the fly from the
// filter the /stats form pushed in as a route param — nothing is stored.
import type { TFunction } from 'i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { tenthsToScore } from '@shotledger/shared';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { DistributionBarChart } from '@/components/distribution-bar-chart';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { CHART_LINE_COLORS, groupByDiscipline } from '@/components/time-series-chart-math';
import { useResolvedThemeName } from '@/hooks/use-theme';
import { useReportExport } from '@/features/export/use-report-export';
import { disciplineLabel } from '@/features/session/labels';
import {
  decodeAnalyticsFilter,
  periodRange,
  useAnalyticsReport,
  type AnalyticsReportData,
  type NamedRecord,
} from '@/features/stats/use-stats-data';
import { ShotHeatmap } from '@/components/shot-heatmap';
import { ZoomableView } from '@/components/zoomable-view';
import { formatTotalScore } from '@/features/stats/format-total-score';
import { SessionTypeComparisonCard } from '@/features/stats/session-type-comparison-card';
import { SighterRelationCard } from '@/features/stats/sighter-relation-card';
import { ReportSectionIndex } from '@/features/stats/report-section-index';
import {
  MIN_INDEXED_SECTIONS,
  reportSections,
  type ReportSectionKey,
} from '@/features/stats/report-sections';
import { useCrossSessionGroup } from '@/features/stats/use-cross-session-group';
import { Spacing } from '@/theme/tokens';
import { localDayOf } from '@/features/dates/local-day';
import { useDateFormat } from '@/features/dates/use-date-format';

const DASH = '–';

/**
 * One chart plus the "and N more disciplines" line. Separate so the three
 * charts cannot drift in how they report what the palette could not cover.
 */
function ChartBody({
  grouped,
  formatValue,
  formatDate,
  t,
}: {
  grouped: ReturnType<typeof groupByDiscipline>;
  formatValue: (value: number) => string;
  formatDate: (iso: string, withYear: boolean) => string;
  t: TFunction;
}) {
  return (
    <TimeSeriesChart
      lines={grouped.lines}
      formatValue={formatValue}
      formatDate={formatDate}
      emptyLabel={t('stats.trendEmpty')}
      omittedLabel={
        grouped.omittedCount === 0
          ? null
          : t('stats.chartDisciplinesOmitted', { count: grouped.omittedCount })
      }
    />
  );
}

function score(tenths: number | null): string {
  return tenths === null ? DASH : tenthsToScore(tenths).toFixed(1);
}

export default function StatsReportScreen() {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = useMemo(() => decodeAnalyticsFilter(params.filter), [params.filter]);
  const data: AnalyticsReportData = useAnalyticsReport(filter);
  const { exportJson, statusText } = useReportExport(t);
  const themeName = useResolvedThemeName();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
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
  const distributionRef = useRef<View>(null);
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
      distribution: distributionRef,
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
  // either (#349).
  const chart = (pick: (point: AnalyticsReportData['points'][number]) => number | null) =>
    groupByDiscipline(
      data.points,
      pick as (point: {
        sessionId: string;
        startedAt: string;
        disciplineId: string;
      }) => number | null,
      (disciplineId) => disciplineLabel(t, disciplineId),
      CHART_LINE_COLORS[themeName],
    );

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

  return (
    <Screen scrollRef={scrollRef} contentRef={contentRef}>
      <ScreenTitle>{t('stats.reportTitle')}</ScreenTitle>

      <Card>
        <ThemedText type="smallBold">{t('stats.filterEchoTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('period.from')}: {range.fromIso ? formatDate(range.fromIso) : t('stats.all')}
          {'\n'}
          {t('period.to')}: {range.toIso ? formatDate(range.toIso) : t('compliance.pdfNow')}
          {'\n'}
          {t('stats.sectionShotsPerSeries')}: {filter.shotsPerSeries ?? t('stats.all')}
          {'\n'}
          {t('stats.sectionType')}:{' '}
          {filter.sessionType ? t(`sessionType.${filter.sessionType}`) : t('stats.all')}
          {'\n'}
          {t('session.discipline')}:{' '}
          {filter.disciplineId ? disciplineLabel(t, filter.disciplineId) : t('stats.all')}
          {'\n'}
          {t('stats.sectionTags')}:{' '}
          {data.tagNames.length === 0 ? t('stats.tagsNone') : data.tagNames.join(', ')}
          {'\n'}
          {t('stats.sectionSighters')}:{' '}
          {filter.includeSighters ? t('stats.sightersInclude') : t('stats.sightersExclude')}
        </ThemedText>
        <ThemedText type="default" testID="report-match-count">
          {t('stats.matchCount', { count: data.totals.sessionCount })}
        </ThemedText>
      </Card>

      {sections.length >= MIN_INDEXED_SECTIONS && (
        <ReportSectionIndex sections={sections} onJump={jumpTo} />
      )}

      {crossSession && (
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
              <ShotHeatmap
                target={crossSession.target}
                shots={crossSession.marks}
                size={box.width}
              />
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
      )}

      {!data.hasMatches ? (
        <EmptyState title={t('stats.emptyFilteredTitle')} body={t('stats.emptyFilteredBody')} />
      ) : (
        <>
          {data.showRingCards && (
            <Card ref={recordsRef}>
              <ThemedText type="smallBold">{t('stats.summaryTitle')}</ThemedText>
              {recordRow(
                t('stats.recordSessionScore'),
                data.bestSessionScore,
                score(data.bestSessionScore?.value ?? null),
              )}
              {recordRow(
                t('stats.recordInnerTens'),
                data.mostInnerTens,
                String(data.mostInnerTens?.value ?? DASH),
              )}
              {recordRow(
                t('stats.recordTens'),
                data.mostTens,
                String(data.mostTens?.value ?? DASH),
              )}
            </Card>
          )}

          <Card ref={totalsRef}>
            <ThemedText type="smallBold">{t('stats.sumTitle')}</ThemedText>
            <View style={styles.gridRow}>
              <StatTile
                testID="stat-total-shots"
                label={t('stats.totalShots')}
                value={String(data.totals.volumeShotCount)}
              />
              <StatTile
                testID="stat-sessions"
                label={t('stats.sessions')}
                value={String(data.totals.sessionCount)}
              />
            </View>
            {data.showRingCards && (
              <>
                <View style={styles.gridRow}>
                  <StatTile
                    testID="stat-total-score"
                    label={t('stats.totalScore')}
                    value={formatTotalScore(data.totals.sumTenths)}
                  />
                  <StatTile
                    testID="stat-series"
                    label={t('stats.seriesCount')}
                    value={String(data.totals.scoredSeriesCount)}
                  />
                </View>
                <View style={styles.gridRow}>
                  <StatTile
                    testID="stat-inner-tens"
                    label={t('stats.innerTens')}
                    value={String(data.totals.innerTenCount)}
                  />
                  <StatTile
                    testID="stat-tens"
                    label={t('stats.tens')}
                    value={String(data.totals.tenCount)}
                  />
                </View>
              </>
            )}
          </Card>

          {data.showRingCards && (
            <Card>
              <ThemedText type="smallBold">{t('stats.perShotTitle')}</ThemedText>
              <View style={styles.gridRow}>
                <StatTile
                  testID="stat-mean"
                  label={t('stats.mean')}
                  value={score(data.totals.meanShotTenths)}
                />
                <StatTile
                  testID="stat-mean-series"
                  label={t('stats.meanPerSeries')}
                  value={score(data.totals.meanSeriesTenths)}
                />
              </View>
              <View style={styles.gridRow}>
                <StatTile
                  testID="stat-sd"
                  label={t('stats.standardDeviation')}
                  value={data.sdTenths === null ? DASH : tenthsToScore(data.sdTenths).toFixed(2)}
                />
                <StatTile
                  testID="stat-x-percent"
                  label={t('stats.xPercent')}
                  value={
                    data.totals.scoredShotCount === 0
                      ? DASH
                      : `${((data.totals.innerTenCount / data.totals.scoredShotCount) * 100).toFixed(0)}%`
                  }
                />
              </View>
              {data.goldSeriesCount > 0 && (
                <View style={styles.gridRow}>
                  <StatTile
                    testID="stat-gold-series-count"
                    label={t('stats.goldSeriesCount')}
                    value={String(data.goldSeriesCount)}
                  />
                </View>
              )}
            </Card>
          )}

          {data.falt && (
            <Card testID="stats-falt" ref={faltRef}>
              <ThemedText type="smallBold">{disciplineLabel(t, 'spsf-falt')}</ThemedText>
              <View style={styles.gridRow}>
                <StatTile
                  testID="stat-falt-stations"
                  label={t('stats.faltStations')}
                  value={String(data.falt.totals.stationCount)}
                />
                <StatTile
                  testID="stat-falt-hit-rate"
                  label={t('stats.faltHitRate')}
                  value={
                    data.falt.totals.hitRate === null
                      ? DASH
                      : `${(data.falt.totals.hitRate * 100).toFixed(0)}%`
                  }
                />
              </View>
              <View style={styles.gridRow}>
                <StatTile
                  testID="stat-falt-hits"
                  label={t('stats.faltHits')}
                  value={String(data.falt.totals.hits)}
                />
                <StatTile
                  testID="stat-falt-figures"
                  label={t('stats.faltFiguresHit')}
                  value={String(data.falt.totals.figuresHit)}
                />
              </View>
              <ThemedText type="smallBold">{t('stats.chartFaltHitsPerStation')}</ThemedText>
              <ChartBody
                grouped={groupByDiscipline(
                  data.falt.points,
                  (point) => point.hitsPerStation,
                  (disciplineId) => disciplineLabel(t, disciplineId),
                  CHART_LINE_COLORS[themeName],
                )}
                formatValue={(value) => value.toFixed(1)}
                formatDate={formatShortDate}
                t={t}
              />
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
                  <ThemedText type="smallBold">{t('stats.chartSeriesMean')}</ThemedText>
                  <ChartBody
                    grouped={chart((point) => point.meanSeriesTotalTenths)}
                    formatValue={(value) => tenthsToScore(value).toFixed(0)}
                    formatDate={formatShortDate}
                    t={t}
                  />
                </Card>

                <Card>
                  <ThemedText type="smallBold">{t('stats.chartShotMean')}</ThemedText>
                  <ChartBody
                    grouped={chart((point) => point.meanShotTenths)}
                    formatValue={(value) => tenthsToScore(value).toFixed(1)}
                    formatDate={formatShortDate}
                    t={t}
                  />
                </Card>

                <Card>
                  <ThemedText type="smallBold">{t('stats.chartSessionScore')}</ThemedText>
                  <ChartBody
                    grouped={chart((point) =>
                      point.scoredSeriesCount === 0 ? null : point.sessionTotalTenths,
                    )}
                    formatValue={(value) => tenthsToScore(value).toFixed(0)}
                    formatDate={formatShortDate}
                    t={t}
                  />
                </Card>
              </View>

              <Card ref={distributionRef}>
                <ThemedText type="smallBold">{t('stats.distributionTitle')}</ThemedText>
                {data.distribution.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('stats.distributionEmpty')}
                  </ThemedText>
                ) : (
                  <DistributionBarChart buckets={data.distribution} />
                )}
              </Card>
            </>
          )}

          <View style={styles.section} ref={exportRef}>
            <PrimaryButton
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
      )}
    </Screen>
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
});
