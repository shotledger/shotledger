// What archiving does on the device beyond the row (#799): both reminder sets
// are rebuilt, and they leave out archived firearms (#800, #847).
import { archiveFirearmAndReminders, restoreFirearmAndReminders } from './archive-firearm';

jest.mock('@/db/client', () => ({ db: {} }));

const mockArchive = jest.fn();
const mockRestore = jest.fn();
jest.mock('@/db/queries/firearms', () => ({
  archiveFirearm: (...args: unknown[]) => mockArchive(...args),
  restoreFirearm: (...args: unknown[]) => mockRestore(...args),
}));

const mockRefreshLicense = jest.fn();
jest.mock('./license-reminders', () => ({
  refreshLicenseExpiryReminders: (...args: unknown[]) => mockRefreshLicense(...args),
}));

const mockRefreshMaintenance = jest.fn();
jest.mock('./maintenance', () => ({
  refreshMaintenanceTimeReminders: (...args: unknown[]) => mockRefreshMaintenance(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('archiveFirearmAndReminders', () => {
  it('archives the firearm and rebuilds both reminder sets without prompting', async () => {
    await archiveFirearmAndReminders('f1');
    expect(mockArchive).toHaveBeenCalledWith({}, 'f1');
    expect(mockRefreshLicense).toHaveBeenCalledWith({ request: false });
    expect(mockRefreshMaintenance).toHaveBeenCalledWith({ request: false });
  });
});

describe('restoreFirearmAndReminders', () => {
  it('restores the firearm and rebuilds both reminder sets', async () => {
    mockRestore.mockReturnValue({ id: 'f1', make: 'Pardini', model: 'SP' });
    await restoreFirearmAndReminders('f1');
    expect(mockRefreshLicense).toHaveBeenCalledWith({ request: false });
    expect(mockRefreshMaintenance).toHaveBeenCalledWith({ request: false });
  });

  it('does nothing more when the firearm is gone', async () => {
    mockRestore.mockReturnValue(undefined);
    await restoreFirearmAndReminders('f1');
    expect(mockRefreshLicense).not.toHaveBeenCalled();
    expect(mockRefreshMaintenance).not.toHaveBeenCalled();
  });
});
