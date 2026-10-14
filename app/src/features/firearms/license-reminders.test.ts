// License expiry reminders are rebuilt from the database (#847): the latest
// license of each active firearm, future reminders only.
import { archiveFirearm, createFirearm } from '@/db/queries/firearms';
import { addLicense } from '@/db/queries/licenses';
import type { Database } from '@/db/types';
import { resetTestDb } from '@/test-utils/test-db-client';

import { licenseExpiryReminders, refreshLicenseExpiryReminders } from './license-reminders';

jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const mockReplace = jest.fn();
jest.mock('@/platform/notifications', () => ({
  replaceLicenseExpiryReminders: (...args: unknown[]) => mockReplace(...args),
}));

const NOW = new Date(2026, 9, 14, 12);
let db: Database;

beforeEach(() => {
  jest.clearAllMocks();
  db = resetTestDb();
});

function summary(database: Database) {
  return licenseExpiryReminders(database, NOW).map((r) => [
    r.firearmLabel,
    r.licenseId,
    r.notification.leadDays,
  ]);
}

describe('licenseExpiryReminders', () => {
  it('gives the 90/30/7-day reminders for a license with an end date', () => {
    const firearm = createFirearm(db, { make: 'Demo', model: 'Pistol' });
    const license = addLicense(db, { firearmId: firearm.id, validUntil: '2027-07-11' });
    expect(summary(db)).toEqual([
      ['Demo Pistol', license.id, 90],
      ['Demo Pistol', license.id, 30],
      ['Demo Pistol', license.id, 7],
    ]);
  });

  it('uses only the latest license, so a renewed one leaves no reminder behind', () => {
    const firearm = createFirearm(db, { make: 'Demo', model: 'Pistol' });
    addLicense(db, { firearmId: firearm.id, validUntil: '2027-01-01' });
    const renewed = addLicense(db, { firearmId: firearm.id, validUntil: '2031-01-01' });
    expect(new Set(summary(db).map(([, id]) => id))).toEqual(new Set([renewed.id]));
  });

  it('gives none for tills vidare, no license, an archived firearm or a past date', () => {
    addLicense(db, { firearmId: createFirearm(db, { make: 'A', model: 'B' }).id });
    createFirearm(db, { make: 'C', model: 'D' });
    const archived = createFirearm(db, { make: 'E', model: 'F' });
    addLicense(db, { firearmId: archived.id, validUntil: '2027-07-11' });
    archiveFirearm(db, archived.id);
    addLicense(db, {
      firearmId: createFirearm(db, { make: 'G', model: 'H' }).id,
      validUntil: '2026-10-01',
    });
    expect(summary(db)).toEqual([]);
  });

  it('keeps the reminders still ahead when the first has passed', () => {
    const firearm = createFirearm(db, { make: 'Demo', model: 'Pistol' });
    addLicense(db, { firearmId: firearm.id, validUntil: '2026-11-30' });
    expect(summary(db).map(([, , days]) => days)).toEqual([30, 7]);
  });
});

it('refreshLicenseExpiryReminders replaces the whole set and passes the permission choice on', async () => {
  const firearm = createFirearm(db, { make: 'Demo', model: 'Pistol' });
  addLicense(db, { firearmId: firearm.id, validUntil: '2030-07-11' });
  await refreshLicenseExpiryReminders({ request: true });
  expect(mockReplace).toHaveBeenCalledTimes(1);
  const [reminders, options] = mockReplace.mock.calls[0];
  expect(reminders).toHaveLength(3);
  expect(options).toEqual({ request: true });
});
