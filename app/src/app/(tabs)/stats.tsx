// Live stats tab (§4 M5) — no generate button, every value recomputed on
// focus/filter change from @shotledger/shared's stats.ts.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { formatShooterClass, tenthsToScore } from '@shotledger/shared';

import { Card } from '@/components/card';
import { DistributionBarChart } from '@/components/distribution-bar-chart';
import { EmptyState } from '@/components/empty-state';
import { OptionPicker } from '@/components/option-picker';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { TrendLineChart, TrendLineChartEmpty } from '@/components/trend-line-chart';
import { disciplineLabel } from '@/features/session/labels';
import {
  DEFAULT_STATS_FILTERS,
  STATS_PERIODS,
  useStatsData,
  type StatsFilters,
} from '@/features/stats/use-stats-data';
import { Spacing } from '@/theme/tokens';

const ALL = 'all-values';

function formatMean(tenths: number | null): string {
  return tenths === null ? '–' : tenthsToScore(tenths).toFixed(1);
}

function formatSd(tenths: number | null): string {
  return tenths === null ? '–' : tenthsToScore(tenths).toFixed(2);
}

function formatPercent(pct: number | null): string {
  return pct === null ? '–' : `${pct.toFixed(0)}%`;
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<StatsFilters>(DEFAULT_STATS_FILTERS);
  const { data } = useStatsData(filters);

  const periodOptions = useMemo(
    () =>
      STATS_PERIODS.map((period) => ({
        value: period,
        label: t(`stats.period${period === 'all' ? 'All' : period}`),
      })),
    [t],
  );

  if (!data.hasAnyData) {
    return (
      <Screen>
        <ThemedText type="title">{t('stats.title')}</ThemedText>
        <EmptyState title={t('stats.emptyTitle')} body={t('stats.emptyBody')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="title">{t('stats.title')}</ThemedText>

      <SegmentedControl
        options={periodOptions}
        value={filters.period}
        onChange={(period) => setFilters((f) => ({ ...f, period }))}
      />

      <OptionPicker
        label={t('session.discipline')}
        options={[
          { value: ALL, label: t('stats.all') },
          ...data.disciplineIds.map((id) => ({ value: id, label: disciplineLabel(t, id) })),
        ]}
        value={filters.disciplineId ?? ALL}
        onChange={(value) => setFilters((f) => ({ ...f, disciplineId: value === ALL ? null : value }))}
      />

      <OptionPicker
        label={t('session.shooterClass')}
        options={[
          { value: ALL, label: t('stats.all') },
          ...data.shooterClasses.map((code) => ({ value: code, label: formatShooterClass(code) })),
        ]}
        value={filters.shooterClass ?? ALL}
        onChange={(value) => setFilters((f) => ({ ...f, shooterClass: value === ALL ? null : value }))}
      />

      <OptionPicker
        label={t('session.firearm')}
        options={[
          { value: ALL, label: t('stats.all') },
          ...data.firearmOptions.map((option) => ({ value: option.id, label: option.label })),
        ]}
        value={filters.firearmId ?? ALL}
        onChange={(value) => setFilters((f) => ({ ...f, firearmId: value === ALL ? null : value }))}
      />

      {!data.hasFilteredData ? (
        <EmptyState title={t('stats.emptyFilteredTitle')} body={t('stats.emptyFilteredBody')} />
      ) : (
        <>
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <StatTile testID="stat-total-shots" label={t('stats.totalShots')} value={String(data.totalShots)} />
              <StatTile testID="stat-sessions" label={t('stats.sessions')} value={String(data.sessionCount)} />
            </View>
            <View style={styles.gridRow}>
              <StatTile testID="stat-mean" label={t('stats.mean')} value={formatMean(data.meanTenths)} />
              <StatTile testID="stat-sd" label={t('stats.standardDeviation')} value={formatSd(data.sdTenths)} />
            </View>
            <View style={styles.gridRow}>
              <StatTile testID="stat-x-percent" label={t('stats.xPercent')} value={formatPercent(data.xRatePercent)} />
              <StatTile
                testID="stat-guldserie-count"
                label={t('stats.guldserieCount')}
                value={String(data.guldserieCountInPeriod)}
              />
            </View>
          </View>

          <Card>
            <ThemedText type="smallBold">{t('stats.trendTitle')}</ThemedText>
            {data.trend.length === 0 ? (
              <TrendLineChartEmpty label={t('stats.trendEmpty')} />
            ) : (
              <TrendLineChart points={data.trend} />
            )}
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
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: Spacing.two,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
