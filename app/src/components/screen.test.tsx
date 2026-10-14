// The strip a FAB screen reserves at the bottom of its scroll content follows
// the button's measured height, so a larger system font cannot push the
// button over the last row (Home's "See all", #823).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FAB, FabClearance, fabClearanceFor } from '@/components/fab';
import { Screen } from '@/components/screen';
import { AppSettingsProvider } from '@/state/app-settings';

jest.mock('@/db/client', () => ({ db: {}, rawDb: {} }));
jest.mock('@/db/queries/settings', () => ({
  SETTINGS_KEYS: { theme: 'theme', language: 'language' },
  getSetting: (_db: unknown, _key: string, fallback: unknown) => fallback,
  setSetting: jest.fn(),
}));

/** The scroll view's content padding, found by walking up from the content. */
function bottomPadding(): number | undefined {
  let node = screen.getByText('See all 37').parent;
  while (node && node.props.contentContainerStyle === undefined) node = node.parent;
  const style = StyleSheet.flatten(node?.props.contentContainerStyle) as { paddingBottom?: number };
  return style.paddingBottom;
}

async function renderFabScreen() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AppSettingsProvider>
        <Screen fab={<FAB label="New Session" testID="fab" />}>
          <Text>See all 37</Text>
        </Screen>
      </AppSettingsProvider>
    </SafeAreaProvider>,
  );
}

it('reserves the estimated clearance before the button is measured', async () => {
  await renderFabScreen();
  expect(bottomPadding()).toBe(FabClearance);
});

it('reserves room for the measured button when it is taller than the estimate', async () => {
  await renderFabScreen();
  await fireEvent(screen.getByTestId('fab'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 88 } },
  });
  expect(bottomPadding()).toBe(fabClearanceFor(88));
  expect(fabClearanceFor(88)).toBeGreaterThan(FabClearance);
});
