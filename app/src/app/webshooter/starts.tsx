// "My starts" (integration spec §C): upcoming signups with patrol time,
// lane, venue and patrol mates, plus a per-start "Add to calendar" action.
// Aggressive caching + explicit refresh only — never a background poll
// (§A.11/§C.3).
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
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
  const { starts, loading, error, load, addToCalendar, errorDetail, skipped } =
    useWebShooterStarts();
  // One section open at a time: these lists are long, and two open at once
  // pushes the rest of the screen out of reach.
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((current) => (current === key ? null : key));

  // Refreshes whenever the screen comes into view, not only on first mount
  // (maintainer, 2026-09-11). The client's TTL cache absorbs the repeats.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onAddToCalendar(start: (typeof starts)[number]) {
    try {
      // Naming the calendar matters: the app writes into the shooter's own
      // diary and used to do it without saying where.
      const calendarTitle = await addToCalendar(start);
      Alert.alert(
        calendarTitle === ''
          ? t('webshooter.calendarAdded')
          : t('webshooter.calendarAddedTo', { calendar: calendarTitle }),
      );
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
      <ScreenTitle>{t('webshooter.startsTitle')}</ScreenTitle>

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

      {skipped > 0 && (
        <ThemedText type="small" themeColor="textSecondary" testID="webshooter-starts-skipped">
          {t('webshooter.startsSkipped', { count: skipped })}
        </ThemedText>
      )}

      {!loading && starts.length === 0 && (
        <EmptyState title={t('webshooter.noStartsTitle')} body={t('webshooter.noStartsBody')} />
      )}

      <View style={styles.list}>
        {starts.map((start) => (
          <Card key={`${start.competitionId}-${start.signupId}`}>
            {/* The competition name opens the club's start times; the start
                line opens the squad. Both were asked for by tapping them,
                so both are rows rather than buried buttons. */}
            <DrillDownRow
              title={start.competitionName}
              subtitle={t('webshooter.clubStartsSubtitle', { count: start.clubStarts.length })}
              expanded={expanded === `club-${start.signupId}`}
              onPress={() => toggle(`club-${start.signupId}`)}
              testID={`webshooter-open-club-${start.signupId}`}
            />
            {expanded === `club-${start.signupId}` &&
              (start.clubStarts.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('webshooter.clubStartsEmpty')}
                </ThemedText>
              ) : (
                start.clubStarts.map((mate, index) => (
                  <ThemedText
                    key={`${mate.name}-${index}`}
                    type="small"
                    themeColor="textSecondary"
                    testID={`webshooter-club-start-${start.signupId}-${index}`}
                  >
                    {`${mate.name} · ${
                      mate.window === null
                        ? t('webshooter.notDrawnYet')
                        : formatStartWindow(...(mate.window.split('|') as [string, string]))
                    }${mate.weaponClass === '' ? '' : ` · ${mate.weaponClass}`}`}
                  </ThemedText>
                ))
              ))}
            <DrillDownRow
              title={
                start.patrolStart === null || start.patrolEnd === null
                  ? t('webshooter.notDrawnYet')
                  : formatStartWindow(start.patrolStart, start.patrolEnd)
              }
              subtitle={t('webshooter.startDetails', {
                lane: start.lane,
                city: start.city,
              })}
              value={start.weaponClass === '' ? undefined : start.weaponClass}
              expanded={expanded === `squad-${start.signupId}`}
              onPress={() => toggle(`squad-${start.signupId}`)}
              testID={`webshooter-open-squad-${start.signupId}`}
            />
            {expanded === `squad-${start.signupId}` &&
              (start.squad.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('webshooter.squadEmpty')}
                </ThemedText>
              ) : (
                start.squad.map((member, index) => (
                  <ThemedText
                    key={`${member.name}-${index}`}
                    type="small"
                    themeColor={member.isMe ? 'primary' : 'textSecondary'}
                    testID={`webshooter-squad-member-${start.signupId}-${index}`}
                  >
                    {`${t('webshooter.laneShort', { lane: member.lane })} · ${
                      member.isMe ? t('webshooter.you') : member.name
                    }${member.weaponClass === '' ? '' : ` · ${member.weaponClass}`}`}
                  </ThemedText>
                ))
              ))}
            {start.calendarStale && (
              <ThemedText
                type="small"
                themeColor="danger"
                testID={`webshooter-calendar-stale-${start.signupId}`}
              >
                {t('webshooter.calendarStale')}
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
