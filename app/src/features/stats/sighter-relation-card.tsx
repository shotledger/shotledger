// The report's Sighter and Result card (#573): per discipline, each
// competition's sighter against its match, from `sighterRelation` in shared.
import { tenthsToScore, type SighterRelation } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ScatterPlot } from '@/components/scatter-plot';
import { ThemedText } from '@/components/themed-text';
import { disciplineLabel } from '@/features/session/labels';
import { Spacing } from '@/theme/tokens';

export function SighterRelationCard({ entries }: { entries: readonly SighterRelation[] }) {
  const { t } = useTranslation();

  return (
    <Card testID="stats-sighter-relation">
      <ThemedText type="smallBold">{t('stats.sighterRelationTitle')}</ThemedText>
      {entries.map((entry) => (
        <View
          key={entry.disciplineId}
          style={styles.group}
          testID={`sighter-relation-${entry.disciplineId}`}
        >
          <ThemedText type="smallBold">{disciplineLabel(t, entry.disciplineId)}</ThemedText>
          <ScatterPlot
            points={entry.points.map((p) => ({
              key: p.sessionId,
              x: p.sighterMeanShotTenths,
              y: p.resultMeanShotTenths,
            }))}
            xLabel={t('stats.sighterRelationX')}
            yLabel={t('stats.sighterRelationY')}
            formatValue={(tenths) => tenthsToScore(tenths).toFixed(1)}
          />
          <ThemedText type="small" testID={`sighter-relation-verdict-${entry.disciplineId}`}>
            {verdict(t, entry)}
          </ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        {t('stats.sighterRelationCaveat')}
      </ThemedText>
    </Card>
  );
}

function verdict(t: ReturnType<typeof useTranslation>['t'], entry: SighterRelation): string {
  if (entry.correlation === null) {
    return entry.neededMore > 0
      ? t('stats.sighterRelationNeedsMore', { count: entry.neededMore })
      : t('stats.sighterRelationNoVariance', { count: entry.competitionCount });
  }
  const { r, strength, direction } = entry.correlation;
  const values = { r: r.toFixed(2), count: entry.competitionCount };
  if (direction === null) return t('stats.sighterRelationNone', values);
  // A direction is only given when the strength is not `none`.
  const word = t(`stats.sighterStrength.${strength as Exclude<typeof strength, 'none'>}`);
  return direction === 'positive'
    ? t('stats.sighterRelationPositive', { ...values, strength: word })
    : t('stats.sighterRelationNegative', { ...values, strength: word });
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
