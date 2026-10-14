// Home (#822, direction A "Instrument"): what to do today leads, not lifetime
// counts. Top to bottom:
//
// 1. The licence status in words, which can change what you do today.
// 2. The next action: Start, on the last session's discipline and firearm,
//    the one primary button. It opens New Session with those preselected
//    (`lastSessionDefaults`); Change opens the same form to pick another.
// 3. The last session's result.
// 4. Recent sessions, with All Sessions for the rest.
//
// The lifetime totals (shots, sessions, competitions) moved to Statistics,
// and the New Session button no longer floats over the list: Start does its
// job from the top of the screen.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SwipeAction } from '@/components/swipe-action';
import { TagChips } from '@/components/tag-chips';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { deleteSessionAndSeries } from '@/db/queries/round-count';
import { nextSessionDeadline } from '@/features/compliance/next-session';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useOverallLicenseActivity } from '@/features/compliance/use-license-activity';
import { useDateFormat } from '@/features/dates/use-date-format';
import { formatSessionTotal, type HomeSessionRow } from '@/features/home/home-session-row';
import { LicenseActivityLine } from '@/features/home/license-activity-line';
import { useHomeData } from '@/features/home/use-home-data';
import { useFeatures } from '@/features/settings/feature-visibility';
import { disciplineLabel } from '@/features/session/labels';
import { SessionRow, useSessionResultLine } from '@/features/sessions/session-row';
import { typeShownBesideTags, withoutDateSuffix } from '@/features/sessions/session-row-format';
import { localDayOf } from '@/features/dates/local-day';
import { Spacing, TabularNums } from '@/theme/tokens';

export default function HomeScreen() {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const { latestSessions, start, refresh } = useHomeData();
  const { profile } = useComplianceProfile();
  const features = useFeatures();
  const { overall, lapseIso } = useOverallLicenseActivity(profile);
  const resultLine = useSessionResultLine();
  const [pendingDelete, setPendingDelete] = useState<HomeSessionRow | null>(null);

  const onNewSession = () => router.push('/session/new');

  function onConfirmDelete() {
    if (!pendingDelete) return;
    deleteSessionAndSeries(db, pendingDelete.id);
    setPendingDelete(null);
    refresh();
  }

  const [last, ...recent] = latestSessions;
  const lastResult = last ? resultLine(last) : null;
  const allSessions = (
    <Button
      variant="text"
      testID="home-see-all-sessions"
      label={t('homeA.allSessions')}
      onPress={() => router.push('/sessions')}
    />
  );

  return (
    <Screen>
      <ScreenTitle>{t('home.title')}</ScreenTitle>

      {/* The status opens the License Check, which says what to do about it (#804). */}
      {features.licenseActivity && profile && overall && (
        <LicenseActivityLine
          testID="home-license-check"
          status={overall}
          detail={
            lapseIso
              ? t('compliance.nextSessionBy', { date: dates.date(nextSessionDeadline(lapseIso)) })
              : null
          }
          onPress={() => router.push('/compliance')}
        />
      )}

      {last === undefined || start === null ? (
        <EmptyState
          title={t('home.emptyTitle')}
          body={t('home.emptyBody')}
          ctaLabel={t('home.emptyCta')}
          onPressCta={onNewSession}
        />
      ) : (
        <>
          <View style={styles.next}>
            <Button
              variant="primary"
              testID="home-start"
              label={
                start.disciplineId
                  ? t('homeA.start', { discipline: disciplineLabel(t, start.disciplineId) })
                  : t('home.newSession')
              }
              onPress={onNewSession}
            />
            <View style={styles.nextDetail}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.nextFirearm}
                testID="home-start-firearm"
              >
                {start.firearmName ?? ''}
              </ThemedText>
              <Button
                variant="text"
                testID="home-change"
                label={t('homeA.change')}
                onPress={onNewSession}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            testID="home-last-session"
            onPress={() => router.push(`/session/${last.id}`)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {[
                  t('homeA.lastSession'),
                  dates.date(last.startedAt),
                  typeShownBesideTags(last.type, last.tags) ? t(`sessionType.${last.type}`) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
              <View style={styles.lastRow}>
                <View style={styles.lastText}>
                  <ThemedText type="smallBold">
                    {withoutDateSuffix(last.name, [
                      dates.date(last.startedAt),
                      localDayOf(last.startedAt),
                    ])}
                  </ThemedText>
                  {lastResult ? (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      testID="home-last-session-result"
                    >
                      {lastResult}
                    </ThemedText>
                  ) : null}
                </View>
                {last.falt === null && last.seriesAverage !== null && (
                  <ThemedText type="score" style={TabularNums} testID="home-last-session-total">
                    {formatSessionTotal(last.total)}
                  </ThemedText>
                )}
              </View>
              <TagChips names={last.tags} testID="home-last-session-tags" />
            </Card>
          </Pressable>

          {recent.length > 0 ? (
            <View style={styles.list}>
              <View style={styles.listHeader}>
                <ThemedText type="smallBold" accessibilityRole="header">
                  {t('homeA.recent')}
                </ThemedText>
                {allSessions}
              </View>
              {recent.map((session, index) => (
                <Swipeable
                  key={session.id}
                  overshootRight={false}
                  renderRightActions={() => (
                    <View style={styles.rowActions}>
                      <SwipeAction
                        kind="share"
                        label={t('home.shareSession')}
                        onPress={() => router.push(`/session/${session.id}/share`)}
                        testID={`home-session-${index}-share`}
                      />
                      <SwipeAction
                        kind="delete"
                        label={t('common.deleteSession')}
                        onPress={() => setPendingDelete(session)}
                        testID={`home-session-${index}-delete`}
                      />
                    </View>
                  )}
                >
                  <SessionRow
                    testID={`home-session-${index}`}
                    session={session}
                    onPress={() => router.push(`/session/${session.id}`)}
                  />
                </Swipeable>
              ))}
            </View>
          ) : (
            <View style={styles.allAlone}>{allSessions}</View>
          )}
        </>
      )}
      <ConfirmSheet
        visible={pendingDelete !== null}
        title={t('common.deleteSessionConfirmTitle')}
        body={t('common.deleteSessionConfirmBody')}
        confirmLabel={t('common.deleteSession')}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDelete(null)}
        destructive
        testID="delete-session-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  next: { gap: Spacing.one },
  nextDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  nextFirearm: { flexShrink: 1 },
  lastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  lastText: { flex: 1, gap: Spacing.half },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  list: { gap: Spacing.one },
  rowActions: { flexDirection: 'row', gap: Spacing.one },
  allAlone: { alignItems: 'flex-start' },
  pressed: { opacity: 0.6 },
});
