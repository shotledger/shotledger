// "My starts" (integration spec §C): upcoming signups with patrol time,
// lane, venue and patrol mates, plus a per-start "Add to calendar" action.
// Aggressive caching + explicit refresh only — never a background poll
// (§A.11/§C.3).
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { CalendarPermissionDeniedError } from '@/platform/calendar';
import { formatStartWindow } from '@shotledger/shared/src/integrations/webshooter/start-window';

import { useWebShooterStarts } from '@/features/webshooter/use-webshooter-starts';
import { Spacing } from '@/theme/tokens';

export default function WebShooterStartsScreen() {
  const { t } = useTranslation();
  const { starts, loading, error, load, addToCalendar, errorDetail } = useWebShooterStarts();

  // Refreshes whenever the screen comes into view, not only on first mount
  // (maintainer, 2026-09-11). The client's TTL cache absorbs the repeats.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onAddToCalendar(start: (typeof starts)[number]) {
    try {
      await addToCalendar(start);
      Alert.alert(t('webshooter.calendarAdded'));
    } catch (err) {
      Alert.alert(
        err instanceof CalendarPermissionDeniedError
          ? t('webshooter.calendarPermissionDenied')
          : t('webshooter.calendarAddFailed'),
      );
    }
  }

  return (
    <Screen>
      <ThemedText type="title">{t('webshooter.startsTitle')}</ThemedText>

      <PrimaryButton
        label={t('webshooter.refresh')}
        onPress={() => void load({ forceRefresh: true })}
        testID="webshooter-starts-refresh"
      />

      {error && (
        <>
          <ThemedText type="small" themeColor="danger" testID="webshooter-starts-error">
            {t('webshooter.fetchFailed')}
          </ThemedText>
          {/* The reason, verbatim: "couldn't reach WebShooter" covered
              failures that reached it perfectly well. */}
          {errorDetail !== null && (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              testID="webshooter-starts-error-detail"
            >
              {errorDetail}
            </ThemedText>
          )}
        </>
      )}

      {!loading && starts.length === 0 && (
        <EmptyState title={t('webshooter.noStartsTitle')} body={t('webshooter.noStartsBody')} />
      )}

      <View style={styles.list}>
        {starts.map((start) => (
          <Card key={`${start.competitionId}-${start.signupId}`}>
            <ThemedText type="smallBold">{start.competitionName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('webshooter.startDetails', {
                window: formatStartWindow(start.patrolStart, start.patrolEnd),
                lane: start.lane,
                city: start.city,
              })}
            </ThemedText>
            {start.weaponClass !== '' && (
              <Chip label={start.weaponClass} testID="webshooter-start-weapon-class" />
            )}
            {start.patrolMates.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('webshooter.patrolMates', { count: start.patrolMates.length })}
              </ThemedText>
            )}
            <PrimaryButton
              label={t('webshooter.addToCalendar')}
              onPress={() => void onAddToCalendar(start)}
              testID={`webshooter-add-to-calendar-${start.signupId}`}
            />
          </Card>
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
