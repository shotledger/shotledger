// Webshooter import — competition browse (integration spec §A.1). Lists
// competitions from the cached client listing, with a year filter
// (client-side, since /competitions has no server-side filter, §A.11) and
// an already-imported badge is left to the review screen (§A.2 exact match
// needs the per-row external_ref, not just the competition id).
import { isPastCompetition } from '@shotledger/shared/src/integrations/webshooter/competition-dates';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { useWebshooterCompetitions } from '@/features/webshooter/use-webshooter-import';
import { useWebshooterMyCompetitions } from '@/features/webshooter/use-webshooter-my-competitions';
import { Spacing } from '@/theme/tokens';

const ALL_YEARS = 'all';

export default function WebshooterImportBrowseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { competitions, loading, error, load } = useWebshooterCompetitions();
  const [year, setYear] = useState<string>(ALL_YEARS);

  // Refreshes whenever the screen comes into view, not only on first mount
  // (maintainer, 2026-09-11). The client's TTL cache absorbs the repeats,
  // so returning to this screen twice in a minute costs one request.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const years = useMemo(() => {
    const set = new Set(competitions.map((c) => c.date.slice(0, 4)));
    return [ALL_YEARS, ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [competitions]);

  // Land on the most recent year rather than "all": the scan below costs a
  // request per competition, and "all" would mean the whole history.
  const [yearPicked, setYearPicked] = useState(false);
  if (!yearPicked && years.length > 1) {
    setYearPicked(true);
    setYear(years[1]!);
  }

  const candidates = useMemo(
    () =>
      // Results only exist for competitions that have been shot, so this
      // screen never offers a future one (maintainer, 2026-09-11). Today
      // counts as past: results are often posted the same afternoon.
      (year === ALL_YEARS
        ? competitions
        : competitions.filter((c) => c.date.startsWith(year))
      ).filter((c) => isPastCompetition(c.date)),
    [competitions, year],
  );

  // Signing up is not shooting: a no-show or a DNF leaves a signup and no
  // result, and those must not be offered for import. Only checked for a
  // chosen year — see the hook for why this is not done for "all".
  const scanning = year !== ALL_YEARS;
  const scan = useWebshooterMyCompetitions(scanning ? candidates : []);
  const filtered = scanning ? scan.mine : candidates;

  return (
    <Screen>
      <ScreenTitle>{t('webshooter.importBrowseTitle')}</ScreenTitle>

      <PrimaryButton
        label={t('webshooter.refresh')}
        onPress={() => void load({ forceRefresh: true })}
        testID="webshooter-import-refresh"
      />

      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('webshooter.fetchFailed')}
        </ThemedText>
      )}

      {years.length > 1 && (
        <SegmentedControl
          options={years.map((y) => ({
            value: y,
            label: y === ALL_YEARS ? t('webshooter.allYears') : y,
          }))}
          value={year}
          onChange={setYear}
          testID="webshooter-import-year-filter"
        />
      )}

      {scanning && scan.scanning && (
        <ThemedText type="small" themeColor="textSecondary" testID="webshooter-import-scanning">
          {t('webshooter.scanningForResults', { checked: scan.checked, total: scan.total })}
        </ThemedText>
      )}

      {!loading && !scan.scanning && filtered.length === 0 && (
        <EmptyState
          title={t('webshooter.noCompetitionsTitle')}
          body={t('webshooter.noCompetitionsBody')}
        />
      )}

      <View style={styles.list}>
        {filtered.map((competition) => (
          <ListRow
            key={competition.id}
            title={competition.name}
            subtitle={[
              competition.date,
              competition.contact_city,
              competition.alreadyImportable ? null : t('webshooter.fieldNotSupported'),
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => router.push(`/webshooter/import/${competition.id}`)}
            testID={`webshooter-competition-${competition.id}`}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
});
