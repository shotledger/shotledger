// "My starts" (integration spec §C): upcoming signups with patrol time,
// lane, venue and patrol mates, plus a per-start "Add to calendar" action.
// Aggressive caching + explicit refresh only — never a background poll
// (§A.11/§C.3).
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { CalendarPermissionDeniedError } from '@/platform/calendar';
import { formatStartWindow } from '@shotledger/shared/src/integrations/webshooter/start-window';

import { useWebshooterStarts } from '@/features/webshooter/use-webshooter-starts';
import { Spacing } from '@/theme/tokens';

export default function WebshooterStartsScreen() {
  const { t } = useTranslation();
  const { starts, loading, error, load, addToCalendar, errorDetail, skipped } =
    useWebshooterStarts();
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

  // Shown on the card itself rather than in Alert.alert: a system dialog
  // arrives in OS chrome — system grey, system type scale, an accent that
  // is Android's and not the app's — and demands a tap to dismiss a message
  // that is only a confirmation (maintainer, 2026-09-11).
  const [feedback, setFeedback] = useState<{
    signupId: number;
    text: string;
    failed: boolean;
  } | null>(null);

  async function onAddToCalendar(start: (typeof starts)[number]) {
    try {
      // Naming the calendar matters: the app writes into the shooter's own
      // diary and used to do it without saying where.
      const calendarTitle = await addToCalendar(start);
      setFeedback({
        signupId: start.signupId,
        text:
          calendarTitle === ''
            ? t('webshooter.calendarAdded')
            : t('webshooter.calendarAddedTo', { calendar: calendarTitle }),
        failed: false,
      });
    } catch (err) {
      setFeedback({
        signupId: start.signupId,
        text:
          err instanceof CalendarPermissionDeniedError
            ? t('webshooter.calendarPermissionDenied')
            : t('webshooter.calendarAddFailed'),
        failed: true,
      });
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
          {/* The reason, verbatim: "couldn't reach Webshooter" covered
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
                    {[
                      mate.weaponClass === '' ? mate.name : `${mate.name} (${mate.weaponClass})`,
                      mate.patrolNumber === null
                        ? null
                        : t('webshooter.patrolNumber', { number: mate.patrolNumber }),
                      mate.window === null
                        ? t('webshooter.notDrawnYet')
                        : formatStartWindow(...(mate.window.split('|') as [string, string])),
                      t('webshooter.laneShort', { lane: mate.lane }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                ))
              ))}
            <DrillDownRow
              title={
                start.patrolStart === null || start.patrolEnd === null
                  ? t('webshooter.notDrawnYet')
                  : formatStartWindow(start.patrolStart, start.patrolEnd)
              }
              subtitle={[
                start.patrolNumber === null
                  ? null
                  : t('webshooter.patrolNumber', { number: start.patrolNumber }),
                t('webshooter.startDetails', { lane: start.lane, city: start.city }),
              ]
                .filter(Boolean)
                .join(' · ')}
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
                    {[
                      t('webshooter.laneShort', { lane: member.lane }),
                      // The shooter's own name, not "You": the line is read
                      // alongside four other names, and a pronoun makes it
                      // the odd one out rather than the findable one. It is
                      // still tinted, which is what marks it.
                      // Weapon class sits against the name it belongs to, in
                      // parentheses: a fourth dot-separated field made every
                      // line wrap on a phone.
                      member.weaponClass === ''
                        ? member.name
                        : `${member.name} (${member.weaponClass})`,
                      // Club in full rather than a same-club flag: knowing
                      // WHO is next to you is the point, and a flag only
                      // answers a question you did not ask.
                      member.club,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
            {feedback?.signupId === start.signupId && (
              <ThemedText
                type="small"
                themeColor={feedback.failed ? 'danger' : 'textSecondary'}
                testID={`webshooter-calendar-feedback-${start.signupId}`}
              >
                {feedback.text}
              </ThemedText>
            )}
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
