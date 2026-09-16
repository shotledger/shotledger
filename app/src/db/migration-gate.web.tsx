// Web counterpart of migration-gate.tsx: first opens the OPFS-backed
// connection asynchronously (see client.web.ts for why it cannot be opened
// at import time), then runs the same Drizzle migrations.
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { db, openWebDatabase } from './client.web';
import migrations from './migrations/migrations';
import type * as schema from './schema';

export function MigrationGate({ children }: { children: React.ReactNode }) {
  const [opened, setOpened] = useState(false);
  const [openError, setOpenError] = useState<Error | null>(null);

  useEffect(() => {
    openWebDatabase().then(
      () => setOpened(true),
      (err: unknown) => setOpenError(err instanceof Error ? err : new Error(String(err))),
    );
  }, []);

  if (openError) return <Failure message={openError.message} />;
  if (!opened) return null;
  return <Migrate>{children}</Migrate>;
}

function Migrate({ children }: { children: React.ReactNode }) {
  // Same cast as migration-gate.tsx: useMigrations wants the concrete driver type.
  const { success, error } = useMigrations(db as ExpoSQLiteDatabase<typeof schema>, migrations);
  if (error) return <Failure message={error.message} />;
  if (!success) return null;
  return children;
}

function Failure({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Database migration failed</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
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
