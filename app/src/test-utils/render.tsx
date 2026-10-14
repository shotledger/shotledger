// One `render` for component tests: the providers every screen expects, in
// English, at a fixed phone size. A screen test reads:
//
//   jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
//   jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
//   jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);
//
//   beforeEach(() => { db = resetTestDb(); });  // seed with the real queries
//   await renderWithProviders(<NewFirearmScreen />);
//
// `jest.mock` is hoisted only within the file it is written in, so those
// lines stay in each test. The worklets mock is what lets reanimated load
// under Jest; anything rendering `@/db/client` (AppSettingsProvider does)
// needs the DB one.
//
// Screen tests live beside their feature, never under `src/app/`: expo-router
// bundles every file there as a route, tests included.
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import i18n from '@/i18n';
import { AppSettingsProvider } from '@/state/app-settings';

/** A 360x800 dp phone with a status bar and a gesture bar. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppSettingsProvider>{children}</AppSettingsProvider>
    </SafeAreaProvider>
  );
}

/** Renders `ui` inside the app's providers, with the UI in English. */
export async function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  await i18n.changeLanguage('en');
  return render(ui, { wrapper: Providers, ...options });
}
