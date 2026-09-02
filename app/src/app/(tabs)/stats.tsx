// Live stats tab (§4 M5) — no generate button, every value recomputed on
// focus/filter change from @shotledger/shared's stats.ts. M6 adds a Custom
// period (from/to date pickers) and a PDF export of the filtered log.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { formatShooterClass, tenthsToScore } from '@shotledger/shared';

import { Card } from '@/components/card';
import { DistributionBarChart } from '@/components/distribution-bar-chart';
import { EmptyState } from '@/components/empty-state';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { TrendLineChart, TrendLineChartEmpty } from '@/components/trend-line-chart';
import { buildShootingLogHtmlForFilters } from '@/features/export/use-pdf-export';
import { disciplineLabel } from '@/features/session/labels';
import {
  DEFAULT_STATS_FILTERS,
  periodRange,
  STATS_PERIODS,
  useStatsData,
  type StatsFilters,
} from '@/features/stats/use-stats-data';
import { exportHtmlAsPdf } from '@/platform/pdf-export';
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

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodLabelCase(period: string): string {
  return period === 'all' || period === 'custom'
    ? period.charAt(0).toUpperCase() + period.slice(1)
    : period;
}

export default function StatsScreen() {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<StatsFilters>(DEFAULT_STATS_FILTERS);
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null);
  const { data } = useStatsData(filters);

  const periodOptions = useMemo(
    () =>
      STATS_PERIODS.map((period) => ({
        value: period,
        label: t(`stats.period${periodLabelCase(period)}`),
      })),
    [t],
  );

  // Compact range label for the Custom period, e.g. "2026-03-01 – 2026-09-01".
  const customRangeLabel =
    filters.customFrom && filters.customTo
      ? `${new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(filters.customFrom))} – ${new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(filters.customTo))}`
      : t('stats.customRangeIncomplete');

  async function onExportPdf() {
    const range = periodRange(filters);
    const html = buildShootingLogHtmlForFilters(t, i18n.language, {
      startedFromIso: range.fromIso,
      startedToIso: range.toIso,
      firearmId: filters.firearmId,
    });
    if (html) await exportHtmlAsPdf(html);
  }

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

      {filters.period === 'custom' && (
        <Card>
          <View style={styles.customRow}>
            <PrimaryButton
              testID="stats-custom-from"
              label={`${t('stats.customFrom')}: ${filters.customFrom ?? '—'}`}
              onPress={() => setPickerOpen('from')}
            />
            <PrimaryButton
              testID="stats-custom-to"
              label={`${t('stats.customTo')}: ${filters.customTo ?? '—'}`}
              onPress={() => setPickerOpen('to')}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary" testID="stats-custom-range-label">
            {customRangeLabel}
          </ThemedText>
          {pickerOpen && (
            <DateTimePicker
              testID="stats-custom-date-picker"
              value={
                new Date(
                  (pickerOpen === 'from' ? filters.customFrom : filters.customTo) ??
                    toDateOnly(new Date()),
                )
              }
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_event, selected) => {
                setPickerOpen(null);
                if (!selected) return;
                const value = toDateOnly(selected);
                setFilters((f) => (pickerOpen === 'from' ? { ...f, customFrom: value } : { ...f, customTo: value }));
              }}
            />
          )}
        </Card>
      )}

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

          <PrimaryButton testID="stats-export-pdf" label={t('compliance.exportPdf')} onPress={onExportPdf} />
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
  customRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
