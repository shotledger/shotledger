// WebShooter import — competition browse (integration spec §A.1). Lists
// competitions from the cached client listing, with a year filter
// (client-side, since /competitions has no server-side filter, §A.11) and
// an already-imported badge is left to the review screen (§A.2 exact match
// needs the per-row external_ref, not just the competition id).
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { useWebShooterCompetitions } from '@/features/webshooter/use-webshooter-import';
import { Spacing } from '@/theme/tokens';

const ALL_YEARS = 'all';

export default function WebShooterImportBrowseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { competitions, loading, error, load } = useWebShooterCompetitions();
  const [year, setYear] = useState<string>(ALL_YEARS);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount, refresh is explicit (§A.11 polite-client rule)
  }, []);

  const years = useMemo(() => {
    const set = new Set(competitions.map((c) => c.date.slice(0, 4)));
    return [ALL_YEARS, ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [competitions]);

  const filtered = useMemo(
    () => (year === ALL_YEARS ? competitions : competitions.filter((c) => c.date.startsWith(year))),
    [competitions, year],
  );

  return (
    <Screen>
      <ThemedText type="title">{t('webshooter.importBrowseTitle')}</ThemedText>

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
          options={years.map((y) => ({ value: y, label: y === ALL_YEARS ? t('webshooter.allYears') : y }))}
          value={year}
          onChange={setYear}
          testID="webshooter-import-year-filter"
        />
      )}

      {!loading && filtered.length === 0 && (
        <EmptyState title={t('webshooter.noCompetitionsTitle')} body={t('webshooter.noCompetitionsBody')} />
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
