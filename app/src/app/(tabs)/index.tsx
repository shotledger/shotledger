import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FAB } from '@/components/fab';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { deleteSessionAndSeries } from '@/db/queries/round-count';
import { useOverallBarometer } from '@/features/compliance/use-barometer';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { formatSessionDate } from '@/features/home/format-session-date';
import {
  filterSessionRowsByShape,
  formatSeriesAverage,
  formatSessionTotal,
  type HomeSessionRow,
  type SessionShapeFilter,
} from '@/features/home/home-session-row';
import { useHomeData } from '@/features/home/use-home-data';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

const BAROMETER_TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { shotsLoggedTotal, sessionCount, competitionCount, latestSessions, refresh } =
    useHomeData();
  const { profile } = useComplianceProfile();
  const { overall } = useOverallBarometer(profile);
  const [shapeFilter, setShapeFilter] = useState<SessionShapeFilter>('all');

  const onNewSession = () => router.push('/session/new');

  function onDeleteSession(session: HomeSessionRow) {
    Alert.alert(t('home.deleteSessionConfirmTitle'), t('home.deleteSessionConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('home.deleteSession'),
        style: 'destructive',
        onPress: () => {
          if (!db) return;
          deleteSessionAndSeries(db, session.id);
          refresh();
        },
      },
    ]);
  }

  const shapeFilterOptions = [
    { value: 'all' as const, label: t('home.filterAll') },
    { value: 'series' as const, label: t('home.shapeSeries') },
    { value: 'roundsOnly' as const, label: t('home.shapeRounds') },
  ];

  const filteredSessions = filterSessionRowsByShape(latestSessions, shapeFilter);

  return (
    <>
      <Screen>
        <ThemedText type="title" style={styles.title}>
          {t('home.title')}
        </ThemedText>

        <View style={styles.statsRow}>
          <StatTile
            testID="home-stat-shots-logged"
            label={t('home.shotsLoggedTotal')}
            value={String(shotsLoggedTotal)}
          />
          <StatTile
            testID="home-stat-sessions"
            label={t('home.sessionsTotal')}
            value={String(sessionCount)}
          />
          <StatTile
            testID="home-stat-competitions"
            label={t('home.competitionsTotal')}
            value={String(competitionCount)}
          />
        </View>

        <ListRow
          testID="home-timer-entry"
          title={t('timer.homeEntry')}
          onPress={() => router.push('/timer')}
        />

        {profile && overall && (
          <Chip
            testID="home-barometer"
            label={t(`compliance.barometer${capitalize(overall)}`)}
            tone={BAROMETER_TONE[overall]}
          />
        )}

        {latestSessions.length === 0 ? (
          <EmptyState
            title={t('home.emptyTitle')}
            body={t('home.emptyBody')}
            ctaLabel={t('home.emptyCta')}
            onPressCta={onNewSession}
          />
        ) : (
          <View style={styles.list}>
            <ThemedText type="smallBold">{t('home.latestSessions')}</ThemedText>
            <SegmentedControl
              testID="home-shape-filter"
              options={shapeFilterOptions}
              value={shapeFilter}
              onChange={setShapeFilter}
            />
            {filteredSessions.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('home.filterEmpty')}
              </ThemedText>
            ) : (
              filteredSessions.map((session, index) => (
                <Swipeable
                  key={session.id}
                  overshootRight={false}
                  renderRightActions={() => (
                    <View style={styles.rowActions}>
                      <Pressable
                        accessibilityRole="button"
                        testID={`home-session-${index}-share`}
                        onPress={() => router.push(`/session/${session.id}/share`)}
                        style={[styles.rowAction, { backgroundColor: theme.backgroundSelected }]}
                      >
                        <ThemedText type="smallBold">{t('home.shareSession')}</ThemedText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        testID={`home-session-${index}-delete`}
                        onPress={() => onDeleteSession(session)}
                        style={[styles.rowAction, { backgroundColor: theme.danger }]}
                      >
                        <ThemedText type="smallBold" themeColor="onPrimary">
                          {t('home.deleteSession')}
                        </ThemedText>
                      </Pressable>
                    </View>
                  )}
                >
                  <ListRow
                    testID={`home-session-${index}`}
                    title={session.name}
                    subtitle={[
                      formatSessionDate(session.startedAt, i18n.language),
                      formatSessionTotal(session.total),
                      // Average and inner-ten count are omitted, never printed
                      // as 0/NaN, when the session has nothing scored yet
                      // (spec B-L2).
                      session.seriesAverage === null
                        ? null
                        : formatSeriesAverage(session.seriesAverage),
                      session.seriesAverage === null ? null : `${session.innerTenCount}X`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={<Chip label={t(`sessionType.${session.type}`)} />}
                    onPress={() => router.push(`/session/${session.id}`)}
                  />
                </Swipeable>
              ))
            )}
          </View>
        )}
      </Screen>
      <FAB label={t('home.newSession')} onPress={onNewSession} testID="new-session-fab" />
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  rowAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
  },
});
