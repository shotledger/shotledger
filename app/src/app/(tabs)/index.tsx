import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FAB } from '@/components/fab';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { useHomeData } from '@/features/home/use-home-data';
import { Spacing } from '@/theme/tokens';

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { shotsLoggedTotal, latestSessions } = useHomeData();

  const onNewSession = () => router.push('/session/new');

  return (
    <>
      <Screen>
        <ThemedText type="title" style={styles.title}>
          {t('home.title')}
        </ThemedText>

        <StatTile label={t('home.shotsLoggedTotal')} value={String(shotsLoggedTotal)} />

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
            {latestSessions.map((session, index) => (
              <ListRow
                key={session.id}
                testID={`home-session-${index}`}
                title={session.name}
                subtitle={`${formatDate(session.startedAt, i18n.language)} · ${session.total}`}
                trailing={<Chip label={t(`sessionType.${session.type}`)} />}
                onPress={() => router.push(`/session/${session.id}`)}
              />
            ))}
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
  list: {
    gap: Spacing.one,
  },
});
