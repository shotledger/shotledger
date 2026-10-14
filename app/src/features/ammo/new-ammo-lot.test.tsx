// The new-ammo-lot form against a real (in-memory) database: the required
// label, factory versus handload fields, the derived power factor and muzzle
// energy, and what Create stores.
import { fireEvent, screen } from '@testing-library/react-native';

import NewAmmoLotScreen from '@/app/ammo/new';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import type { Database } from '@/db/types';
import { renderWithProviders } from '@/test-utils/render';
import { mockRouter } from '@/test-utils/router-mock';
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

/** Unfolds "Details", where the optional fields live (#822). */
async function openDetails() {
  const toggle = screen.queryByTestId('ammo-details');
  if (toggle) await fireEvent.press(toggle);
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

const create = () => screen.getByRole('button', { name: 'Create Ammo Lot' });

describe('New ammo lot', () => {
  it('leads with label, caliber and quantity and folds the rest under Details', async () => {
    await renderWithProviders(<NewAmmoLotScreen />);

    expect(screen.getByLabelText('Label')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quantity')).toHaveProp('placeholder', 'Optional');
    expect(screen.queryByLabelText('Brand')).toBeNull();
    expect(screen.queryByTestId('handload-toggle')).toBeNull();

    await openDetails();
    expect(screen.getByLabelText('Brand')).toHaveProp('placeholder', 'Optional');
    expect(screen.getByTestId('handload-toggle')).toBeOnTheScreen();
  });

  it('cannot be created without a label', async () => {
    await renderWithProviders(<NewAmmoLotScreen />);
    await openDetails();
    expect(create()).toBeDisabled();

    await type('Label', '   ');
    expect(create()).toBeDisabled();
    await fireEvent.press(create());
    expect(listAmmoLots(db)).toHaveLength(0);

    await type('Label', 'Practice box');
    expect(create()).toBeEnabled();
  });

  it('stores a factory lot, numbers parsed and text trimmed', async () => {
    await renderWithProviders(<NewAmmoLotScreen />);
    await openDetails();

    await type('Label', ' Practice box ');
    await fireEvent.press(screen.getByTestId('caliber-toggle'));
    await fireEvent.press(screen.getByTestId('caliber-option-.22 LR'));
    await type('Quantity', '500');
    await type('Purchased On', '2026-05-01');
    await type('Brand', 'Acme');
    await type('Product', 'Club Match');
    await type('Lot Number', 'L-0001');
    await type('Bullet Weight (gr)', '40');
    await type('Velocity (m/s)', '330');
    await fireEvent.press(create());

    expect(listAmmoLots(db)).toEqual([
      expect.objectContaining({
        label: 'Practice box',
        caliber: '.22 LR',
        quantity: 500,
        purchasedOn: '2026-05-01',
        isHandload: 0,
        brand: 'Acme',
        product: 'Club Match',
        lotNumber: 'L-0001',
        bulletWeightGr: 40,
        velocityMps: 330,
        powder: null,
        powderChargeGr: null,
        notes: null,
      }),
    ]);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('stores nothing for a number field holding text', async () => {
    await renderWithProviders(<NewAmmoLotScreen />);
    await openDetails();

    await type('Label', 'Practice box');
    await type('Quantity', 'a box');
    await type('Bullet Weight (gr)', 'heavy');
    await fireEvent.press(create());

    expect(listAmmoLots(db)[0]).toMatchObject({ quantity: null, bulletWeightGr: null });
  });

  it('shows power factor and muzzle energy once weight and velocity are both in', async () => {
    await renderWithProviders(<NewAmmoLotScreen />);
    await openDetails();
    expect(screen.queryByText('Power Factor')).toBeNull();

    await type('Bullet Weight (gr)', '124');
    expect(screen.queryByText('Power Factor')).toBeNull();

    await type('Velocity (m/s)', '350');
    expect(screen.getByTestId('ammo-power-factor')).toHaveTextContent('142');
    expect(screen.getByTestId('ammo-muzzle-energy')).toHaveTextContent('492.1 J');

    await type('Velocity (m/s)', '');
    expect(screen.queryByTestId('ammo-power-factor')).toBeNull();
  });

  describe('handloads', () => {
    it('swaps the factory fields for the recipe', async () => {
      await renderWithProviders(<NewAmmoLotScreen />);
      await openDetails();
      expect(screen.getByLabelText('Brand')).toBeOnTheScreen();
      expect(screen.queryByText('Handload Recipe')).toBeNull();

      await fireEvent(screen.getByTestId('handload-toggle'), 'valueChange', true);

      expect(screen.queryByLabelText('Brand')).toBeNull();
      expect(screen.queryByLabelText('Lot Number')).toBeNull();
      expect(screen.getByText('Handload Recipe')).toBeOnTheScreen();
      expect(screen.getByLabelText('Powder')).toBeOnTheScreen();
    });

    it('stores the recipe and drops factory fields typed before switching', async () => {
      await renderWithProviders(<NewAmmoLotScreen />);
      await openDetails();

      await type('Label', 'Load 1');
      await type('Brand', 'Acme');
      await fireEvent(screen.getByTestId('handload-toggle'), 'valueChange', true);
      await type('Powder', 'Test Powder');
      await type('Powder Charge (gr)', '4.2');
      await type('Primer', 'Small pistol');
      await type('Brass', 'Mixed');
      await type('Cartridge Overall Length (mm)', '29.5');
      await type('Crimp (mm)', '9.6');
      await fireEvent.press(create());

      expect(listAmmoLots(db)[0]).toMatchObject({
        label: 'Load 1',
        isHandload: 1,
        brand: null,
        product: null,
        lotNumber: null,
        powder: 'Test Powder',
        powderChargeGr: 4.2,
        primer: 'Small pistol',
        brass: 'Mixed',
        colMm: 29.5,
        crimpMm: 9.6,
      });
    });

    it('drops the recipe typed before switching back to factory', async () => {
      await renderWithProviders(<NewAmmoLotScreen />);
      await openDetails();

      await type('Label', 'Practice box');
      await fireEvent(screen.getByTestId('handload-toggle'), 'valueChange', true);
      await type('Powder', 'Test Powder');
      await fireEvent(screen.getByTestId('handload-toggle'), 'valueChange', false);
      await fireEvent.press(create());

      expect(listAmmoLots(db)[0]).toMatchObject({ isHandload: 0, powder: null });
    });

    it('hides the switch when handloads are turned off in Settings', async () => {
      setSetting(db, SETTINGS_KEYS.trackHandloads, false);
      await renderWithProviders(<NewAmmoLotScreen />);
      await openDetails();

      expect(screen.queryByTestId('handload-toggle')).toBeNull();
      expect(screen.queryByText('Handload')).toBeNull();
      expect(screen.getByLabelText('Brand')).toBeOnTheScreen();
    });
  });
});
