// Dev-only debug route (not linked from tabs; redirected away outside dev
// builds by dev/_layout.tsx). Lets an agent or developer load/wipe the seed
// fixture and see it render without a full UI.
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { db } from '@/db/client';
import { listSessions } from '@/db/queries/sessions';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { Spacing } from '@/theme/tokens';

type SessionRow = ReturnType<typeof listSessions>[number];

export default function DevScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>(() => (db ? listSessions(db) : []));

  const refresh = useCallback(() => {
    if (db) setSessions(listSessions(db));
  }, []);

  const onLoadDemoData = useCallback(() => {
    if (!db) return;
    seedDemoData(db);
    refresh();
  }, [refresh]);

  const onWipeData = useCallback(() => {
    if (!db) return;
    wipeDemoData(db);
    refresh();
  }, [refresh]);

  return (
    <Screen scroll={false}>
      <ThemedText type="title" style={styles.title}>
        {t('dev.title')}
      </ThemedText>

      {!db && <ThemedText type="small">{t('dev.webUnavailable')}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/dev/components')}
        testID="dev-components-link"
      >
        <ThemedText type="linkPrimary">{t('dev.componentsTitle')}</ThemedText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/dev/shotlog-import')}
        testID="dev-shotlog-import-link"
      >
        <ThemedText type="linkPrimary">{t('shotlog.sectionRowTitle')}</ThemedText>
      </Pressable>

      <ThemedView style={styles.actions}>
        <PrimaryButton
          label={t('settings.loadDemoData')}
          onPress={onLoadDemoData}
          testID="load-demo-data"
        />
        <PrimaryButton label={t('settings.wipeData')} onPress={onWipeData} testID="wipe-data" />
      </ThemedView>

      <ThemedText type="smallBold">{t('dev.sessionsCount', { count: sessions.length })}</ThemedText>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText type="small">{item.name}</ThemedText>
            <ThemedText type="small">
              {item.type} · {item.disciplineId} · {item.startedAt.slice(0, 10)}
            </ThemedText>
          </ThemedView>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    lineHeight: 28,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
});
