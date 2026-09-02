// Blocks rendering the app until pending Drizzle migrations have run.
// The native splash screen (SplashScreen.preventAutoHideAsync, called in
// _layout.tsx) stays up the whole time since nothing here calls
// hideAsync() — AnimatedSplashOverlay does that once it mounts, which only
// happens after migrations succeed.
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { db } from './client';
import migrations from './migrations/migrations';
import type * as schema from './schema';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

export function MigrationGate({ children }: { children: React.ReactNode }) {
  // `db` is typed as the driver-agnostic `Database` (see db/types.ts) so
  // query functions also work against the better-sqlite3 test db, but
  // useMigrations is expo-sqlite-specific and wants its concrete
  // ExpoSQLiteDatabase type (SQLiteRunResult, not the agnostic `unknown`).
  // This module only ever runs against the real expo-sqlite client
  // (see db/client.ts), so the cast is safe.
  const { success, error } = useMigrations(db as ExpoSQLiteDatabase<typeof schema>, migrations);

  useEffect(() => {
    if (error) {
      // Surface the failure instead of hanging behind the splash screen.
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [error]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Database migration failed</Text>
        <Text style={styles.message}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return null;
  }

  return children;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
  },
});
