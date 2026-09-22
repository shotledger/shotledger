// A series' group figures in two compact rows: the same numbers the session
// Group tab shows, for one photo. The marking screen shows the first row live
// while you tap; the photo viewer adds the points-lost row.
import type { GroupAnalysis, PointsLostAnalysis } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

export interface GroupStatsProps extends ViewProps {
  analysis: GroupAnalysis;
  pointsLost?: PointsLostAnalysis | null;
  testIDPrefix: string;
}

interface Figure {
  key: string;
  label: string;
  value: string;
}

export function GroupStats({
  analysis,
  pointsLost,
  testIDPrefix,
  style,
  ...rest
}: GroupStatsProps) {
  const { t } = useTranslation();
  const mm = (value: number) => t('photoScoring.millimeters', { value: value.toFixed(1) });
  const figures: Figure[] = [
    { key: 'windage', label: t('photoScoring.windage'), value: mm(analysis.windageMm) },
    { key: 'elevation', label: t('photoScoring.elevation'), value: mm(analysis.elevationMm) },
    { key: 'mean-radius', label: t('photoScoring.meanRadius'), value: mm(analysis.meanRadiusMm) },
    { key: 'max-spread', label: t('photoScoring.maxSpread'), value: mm(analysis.extremeSpreadMm) },
  ];
  const lost: Figure[] = pointsLost
    ? [
        {
          key: 'potential-score',
          label: t('photoScoring.potentialScore'),
          value: String(pointsLost.recenteredScore),
        },
        {
          key: 'points-lost-position',
          label: t('photoScoring.pointsLostPosition'),
          // Negative when a flier drags the MPI off a tight cluster; shown as
          // 0, as on the session Group tab.
          value: String(Math.max(0, pointsLost.pointsLostToPosition)),
        },
        {
          key: 'points-lost-size',
          label: t('photoScoring.pointsLostSize'),
          value: String(pointsLost.pointsLostToSize),
        },
      ]
    : [];

  const cells = (items: Figure[]) =>
    items.map((f) => (
      <View key={f.key} style={styles.cell} testID={`${testIDPrefix}-${f.key}`}>
        <ThemedText type="smallBold" numberOfLines={1} adjustsFontSizeToFit>
          {f.value}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {f.label}
        </ThemedText>
      </View>
    ));

  return (
    <View style={[styles.stack, style]} {...rest}>
      <View style={styles.row}>{cells(figures)}</View>
      {lost.length > 0 && (
        <>
          <ThemedText type="smallBold">{t('photoScoring.pointsLostTitle')}</ThemedText>
          <View style={styles.row}>{cells(lost)}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
