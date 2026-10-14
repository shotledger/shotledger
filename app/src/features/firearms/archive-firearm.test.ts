// What archiving does on the device beyond the row (#799): reminders stop,
// and come back for the latest licence on restore.
import { archiveFirearmAndReminders, restoreFirearmAndReminders } from './archive-firearm';

jest.mock('@/db/client', () => ({ db: {} }));

const mockArchive = jest.fn();
const mockRestore = jest.fn();
jest.mock('@/db/queries/firearms', () => ({
  archiveFirearm: (...args: unknown[]) => mockArchive(...args),
  restoreFirearm: (...args: unknown[]) => mockRestore(...args),
}));

const mockListLicenses = jest.fn();
const mockLatestLicense = jest.fn();
jest.mock('@/db/queries/licenses', () => ({
  listLicenses: (...args: unknown[]) => mockListLicenses(...args),
  latestLicense: (...args: unknown[]) => mockLatestLicense(...args),
}));

const mockCancel = jest.fn();
const mockSchedule = jest.fn();
jest.mock('@/platform/notifications', () => ({
  cancelLicenseExpiryNotifications: (...args: unknown[]) => mockCancel(...args),
  scheduleLicenseExpiryNotifications: (...args: unknown[]) => mockSchedule(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('archiveFirearmAndReminders', () => {
  it("archives the firearm and cancels every licence's reminders", async () => {
    mockListLicenses.mockReturnValue([{ id: 'lic-new' }, { id: 'lic-old' }]);
    await archiveFirearmAndReminders('f1');
    expect(mockArchive).toHaveBeenCalledWith({}, 'f1');
    expect(mockCancel.mock.calls).toEqual([
      ['lic-new', [90, 30, 7]],
      ['lic-old', [90, 30, 7]],
    ]);
  });
});

describe('restoreFirearmAndReminders', () => {
  it("schedules the latest licence's reminders again", async () => {
    mockRestore.mockReturnValue({ id: 'f1', make: 'Pardini', model: 'SP' });
    mockLatestLicense.mockReturnValue({ id: 'lic-new', validUntil: null });
    await restoreFirearmAndReminders('f1');
    expect(mockSchedule).toHaveBeenCalledWith('lic-new', 'Pardini SP', []);
  });

  it('schedules nothing for a firearm with no licence', async () => {
    mockRestore.mockReturnValue({ id: 'f1', make: 'Pardini', model: 'SP' });
    mockLatestLicense.mockReturnValue(undefined);
    await restoreFirearmAndReminders('f1');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('does nothing more when the firearm is gone', async () => {
    mockRestore.mockReturnValue(undefined);
    await restoreFirearmAndReminders('f1');
    expect(mockLatestLicense).not.toHaveBeenCalled();
  });
});
