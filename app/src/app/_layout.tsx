import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { MigrationGate } from '@/db/migration-gate';
import { SyncTriggers } from '@/features/sync/sync-triggers';
import { useResolvedThemeName, useTheme } from '@/hooks/use-theme';
import '@/i18n';
import { AppSettingsProvider } from '@/state/app-settings';

SplashScreen.preventAutoHideAsync();

// Hosts the (tabs) group inside a Stack alongside modal-stacked session
// routes and dev routes — fixes the M1-reported gap where non-tab routes
// had no host (the root layout rendered only the tab navigator).
//
// headerStyle/headerTintColor come from the app's theme tokens (not React
// Navigation's own light/dark palette) so modal headers stay in the dark
// "Purple Rain" theme instead of defaulting to white — flagged at theme time.
function RootStack() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: theme.backgroundElement },
        headerTintColor: theme.text,
      }}
    >
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
        name="session/[id]/edit"
        options={{ presentation: 'modal', headerShown: true, title: t('session.editTitle') }}
      />
      <Stack.Screen
        name="session/[id]/scan"
        options={{ presentation: 'modal', headerShown: true, title: t('photoScoring.title') }}
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
      <Stack.Screen
        name="timer"
        options={{ presentation: 'modal', headerShown: true, title: t('timer.title') }}
      />
      <Stack.Screen
        name="shot-diagnostics"
        options={{ presentation: 'modal', headerShown: true, title: t('shotDiagnostics.title') }}
      />
      <Stack.Screen
        name="account"
        options={{ presentation: 'modal', headerShown: true, title: t('account.title') }}
      />
      <Stack.Screen
        name="vault/index"
        options={{ presentation: 'modal', headerShown: true, title: t('vault.title') }}
      />
      <Stack.Screen
        name="vault/add"
        options={{ presentation: 'modal', headerShown: true, title: t('vault.addTitle') }}
      />
      <Stack.Screen
        name="vault/[id]"
        options={{ presentation: 'modal', headerShown: true, title: t('vault.title') }}
      />
      <Stack.Screen
        name="about/licenses"
        options={{ presentation: 'modal', headerShown: true, title: t('about.licensesTitle') }}
      />
      <Stack.Screen
        name="ammo/compare"
        options={{ presentation: 'modal', headerShown: true, title: t('ammo.compareTitle') }}
      />
      <Stack.Screen
        name="stats/records"
        options={{ presentation: 'modal', headerShown: true, title: t('webshooter.recordsTitle') }}
      />
      <Stack.Screen
        name="stats/report"
        options={{ presentation: 'modal', headerShown: true, title: t('stats.reportTitle') }}
      />
      <Stack.Screen name="dev" />
    </Stack>
  );
}

// Wraps RootStack with a React Navigation Theme built from the app's own
// theme tokens (light or "Purple Rain" dark), keyed by the app's theme
// setting rather than the raw device scheme — resolved by useResolvedThemeName.
function ThemedApp() {
  const theme = useTheme();
  const resolvedThemeName = useResolvedThemeName();
  const base = resolvedThemeName === 'dark' ? DarkTheme : DefaultTheme;

  const navigationTheme = useMemo<Theme>(
    () => ({
      ...base,
      dark: resolvedThemeName === 'dark',
      colors: {
        ...base.colors,
        primary: theme.primary,
        background: theme.background,
        card: theme.backgroundElement,
        text: theme.text,
        border: theme.border,
        notification: theme.danger,
      },
    }),
    [base, resolvedThemeName, theme],
  );

  return (
    <ThemeProvider value={navigationTheme}>
      <AnimatedSplashOverlay />
      <SyncTriggers />
      <RootStack />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    // Required by react-native-gesture-handler (Swipeable et al. — first
    // used by the session detail series list's swipe-to-delete); expo-router
    // does not add this wrapper itself.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MigrationGate>
        <AppSettingsProvider>
          <ThemedApp />
        </AppSettingsProvider>
      </MigrationGate>
    </GestureHandlerRootView>
  );
}
