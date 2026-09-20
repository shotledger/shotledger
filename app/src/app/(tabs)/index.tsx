import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ScreenTitle } from '@/components/screen-title';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FAB } from '@/components/fab';
import { ListRow } from '@/components/list-row';
import { TagChips } from '@/components/tag-chips';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { deleteSessionAndSeries } from '@/db/queries/round-count';
import { useOverallLicenseActivity } from '@/features/compliance/use-license-activity';
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

const LICENSE_ACTIVITY_TONE: Record<string, 'neutral' | 'primary'> = {
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
  const { overall } = useOverallLicenseActivity(profile);
  const [shapeFilter, setShapeFilter] = useState<SessionShapeFilter>('all');

  const onNewSession = () => router.push('/session/new');

  function onDeleteSession(session: HomeSessionRow) {
    Alert.alert(t('common.deleteSessionConfirmTitle'), t('common.deleteSessionConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.deleteSession'),
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
    <Screen
      fab={<FAB label={t('home.newSession')} onPress={onNewSession} testID="new-session-fab" />}
    >
      <ScreenTitle>{t('home.title')}</ScreenTitle>

      <View style={styles.statsRow}>
        <StatTile
          align="center"
          testID="home-stat-shots-logged"
          label={t('home.shotsLoggedTotal')}
          value={String(shotsLoggedTotal)}
        />
        <StatTile
          align="center"
          testID="home-stat-sessions"
          label={t('home.sessionsTotal')}
          value={String(sessionCount)}
        />
        <StatTile
          align="center"
          testID="home-stat-competitions"
          label={t('home.competitionsTotal')}
          value={String(competitionCount)}
        />
      </View>

      {profile && overall && (
        <Chip
          testID="home-barometer"
          label={t(`compliance.licenseActivity${capitalize(overall)}`)}
          tone={LICENSE_ACTIVITY_TONE[overall]}
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
                        {t('common.deleteSession')}
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
                  below={<TagChips names={session.tags} testID={`home-session-${index}-tags`} />}
                  trailing={<Chip label={t(`sessionType.${session.type}`)} />}
                  onPress={() => router.push(`/session/${session.id}`)}
                />
              </Swipeable>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
