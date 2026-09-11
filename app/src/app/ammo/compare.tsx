// Ammo lot comparison (#138, "Ammo performance comparison across lots"):
// which lot actually shoots better. One card per lot, ranked, each carrying
// its own sample size and 95% interval — and a head-to-head that says
// "inconclusive" out loud when the gap is inside the noise.
//
// Thin screen by construction: every number comes from
// @shotledger/shared's lot-comparison.ts through useAmmoLotComparison.
import { MIN_COMPARABLE_SHOTS, tenthsToScore } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import {
  useAmmoLotComparison,
  type AmmoLotComparisonRow,
  type NamedHeadToHead,
} from '@/features/ammo/use-lot-comparison';
import { Spacing } from '@/theme/tokens';

const DASH = '–';

function score(tenths: number | null): string {
  return tenths === null ? DASH : tenthsToScore(tenths).toFixed(2);
}

/** A signed figure, so a difference never reads as an absolute score. */
function signedScore(tenths: number): string {
  const points = tenthsToScore(tenths);
  return `${points >= 0 ? '+' : ''}${points.toFixed(2)}`;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

export default function AmmoCompareScreen() {
  const { t } = useTranslation();
  const data = useAmmoLotComparison();

  const headToHeadText = (head: NamedHeadToHead): string => {
    const names = { leader: head.leaderLabel, runnerUp: head.runnerUpLabel };
    if (head.verdict === 'insufficient-data') {
      return t('ammo.compareHeadInsufficient', { ...names, count: MIN_COMPARABLE_SHOTS });
    }
    const bounds = {
      ...names,
      delta: signedScore(head.deltaTenths),
      low: signedScore(head.ci95LowTenths as number),
      high: signedScore(head.ci95HighTenths as number),
    };
    return head.verdict === 'difference'
      ? t('ammo.compareHeadDifference', bounds)
      : t('ammo.compareHeadInconclusive', bounds);
  };

  const lotCard = (row: AmmoLotComparisonRow, rank: number) => (
    <Card key={row.ammoLotId} testID={`ammo-compare-${row.ammoLotId}`}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">{`${rank}. ${row.label}`}</ThemedText>
        {row.sampleBand !== 'usable' && <Chip label={t('ammo.compareThinChip')} />}
      </View>

      <MetricRow
        label={t('ammo.compareAvgShot')}
        value={
          row.meanShotCi95Tenths === null
            ? score(row.meanShotTenths)
            : `${score(row.meanShotTenths)} ±${tenthsToScore(row.meanShotCi95Tenths).toFixed(2)}`
        }
      />
      <MetricRow label={t('ammo.compareAvgSeries')} value={score(row.meanSeriesTenths)} />
      <MetricRow
        label={t('ammo.compareInnerTenRate')}
        value={
          row.innerTenRate === null
            ? DASH
            : `${(row.innerTenRate * 100).toFixed(1)} % (${row.innerTenCount})`
        }
      />
      <MetricRow
        label={t('ammo.compareGroup')}
        value={
          row.meanExtremeSpreadMm === null
            ? t('ammo.compareGroupNone')
            : t('ammo.compareGroupValue', {
                spread: row.meanExtremeSpreadMm.toFixed(1),
                count: row.groupSampleCount,
              })
        }
      />
      <MetricRow
        label={t('ammo.compareSample')}
        value={t('ammo.compareSampleValue', {
          shots: row.scoredShotCount,
          series: row.scoredSeriesCount,
          sessions: row.sessionCount,
        })}
      />
      {row.sampleBand !== 'usable' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('ammo.compareThinHint', { count: MIN_COMPARABLE_SHOTS })}
        </ThemedText>
      )}
    </Card>
  );

  if (!data.hasAnyData) {
    return (
      <Screen>
        <ScreenTitle>{t('ammo.compareTitle')}</ScreenTitle>
        <EmptyState title={t('ammo.compareEmptyTitle')} body={t('ammo.compareEmptyBody')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle>{t('ammo.compareTitle')}</ScreenTitle>
      <ThemedText type="small" themeColor="textSecondary">
        {t('ammo.compareIntro')}
      </ThemedText>

      {data.headToHead && (
        <Card>
          <ThemedText type="smallBold">{t('ammo.compareHeadTitle')}</ThemedText>
          <ThemedText type="small" testID="ammo-compare-head-to-head">
            {headToHeadText(data.headToHead)}
          </ThemedText>
        </Card>
      )}

      {data.rows.map((row, index) => lotCard(row, index + 1))}

      <Card>
        <ThemedText type="smallBold">{t('ammo.compareCaveatsTitle')}</ThemedText>
        {data.isImbalanced && (
          <ThemedText type="small" themeColor="textSecondary" testID="ammo-compare-imbalance">
            {t('ammo.compareImbalance', {
              ratio: (data.sampleImbalance as number).toFixed(1),
            })}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {t('ammo.compareCaveats')}
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
