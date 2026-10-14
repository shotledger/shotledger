// The report's Training vs Competition card (#570): one table per discipline
// and series length, built by `compareSessionTypes` in shared.
import {
  tenthsToScore,
  type SessionTypeComparison,
  type SessionTypeSide,
} from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { disciplineLabel } from '@/features/session/labels';
import { formatTotalScore } from '@/features/stats/format-total-score';
import { Spacing } from '@/theme/tokens';

const DASH = '–';

/** Half a tenth: below it the gap rounds to 0.0 points and reads as "the same". */
const SAME_GAP_TENTHS = 0.5;

const points = (tenths: number | null, digits = 1) =>
  tenths === null ? DASH : tenthsToScore(tenths).toFixed(digits);

interface Row {
  key: string;
  label: string;
  value: (side: SessionTypeSide) => string;
}

export function SessionTypeComparisonCard({ rows }: { rows: readonly SessionTypeComparison[] }) {
  const { t } = useTranslation();
  const lines: Row[] = [
    { key: 'sessions', label: t('stats.sessions'), value: (s) => String(s.sessionCount) },
    { key: 'mean', label: t('stats.statsSeriesMean'), value: (s) => points(s.meanSeriesTenths) },
    {
      key: 'median',
      label: t('stats.typeComparisonMedian'),
      value: (s) => points(s.medianSeriesTenths),
    },
    {
      key: 'best',
      label: t('stats.typeComparisonBest'),
      value: (s) => formatTotalScore(s.bestSeriesTenths),
    },
    { key: 'sd', label: t('stats.statsSeriesSd'), value: (s) => points(s.seriesSdTenths, 2) },
    {
      key: 'x',
      label: t('stats.statsSeriesInnerTens'),
      value: (s) => (s.innerTensPerSeries === null ? DASH : s.innerTensPerSeries.toFixed(1)),
    },
  ];

  return (
    <Card testID="stats-type-comparison">
      <ThemedText type="smallBold">{t('stats.typeComparisonTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.typeComparisonHint')}
      </ThemedText>
      {rows.map((row) => (
        <View
          key={`${row.disciplineId}-${row.seriesLength}`}
          style={styles.group}
          testID={`type-comparison-${row.disciplineId}-${row.seriesLength}`}
        >
          <ThemedText type="smallBold">
            {t('stats.typeComparisonGroup', {
              discipline: disciplineLabel(t, row.disciplineId),
              count: row.seriesLength,
            })}
          </ThemedText>
          <View style={styles.line}>
            <ThemedText type="small" style={styles.label} />
            <ThemedText type="smallBold" style={styles.value}>
              {t('sessionType.training')}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.value}>
              {t('sessionType.competition')}
            </ThemedText>
          </View>
          {lines.map((line) => (
            <View key={line.key} style={styles.line}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                {line.label}
              </ThemedText>
              <ThemedText type="small" style={styles.value}>
                {line.value(row.training)}
              </ThemedText>
              <ThemedText type="small" style={styles.value}>
                {line.value(row.competition)}
              </ThemedText>
            </View>
          ))}
          <ThemedText type="small" testID={`type-comparison-gap-${row.disciplineId}`}>
            {gapLine(t, row.gapSeriesTenths)}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

function gapLine(t: ReturnType<typeof useTranslation>['t'], gapTenths: number): string {
  if (Math.abs(gapTenths) < SAME_GAP_TENTHS) return t('stats.typeComparisonGapSame');
  const value = points(Math.abs(gapTenths));
  return gapTenths < 0
    ? t('stats.typeComparisonGapBelow', { points: value })
    : t('stats.typeComparisonGapAbove', { points: value });
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.half,
    marginTop: Spacing.two,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    flex: 1.4,
  },
  value: {
    flex: 1,
    textAlign: 'right',
  },
});
