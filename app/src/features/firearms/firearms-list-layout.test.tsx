// The Firearms list row (#846): its statuses go on their own wrapping line
// under the name, so a row with three of them never squeezes the name until
// it breaks mid-word ("Manu / rhin").
import { screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import FirearmsScreen from '@/app/(tabs)/firearms';
import { createFirearm } from '@/db/queries/firearms';
import { renderWithProviders } from '@/test-utils/render';
import { resetTestDb } from '@/test-utils/test-db-client';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);
// Keep the native notifications module out; this test schedules nothing.
jest.mock('@/platform/notifications', () => ({ replaceMaintenanceTimeReminders: jest.fn() }));

/** The nearest host View holding `node`. */
type Node = ReturnType<typeof screen.getByText>;
function hostViewOf(node: Node): Node {
  let current: Node | null = node.parent as Node | null;
  while (current && current.type !== 'View') current = current.parent as Node | null;
  if (!current) throw new Error('no host View above the node');
  return current;
}

it('puts the statuses on a wrapping line under the name, not beside it (#846)', async () => {
  const db = resetTestDb();
  createFirearm(db, {
    make: 'Manurhin',
    model: 'MR73 Sport',
    weaponType: 'revolver',
    roundCount: 950,
    maintenanceIntervalRounds: 1000,
  });
  await renderWithProviders(<FirearmsScreen />);

  const name = screen.getByText('Manurhin MR73 Sport');
  // The name is never cut to one line, and so never ends in an ellipsis.
  expect(name.props.numberOfLines).toBeUndefined();

  const status = screen.getByText('Due Soon');
  // The status sits in the name's own column, below it.
  expect(within(hostViewOf(name)).getByText('Due Soon')).toBe(status);
  // Its line wraps whole statuses onto the next row rather than shrinking any.
  let line = hostViewOf(status);
  while (StyleSheet.flatten(line.props.style)?.flexWrap !== 'wrap') {
    line = hostViewOf(line);
  }
  expect(StyleSheet.flatten(line.props.style).flexDirection).toBe('row');
});
