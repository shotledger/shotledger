// The generated analytics report: a header card echoing the filter, the
// records inside the filtered set, both the sum and the per-shot totals,
// and three hand-drawn charts over time. Generated on the fly from the
// filter the /stats form pushed in as a route param — nothing is stored.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
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
import { TimeSeriesChart, type TimeSeriesPoint } from '@/components/time-series-chart';
import {
  EXPORT_FORMATS,
  useReportExport,
  type ExportFormat,
} from '@/features/export/use-report-export';
import { disciplineLabel } from '@/features/session/labels';
import {
  decodeAnalyticsFilter,
  periodRange,
  useAnalyticsReport,
  type AnalyticsReportData,
  type NamedRecord,
} from '@/features/stats/use-stats-data';
import { ShotHeatmap } from '@/components/shot-heatmap';
import { useCrossSessionGroup } from '@/features/stats/use-cross-session-group';
import { Spacing } from '@/theme/tokens';

const DASH = '–';

function score(tenths: number | null): string {
  return tenths === null ? DASH : tenthsToScore(tenths).toFixed(1);
}

export default function StatsReportScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = useMemo(() => decodeAnalyticsFilter(params.filter), [params.filter]);
  const data: AnalyticsReportData = useAnalyticsReport(filter);
  const [pickingFormat, setPickingFormat] = useState(false);
  const { exportAs, statusText } = useReportExport(t, i18n.language);

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
  const formatShortDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(
      new Date(iso),
    );

  const range = periodRange(filter);
  // Cross-session group: every photo-scored mark in the period, pooled.
  const crossSession = useCrossSessionGroup(
    range.fromIso?.slice(0, 10) ?? null,
    range.toIso?.slice(0, 10) ?? null,
    filter.disciplineId,
  );
  const formatLabel: Record<ExportFormat, string> = {
    pdf: t('compliance.exportPdf'),
    json: t('stats.exportJson'),
  };
  const chart = (pick: (point: AnalyticsReportData['points'][number]) => number | null) =>
    data.points
      .filter((point) => pick(point) !== null)
      .map<TimeSeriesPoint>((point) => ({
        key: point.sessionId,
        startedAt: point.startedAt,
        value: pick(point) as number,
      }));

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
    <Screen>
      <ScreenTitle>{t('stats.reportTitle')}</ScreenTitle>

      <Card>
        <ThemedText type="smallBold">{t('stats.filterEchoTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('stats.customFrom')}: {range.fromIso ? formatDate(range.fromIso) : t('stats.all')}
          {'\n'}
          {t('stats.customTo')}: {range.toIso ? formatDate(range.toIso) : t('compliance.pdfNow')}
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

      {crossSession && (
        <Card testID="cross-session-group">
          <ThemedText type="smallBold">{t('stats.crossSessionTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('stats.crossSessionSubtitle', {
              shots: crossSession.analysis.shotCount,
              sessions: crossSession.sessionCount,
              discipline: disciplineLabel(t, crossSession.disciplineId),
            })}
          </ThemedText>

          <View style={styles.centred}>
            <ShotHeatmap
              target={crossSession.target}
              shots={crossSession.marks}
              size={300}
              testID="cross-session-heatmap"
            />
          </View>

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
          <Card>
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
            {recordRow(t('stats.recordTens'), data.mostTens, String(data.mostTens?.value ?? DASH))}
          </Card>

          <Card>
            <ThemedText type="smallBold">{t('stats.sumTitle')}</ThemedText>
            <View style={styles.gridRow}>
              <StatTile
                testID="stat-total-shots"
                label={t('stats.totalShots')}
                value={String(data.totals.volumeShotCount)}
              />
              <StatTile
                testID="stat-total-score"
                label={t('stats.totalScore')}
                value={score(data.totals.sumTenths)}
              />
            </View>
            <View style={styles.gridRow}>
              <StatTile
                testID="stat-sessions"
                label={t('stats.sessions')}
                value={String(data.totals.sessionCount)}
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
          </Card>

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
            {data.guldserieCount > 0 && (
              <View style={styles.gridRow}>
                <StatTile
                  testID="stat-guldserie-count"
                  label={t('stats.guldserieCount')}
                  value={String(data.guldserieCount)}
                />
              </View>
            )}
          </Card>

          <Card>
            <ThemedText type="smallBold">{t('stats.chartSeriesMean')}</ThemedText>
            <TimeSeriesChart
              points={chart((point) => point.meanSeriesTotalTenths)}
              formatValue={(value) => tenthsToScore(value).toFixed(0)}
              formatDate={formatShortDate}
              emptyLabel={t('stats.trendEmpty')}
            />
          </Card>

          <Card>
            <ThemedText type="smallBold">{t('stats.chartShotMean')}</ThemedText>
            <TimeSeriesChart
              points={chart((point) => point.meanShotTenths)}
              formatValue={(value) => tenthsToScore(value).toFixed(1)}
              formatDate={formatShortDate}
              emptyLabel={t('stats.trendEmpty')}
            />
          </Card>

          <Card>
            <ThemedText type="smallBold">{t('stats.chartSessionScore')}</ThemedText>
            <TimeSeriesChart
              points={chart((point) =>
                point.scoredSeriesCount === 0 ? null : point.sessionTotalTenths,
              )}
              formatValue={(value) => tenthsToScore(value).toFixed(0)}
              formatDate={formatShortDate}
              emptyLabel={t('stats.trendEmpty')}
            />
          </Card>

          <Card>
            <ThemedText type="smallBold">{t('stats.distributionTitle')}</ThemedText>
            {data.distribution.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('stats.distributionEmpty')}
              </ThemedText>
            ) : (
              <DistributionBarChart buckets={data.distribution} />
            )}
          </Card>

          {pickingFormat ? (
            <Card testID="stats-export-formats">
              <ThemedText type="smallBold">{t('stats.exportFormatTitle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('stats.exportScopeNote')}
              </ThemedText>
              {EXPORT_FORMATS.map((format) => (
                <DrillDownRow
                  key={format}
                  title={formatLabel[format]}
                  subtitle={t(`stats.exportHint.${format}`)}
                  testID={`stats-export-${format}`}
                  onPress={() => {
                    setPickingFormat(false);
                    void exportAs(format, {
                      filter,
                      range,
                      sessionIds: data.sessionIds,
                      totals: data.totals,
                      records: data.records,
                    });
                  }}
                />
              ))}
              <PrimaryButton label={t('common.cancel')} onPress={() => setPickingFormat(false)} />
            </Card>
          ) : (
            <PrimaryButton
              testID="stats-export"
              label={t('stats.export')}
              onPress={() => setPickingFormat(true)}
            />
          )}

          {statusText && (
            <ThemedText type="small" themeColor="textSecondary" testID="stats-export-status">
              {statusText}
            </ThemedText>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centred: {
    alignItems: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
