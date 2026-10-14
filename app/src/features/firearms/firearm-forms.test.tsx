// The new- and edit-firearm forms against a real (in-memory) database: which
// fields are required, what the defaults are, and what Save stores.
import { fireEvent, screen } from '@testing-library/react-native';

import EditFirearmScreen from '@/app/firearms/[id]/edit';
import NewFirearmScreen from '@/app/firearms/new';
import { createFirearm, getFirearm, listFirearms } from '@/db/queries/firearms';
import type { Database } from '@/db/types';
import { renderWithProviders } from '@/test-utils/render';
import { mockRouter, setSearchParams } from '@/test-utils/router-mock';
import { resetTestDb } from '@/test-utils/test-db-client';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

let db: Database;

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-05-16T10:00:00.000Z'),
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
  jest.clearAllMocks();
  db = resetTestDb();
});

afterEach(() => {
  jest.useRealTimers();
});

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

describe('New firearm', () => {
  const create = () => screen.getByRole('button', { name: 'Create Firearm' });

  it('cannot be created until both make and model are filled in', async () => {
    await renderWithProviders(<NewFirearmScreen />);
    expect(create()).toBeDisabled();

    await type('Make', 'Acme');
    expect(create()).toBeDisabled();

    await type('Model', 'Target 22');
    expect(create()).toBeEnabled();

    await type('Make', '');
    expect(create()).toBeDisabled();
  });

  it('treats a blank make or model as missing', async () => {
    await renderWithProviders(<NewFirearmScreen />);

    await type('Make', '   ');
    await type('Model', 'Target 22');
    expect(create()).toBeDisabled();

    await fireEvent.press(create());
    expect(listFirearms(db)).toHaveLength(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('defaults to an own pistol', async () => {
    await renderWithProviders(<NewFirearmScreen />);

    expect(screen.getByRole('button', { name: 'Pistol' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'My Own' })).toBeSelected();
    expect(screen.getByTestId('load-system-unset')).toBeSelected();
  });

  it('stores a minimal firearm, trimmed, with optional fields empty', async () => {
    await renderWithProviders(<NewFirearmScreen />);

    await type('Make', '  Acme ');
    await type('Model', ' Target 22  ');
    await fireEvent.press(create());

    const [firearm] = listFirearms(db);
    expect(firearm).toMatchObject({
      make: 'Acme',
      model: 'Target 22',
      caliber: null,
      weaponType: 'pistol',
      isOwn: true,
      serialNumber: null,
      vapenId: null,
      loadSystem: null,
      notes: null,
      maintenanceIntervalRounds: null,
      roundCount: 0,
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(`/firearms/${firearm!.id}`);
  });

  it('stores every field the form offers', async () => {
    await renderWithProviders(<NewFirearmScreen />);

    await type('Make', 'Acme');
    await type('Model', 'Long 22');
    await fireEvent.press(screen.getByTestId('caliber-toggle'));
    await fireEvent.press(screen.getByTestId('caliber-option-.22 LR'));
    await fireEvent.press(screen.getByRole('button', { name: 'Rifle' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Borrowed' }));
    await type('Serial Number', 'SN-0001');
    await type('National Register ID', 'TEST-0001');
    await fireEvent.press(screen.getByTestId('load-system-bolt_action'));
    await type('Maintenance Interval (rounds)', '500');
    await type('Notes', 'Club rifle');
    await fireEvent.press(create());

    expect(listFirearms(db)[0]).toMatchObject({
      make: 'Acme',
      model: 'Long 22',
      caliber: '.22 LR',
      weaponType: 'rifle',
      isOwn: false,
      serialNumber: 'SN-0001',
      vapenId: 'TEST-0001',
      loadSystem: 'bolt_action',
      notes: 'Club rifle',
      maintenanceIntervalRounds: 500,
    });
  });

  it('shows the picked caliber and can clear it again', async () => {
    await renderWithProviders(<NewFirearmScreen />);
    expect(screen.getByText('Select a caliber')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('caliber-toggle'));
    await fireEvent.changeText(screen.getByTestId('caliber-search'), '9×19');
    expect(screen.queryByTestId('caliber-option-.22 LR')).toBeNull();
    await fireEvent.press(screen.getByTestId('caliber-option-9×19 mm'));
    expect(screen.getByTestId('caliber-toggle')).toHaveTextContent('9×19 mm');

    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Select a caliber')).toBeOnTheScreen();
  });

  it.each(['often', '-50', '1.5', '0'])(
    'refuses an interval the detail screen would refuse (%s)',
    async (interval) => {
      await renderWithProviders(<NewFirearmScreen />);

      await type('Make', 'Acme');
      await type('Model', 'Target 22');
      await type('Maintenance Interval (rounds)', interval);
      expect(
        screen.getByText('Enter a whole number of rounds, or leave it empty.'),
      ).toBeOnTheScreen();
      await fireEvent.press(create());

      expect(listFirearms(db)).toHaveLength(0);
    },
  );

  it('stores a positive whole-number interval', async () => {
    await renderWithProviders(<NewFirearmScreen />);

    await type('Make', 'Acme');
    await type('Model', 'Target 22');
    await type('Maintenance Interval (rounds)', ' 500 ');
    await fireEvent.press(create());

    expect(listFirearms(db)[0]!.maintenanceIntervalRounds).toBe(500);
  });
});

describe('Edit firearm', () => {
  function seeded() {
    return createFirearm(db, {
      make: 'Acme',
      model: 'Target 22',
      caliber: '.22 LR',
      weaponType: 'pistol',
      isOwn: true,
      serialNumber: 'SN-0002',
      loadSystem: 'semi_automatic',
      notes: 'Competition pistol',
    });
  }

  async function openEdit(id: string) {
    setSearchParams({ id });
    await renderWithProviders(<EditFirearmScreen />);
  }

  it('opens with the stored values', async () => {
    const firearm = seeded();
    await openEdit(firearm.id);

    expect(screen.getByLabelText('Make')).toHaveDisplayValue('Acme');
    expect(screen.getByLabelText('Model')).toHaveDisplayValue('Target 22');
    expect(screen.getByTestId('caliber-toggle')).toHaveTextContent('.22 LR');
    expect(screen.getByRole('button', { name: 'Pistol' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'My Own' })).toBeSelected();
    expect(screen.getByLabelText('Serial Number')).toHaveDisplayValue('SN-0002');
    expect(screen.getByTestId('load-system-semi_automatic')).toBeSelected();
    expect(screen.getByLabelText('Notes')).toHaveDisplayValue('Competition pistol');
  });

  it('saves the changes and clears emptied optional fields', async () => {
    const firearm = seeded();
    await openEdit(firearm.id);

    await type('Model', 'Target 22 Mk II');
    await fireEvent.press(screen.getByRole('button', { name: 'Borrowed' }));
    await type('Serial Number', '  ');
    await fireEvent.press(screen.getByTestId('load-system-unset'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(getFirearm(db, firearm.id)).toMatchObject({
      make: 'Acme',
      model: 'Target 22 Mk II',
      caliber: '.22 LR',
      isOwn: false,
      serialNumber: null,
      loadSystem: null,
      notes: 'Competition pistol',
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('shows only the title for a firearm that does not exist', async () => {
    await openEdit('no-such-firearm');

    expect(screen.getByText('Edit Firearm')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Make')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it.each(['Make', 'Model'])('refuses to save a blank %s', async (label) => {
    const firearm = seeded();
    await openEdit(firearm.id);

    await type(label, '  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(getFirearm(db, firearm.id)).toMatchObject({ make: 'Acme', model: 'Target 22' });
  });
});
