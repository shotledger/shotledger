// License Check's overview and its two details against a real (in-memory)
// database: the yes/no answers and where each row leads.
import { fireEvent, screen } from '@testing-library/react-native';

import FirearmCheckScreen from '@/app/compliance/firearm/[id]';
import LicenseCheckScreen from '@/app/compliance/index';
import NewFirearmCheckScreen from '@/app/compliance/new-firearm';
import { createFirearm } from '@/db/queries/firearms';
import { addLicense } from '@/db/queries/licenses';
import { setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import type { Database } from '@/db/types';
import { renderWithProviders } from '@/test-utils/render';
import { mockRouter, setSearchParams } from '@/test-utils/router-mock';
import { resetTestDb } from '@/test-utils/test-db-client';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

// The first render compiles the screen's module graph.
jest.setTimeout(30_000);

let db: Database;
let pistolId: string;
let rifleId: string;

// The dates below follow from "today", so fake only the clock: the firearms are
// created on 2026-10-14 and the timers the screens use stay real.
const TODAY = new Date('2026-10-14T10:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers({
    now: TODAY,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  jest.clearAllMocks();
  db = resetTestDb();
  setSetting(db, SETTINGS_KEYS.complianceProfile, 'se');
  pistolId = createFirearm(db, { make: 'Demo', model: 'Pistol', weaponType: 'pistol' }).id;
  rifleId = createFirearm(db, { make: 'Demo', model: 'Rifle', weaponType: 'rifle' }).id;
  addLicense(db, { firearmId: rifleId, validUntil: '2030-01-01' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('License Check overview', () => {
  it('answers no for a new firearm and counts what is missing', async () => {
    await renderWithProviders(<LicenseCheckScreen />);
    const row = screen.getByTestId('check-new-firearm');
    expect(row).toHaveTextContent(/New Firearm/);
    expect(row).toHaveTextContent(/2 requirements not met\./);
    expect(row).toHaveTextContent(/No$/);

    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith('/compliance/new-firearm');
  });

  it('lists every firearm: renewal yes/no, or not needed without an end date', async () => {
    await renderWithProviders(<LicenseCheckScreen />);
    const rifle = screen.getByTestId(`check-renew-${rifleId}`);
    // Its older year is past and empty, so the answer is when it rolls out.
    expect(rifle).toHaveTextContent(/Can be met from Oct 15, 2027/);
    expect(rifle).toHaveTextContent(/No$/);
    const pistol = screen.getByTestId(`check-renew-${pistolId}`);
    expect(pistol).toHaveTextContent(/never needs renewing/);
    expect(pistol).toHaveTextContent(/Not Needed$/);

    await fireEvent.press(pistol);
    expect(mockRouter.push).toHaveBeenCalledWith(`/compliance/firearm/${pistolId}`);
  });

  it('points to Compliance settings when license activity is off', async () => {
    setSetting(db, SETTINGS_KEYS.complianceProfile, 'none');
    await renderWithProviders(<LicenseCheckScreen />);
    expect(screen.getByTestId('check-off')).toBeOnTheScreen();
    expect(screen.queryByTestId('check-new-firearm')).toBeNull();
  });
});

describe('License Check details', () => {
  it('New Firearm shows the activity rule and the box for the held handgun', async () => {
    await renderWithProviders(<NewFirearmCheckScreen />);
    expect(screen.getByTestId('check-rule-needed-shooter')).toBeOnTheScreen();
    expect(screen.getByTestId(`check-criterion-additionalHandgun-${pistolId}`)).toBeOnTheScreen();
  });

  it('a firearm shows its own boxes and opens the firearm', async () => {
    setSearchParams({ id: pistolId });
    await renderWithProviders(<FirearmCheckScreen />);
    expect(screen.getAllByText('Demo Pistol').length).toBeGreaterThan(0);
    expect(screen.getByTestId('check-no-end-date')).toBeOnTheScreen();
    expect(screen.getByTestId(`check-criterion-additionalHandgun-${pistolId}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`check-firearm-additionalHandgun-${pistolId}`)).toBeNull();

    await fireEvent.press(screen.getByTestId('check-open-firearm'));
    expect(mockRouter.push).toHaveBeenCalledWith(`/firearms/${pistolId}`);
  });

  it('a firearm with a time-limited license shows its renewal box', async () => {
    setSearchParams({ id: rifleId });
    await renderWithProviders(<FirearmCheckScreen />);
    expect(screen.getByTestId(`check-criterion-needed-renewal-${rifleId}`)).toBeOnTheScreen();
  });
});
