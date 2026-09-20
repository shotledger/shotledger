// PB & year-to-year (integration spec §B). Chosen as a standalone
// /stats/records route rather than a Stats-tab segment: the existing Stats
// tab (app/src/app/(tabs)/stats.tsx) is already period/filter-driven and
// per-shot oriented, while records are per-competition-group and only make
// sense once imported/official data exists — a different enough shape that
// folding it into the same SegmentedControl would strain that screen's
// existing filter model. Reachable from Settings (§A) and, if wired later,
// a "Records" entry on the Stats tab itself (not done here — kept as a
// standalone route per the task's "your call, note it").
import { getDiscipline, tenthsToScore, weaponGroupLabel } from '@shotledger/shared';
import {
  parseStatsGroupKey,
  type PbCoverage,
} from '@shotledger/shared/src/integrations/webshooter/stats/pb';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useWebshooterRecords } from '@/features/webshooter/use-webshooter-records';
import { Spacing } from '@/theme/tokens';

function fmt(tenths: number | null): string {
  return tenths === null ? '–' : tenthsToScore(tenths).toFixed(1);
}

/**
 * The line under a section heading saying what its figures are the best OF.
 * Always rendered when the section is: a personal best presented without its
 * basis is the defect this screen was filed over (#318).
 */
function CoverageLine({ coverage, testID }: { coverage: PbCoverage; testID: string }) {
  const { t } = useTranslation();
  return (
    <ThemedText type="small" themeColor="textSecondary" testID={testID}>
      {t('webshooter.coverage', {
        counted: coverage.counted,
        considered: coverage.considered,
      })}
      {coverage.ungrouped > 0
        ? ` ${t('webshooter.coverageUngrouped', { count: coverage.ungrouped })}`
        : ''}
    </ThemedText>
  );
}

export default function WebshooterRecordsScreen() {
  const { t } = useTranslation();

  // The group key is an id, not a label — "spsf-precision:spsf:A" is what the
  // screen used to print (#138: "This is not for humans"). Written out it is
  // the federation, the discipline and the vapengrupp: "SPSF Precision · A".
  function groupLabel(groupKey: string): string {
    const { disciplineId, weaponGroupId } = parseStatsGroupKey(groupKey);
    const discipline = getDiscipline(disciplineId);
    const name = discipline ? t(`discipline.${disciplineId}` as const) : disciplineId;
    const federation =
      discipline && discipline.federation !== 'generic' ? `${discipline.federation} ` : '';
    // No vapengrupp recorded is its own bucket, and says so — the alternative
    // is a record card labelled with the discipline alone, indistinguishable
    // from one where the group happens to be unknown (#318).
    const group = weaponGroupId ? weaponGroupLabel(weaponGroupId) : t('webshooter.ungrouped');
    return group ? `${federation}${name} · ${group}` : `${federation}${name}`;
  }

  const { officialPbs, freeformPbs, yearOverYear, officialCoverage, freeformCoverage } =
    useWebshooterRecords();

  const empty = officialPbs.length === 0 && freeformPbs.length === 0 && yearOverYear.length === 0;

  return (
    <Screen>
      <ScreenTitle>{t('webshooter.recordsTitle')}</ScreenTitle>

      {empty && (
        <EmptyState title={t('webshooter.noRecordsTitle')} body={t('webshooter.noRecordsBody')} />
      )}

      {officialPbs.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="smallBold">{t('webshooter.officialPbTitle')}</ThemedText>
          <CoverageLine coverage={officialCoverage} testID="records-coverage-official" />
          {officialPbs.map((row) => (
            <Card key={row.groupKey}>
              <ThemedText type="default">{groupLabel(row.groupKey)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('webshooter.allTimeBest', { value: fmt(row.allTimeTenths) })}
              </ThemedText>
            </Card>
          ))}
        </View>
      )}

      {freeformPbs.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="smallBold">{t('webshooter.freeformPbTitle')}</ThemedText>
          <CoverageLine coverage={freeformCoverage} testID="records-coverage-freeform" />
          {freeformPbs.map((row) => (
            <Card key={row.groupKey}>
              <ThemedText type="default">{groupLabel(row.groupKey)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('webshooter.freeformBest5', { value: fmt(row.best5Tenths) })}
                {' · '}
                {t('webshooter.freeformBest10', { value: fmt(row.best10Tenths) })}
                {' · '}
                {t('webshooter.freeformBestSession', { value: fmt(row.bestSessionTenths) })}
              </ThemedText>
            </Card>
          ))}
        </View>
      )}

      {yearOverYear.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="smallBold">{t('webshooter.yearOverYearTitle')}</ThemedText>
          {yearOverYear.map((row) => (
            <Card key={row.groupKey}>
              <ThemedText type="default">{groupLabel(row.groupKey)}</ThemedText>
              {row.years.map((year) => (
                <ThemedText key={year.year} type="small" themeColor="textSecondary">
                  {year.year}: {fmt(year.meanTenths)} ({year.count})
                </ThemedText>
              ))}
              {row.latestChange && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('webshooter.yoyChange', {
                    absolute: fmt(row.latestChange.absoluteTenths),
                    percentage: row.latestChange.percentage.toFixed(1),
                  })}
                </ThemedText>
              )}
              {row.trendPerYear !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('webshooter.yoyTrend', { value: fmt(row.trendPerYear) })}
                </ThemedText>
              )}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
