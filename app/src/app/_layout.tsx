import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { MigrationGate } from '@/db/migration-gate';
import '@/i18n';
import { AppSettingsProvider } from '@/state/app-settings';

SplashScreen.preventAutoHideAsync();

// Hosts the (tabs) group inside a Stack alongside modal-stacked session
// routes and dev routes — fixes the M1-reported gap where non-tab routes
// had no host (the root layout rendered only the tab navigator).
function RootStack() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="session/new"
        options={{ presentation: 'modal', headerShown: true, title: t('session.newTitle') }}
      />
      <Stack.Screen
        name="session/[id]/index"
        options={{ presentation: 'modal', headerShown: true, title: t('session.detailTitle') }}
      />
      <Stack.Screen
        name="session/[id]/series/[pos]"
        options={{ presentation: 'modal', headerShown: true, title: t('session.detailTitle') }}
      />
      <Stack.Screen
        name="firearms/new"
        options={{ presentation: 'modal', headerShown: true, title: t('firearms.newFirearm') }}
      />
      <Stack.Screen
        name="firearms/[id]/index"
        options={{ presentation: 'modal', headerShown: true, title: t('firearms.detailTitle') }}
      />
      <Stack.Screen
        name="firearms/[id]/edit"
        options={{ presentation: 'modal', headerShown: true, title: t('firearms.editFirearm') }}
      />
      <Stack.Screen
        name="ammo/new"
        options={{ presentation: 'modal', headerShown: true, title: t('ammo.newLot') }}
      />
      <Stack.Screen
        name="ammo/[id]/index"
        options={{ presentation: 'modal', headerShown: true, title: t('ammo.editLot') }}
      />
      <Stack.Screen name="dev" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <MigrationGate>
        <AppSettingsProvider>
          <AnimatedSplashOverlay />
          <RootStack />
        </AppSettingsProvider>
      </MigrationGate>
    </ThemeProvider>
  );
}
