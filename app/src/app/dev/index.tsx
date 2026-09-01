// Dev-only debug route (not linked from tabs). Lets an agent or developer
// load/wipe the seed fixture and see it render without a full UI.
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { db } from '@/db/client';
import { listSessions } from '@/db/queries/sessions';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { Spacing } from '@/theme/tokens';

type SessionRow = ReturnType<typeof listSessions>[number];

export default function DevScreen() {
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Dev
        </ThemedText>

        {!db && (
          <ThemedText type="small">
            expo-sqlite&apos;s web driver isn&apos;t wired up in this Expo SDK (M1 deviation) — use
            a native build to load and browse demo data.
          </ThemedText>
        )}

        <ThemedView style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onLoadDemoData}
            style={styles.button}
            testID="load-demo-data"
          >
            <ThemedText themeColor="background">Load demo data</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onWipeData}
            style={styles.button}
            testID="wipe-data"
          >
            <ThemedText themeColor="background">Wipe data</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedText type="smallBold">{sessions.length} sessions</ThemedText>

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
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  button: {
    backgroundColor: '#3c87f7',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
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
