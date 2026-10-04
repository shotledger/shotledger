// The glue between the Settings backup rows and the DB/platform calls: which
// status each outcome lands on, what reaches the platform layer, and what is
// written back to the settings table.
import { act, renderHook } from '@testing-library/react-native';

import en from '@/i18n/en.json';

import { useBackupExportImport, type BackupExportOptions } from './use-backup-export-import';

const mockDb = { tag: 'drizzle-db' };
const mockRawDb = { tag: 'raw-db' };
const mockClient: { db: object | null; rawDb: object | null } = { db: mockDb, rawDb: mockRawDb };
jest.mock('@/db/client', () => ({
  get db() {
    return mockClient.db;
  },
  get rawDb() {
    return mockClient.rawDb;
  },
}));

const mockSettings = new Map<string, unknown>();
const mockGetSetting = jest.fn((_db: unknown, key: string, fallback: unknown) =>
  mockSettings.has(key) ? mockSettings.get(key) : fallback,
);
const mockSetSetting = jest.fn((_db: unknown, key: string, value: unknown) => {
  mockSettings.set(key, value);
});
jest.mock('@/db/queries/settings', () => ({
  getSetting: (...args: [unknown, string, unknown]) => mockGetSetting(...args),
  setSetting: (...args: [unknown, string, unknown]) => mockSetSetting(...args),
}));

const mockBuildBackupBundle = jest.fn();
jest.mock('@/db/backup/export-bundle', () => ({
  buildBackupBundle: (...args: unknown[]) => mockBuildBackupBundle(...args),
}));

const mockInspectBundle = jest.fn();
const mockRestoreBundle = jest.fn();
jest.mock('@/db/backup/restore-bundle', () => ({
  inspectBundle: (...args: unknown[]) => mockInspectBundle(...args),
  restoreBundle: (...args: unknown[]) => mockRestoreBundle(...args),
}));

const mockShareBundle = jest.fn();
const mockPickBundleBytes = jest.fn();
jest.mock('@/platform/backup-fs', () => ({
  shareBundle: (...args: unknown[]) => mockShareBundle(...args),
  pickBundleBytes: (...args: unknown[]) => mockPickBundleBytes(...args),
}));

const mockFolder = { supported: true };
const mockPickFolder = jest.fn();
const mockSaveBytesToFolder = jest.fn();
jest.mock('@/platform/save-to-folder', () => ({
  get isFolderSaveSupported() {
    return mockFolder.supported;
  },
  pickFolder: (...args: unknown[]) => mockPickFolder(...args),
  saveBytesToFolder: (...args: unknown[]) => mockSaveBytesToFolder(...args),
}));

// Real i18n, so statusText is checked against the shipped English strings.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
require('@/i18n');

const NOW = new Date(2026, 9, 4, 8, 30, 0);
const BYTES = new Uint8Array([1, 2, 3]);
const SHARE_WITH_PHOTOS: BackupExportOptions = { includePhotos: true, destination: 'share' };
const FOLDER_DB_ONLY: BackupExportOptions = { includePhotos: false, destination: 'folder' };

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.clearAllMocks();
  mockSettings.clear();
  mockClient.db = mockDb;
  mockClient.rawDb = mockRawDb;
  mockFolder.supported = true;
  mockBuildBackupBundle.mockResolvedValue(BYTES);
  mockShareBundle.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderBackupHook() {
  return renderHook(() => useBackupExportImport());
}

describe('initial state', () => {
  it('reads the last backup time and the remembered folder from settings', async () => {
    mockSettings.set('lastBackupAt', '2026-09-01T10:00:00.000Z');
    mockSettings.set('backupFolderUri', 'content://folder/a');

    const { result } = await renderBackupHook();

    expect(result.current.status).toEqual({ kind: 'idle' });
    expect(result.current.statusText).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.lastBackupAt).toBe('2026-09-01T10:00:00.000Z');
    expect(result.current.folderUri).toBe('content://folder/a');
    expect(mockGetSetting).toHaveBeenCalledWith(mockDb, 'lastBackupAt', null);
    expect(mockGetSetting).toHaveBeenCalledWith(mockDb, 'backupFolderUri', null);
  });

  it('starts empty without touching settings when there is no database', async () => {
    mockClient.db = null;

    const { result } = await renderBackupHook();

    expect(result.current.lastBackupAt).toBeNull();
    expect(result.current.folderUri).toBeNull();
    expect(mockGetSetting).not.toHaveBeenCalled();
  });
});

describe('export to the share sheet', () => {
  it('builds the bundle, shares it, and records the backup time', async () => {
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(SHARE_WITH_PHOTOS));

    expect(mockBuildBackupBundle).toHaveBeenCalledWith(mockRawDb, { kind: 'database+photos' });
    expect(mockShareBundle).toHaveBeenCalledWith(
      BYTES,
      'shotledger-backup-with-photos-2026-10-04.shotledger',
    );
    expect(result.current.status).toEqual({ kind: 'export-success' });
    expect(result.current.statusText).toBe(en.backup.exportSuccess);
    expect(result.current.busy).toBe(false);

    const stamp = NOW.toISOString();
    expect(mockSetSetting).toHaveBeenCalledWith(mockDb, 'lastBackupAt', stamp);
    expect(result.current.lastBackupAt).toBe(stamp);
  });

  it('builds a database-only bundle when photos are left out', async () => {
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle({ includePhotos: false, destination: 'share' }));

    expect(mockBuildBackupBundle).toHaveBeenCalledWith(mockRawDb, { kind: 'database' });
    expect(mockShareBundle).toHaveBeenCalledWith(
      BYTES,
      'shotledger-backup-database-2026-10-04.shotledger',
    );
    expect(result.current.status).toEqual({ kind: 'export-success' });
  });

  it('is busy while the bundle is being built', async () => {
    let finishBuild!: (bytes: Uint8Array) => void;
    mockBuildBackupBundle.mockReturnValue(
      new Promise<Uint8Array>((resolve) => {
        finishBuild = resolve;
      }),
    );
    const { result } = await renderBackupHook();

    let pending!: Promise<void>;
    await act(() => {
      pending = result.current.exportBundle(SHARE_WITH_PHOTOS);
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      finishBuild(BYTES);
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });

  it('reports a failed share and leaves the backup time alone', async () => {
    mockShareBundle.mockResolvedValue(false);
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(SHARE_WITH_PHOTOS));

    expect(result.current.status).toEqual({ kind: 'export-failed' });
    expect(result.current.statusText).toBe(en.backup.exportFailed);
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(result.current.lastBackupAt).toBeNull();
  });

  it('reports a bundle that throws while building as an export failure', async () => {
    mockBuildBackupBundle.mockRejectedValue(new Error('VACUUM INTO failed'));
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(SHARE_WITH_PHOTOS));

    expect(result.current.status).toEqual({ kind: 'export-failed' });
    expect(result.current.busy).toBe(false);
    expect(mockShareBundle).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
  });

  it('fails without building anything when there is no database', async () => {
    mockClient.rawDb = null;
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(SHARE_WITH_PHOTOS));

    expect(result.current.status).toEqual({ kind: 'export-failed' });
    expect(mockBuildBackupBundle).not.toHaveBeenCalled();
  });
});

describe('export to a folder', () => {
  it('asks for a folder the first time, remembers it, and saves there', async () => {
    mockPickFolder.mockResolvedValue('content://folder/new');
    mockSaveBytesToFolder.mockResolvedValue(true);
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(FOLDER_DB_ONLY));

    expect(mockPickFolder).toHaveBeenCalledTimes(1);
    expect(mockSaveBytesToFolder).toHaveBeenCalledWith(
      'content://folder/new',
      BYTES,
      'shotledger-backup-database-2026-10-04.shotledger',
    );
    expect(mockShareBundle).not.toHaveBeenCalled();
    expect(mockSetSetting).toHaveBeenCalledWith(mockDb, 'backupFolderUri', 'content://folder/new');
    expect(result.current.folderUri).toBe('content://folder/new');
    expect(result.current.status).toEqual({ kind: 'folder-save-success' });
    expect(result.current.statusText).toBe(en.backup.folderSaveSuccess);
    expect(mockSetSetting).toHaveBeenCalledWith(mockDb, 'lastBackupAt', NOW.toISOString());
  });

  it('reuses a remembered folder without asking again', async () => {
    mockSettings.set('backupFolderUri', 'content://folder/kept');
    mockSaveBytesToFolder.mockResolvedValue(true);
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(FOLDER_DB_ONLY));

    expect(mockPickFolder).not.toHaveBeenCalled();
    expect(mockSaveBytesToFolder).toHaveBeenCalledWith(
      'content://folder/kept',
      BYTES,
      'shotledger-backup-database-2026-10-04.shotledger',
    );
    expect(result.current.folderUri).toBe('content://folder/kept');
    expect(result.current.status).toEqual({ kind: 'folder-save-success' });
  });

  it('reports a canceled folder pick and writes nothing', async () => {
    mockPickFolder.mockResolvedValue(null);
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(FOLDER_DB_ONLY));

    expect(result.current.status).toEqual({ kind: 'folder-save-canceled' });
    expect(result.current.statusText).toBe(en.backup.folderSaveCanceled);
    expect(mockSaveBytesToFolder).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(result.current.lastBackupAt).toBeNull();
  });

  it('forgets a folder that can no longer be written to', async () => {
    mockSettings.set('backupFolderUri', 'content://folder/revoked');
    mockSaveBytesToFolder.mockResolvedValue(false);
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(FOLDER_DB_ONLY));

    expect(result.current.status).toEqual({ kind: 'folder-save-failed' });
    expect(result.current.statusText).toBe(en.backup.folderSaveFailed);
    expect(mockSetSetting).toHaveBeenCalledWith(mockDb, 'backupFolderUri', null);
    expect(mockSetSetting).not.toHaveBeenCalledWith(mockDb, 'lastBackupAt', expect.anything());
    expect(result.current.folderUri).toBeNull();
  });

  it('falls back to the share sheet where folders are unsupported (iOS)', async () => {
    mockFolder.supported = false;
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(FOLDER_DB_ONLY));

    expect(mockPickFolder).not.toHaveBeenCalled();
    expect(mockSaveBytesToFolder).not.toHaveBeenCalled();
    expect(mockShareBundle).toHaveBeenCalledWith(
      BYTES,
      'shotledger-backup-database-2026-10-04.shotledger',
    );
    expect(result.current.status).toEqual({ kind: 'folder-save-ios-fallback' });
    expect(result.current.statusText).toBe(en.backup.folderSaveIosFallback);
    expect(result.current.isFolderSaveSupported).toBe(false);
    expect(mockSetSetting).toHaveBeenCalledWith(mockDb, 'lastBackupAt', NOW.toISOString());
  });

  it('reports a failed iOS fallback share as a folder-save failure', async () => {
    mockFolder.supported = false;
    mockShareBundle.mockResolvedValue(false);
    const { result } = await renderBackupHook();

    await act(() => result.current.exportBundle(FOLDER_DB_ONLY));

    expect(result.current.status).toEqual({ kind: 'folder-save-failed' });
    expect(mockSetSetting).not.toHaveBeenCalled();
  });
});

describe('choosing and forgetting the folder', () => {
  it('replaces the remembered folder with a new pick', async () => {
    mockSettings.set('backupFolderUri', 'content://folder/old');
    mockPickFolder.mockResolvedValue('content://folder/new');
    const { result } = await renderBackupHook();

    await act(() => result.current.changeFolder());

    expect(mockSetSetting).toHaveBeenCalledWith(mockDb, 'backupFolderUri', 'content://folder/new');
    expect(result.current.folderUri).toBe('content://folder/new');
  });

  it('keeps the remembered folder when the pick is canceled', async () => {
    mockSettings.set('backupFolderUri', 'content://folder/old');
    mockPickFolder.mockResolvedValue(null);
    const { result } = await renderBackupHook();

    await act(() => result.current.changeFolder());

    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(result.current.folderUri).toBe('content://folder/old');
  });

  it('forgets the folder on request', async () => {
    mockSettings.set('backupFolderUri', 'content://folder/old');
    const { result } = await renderBackupHook();

    await act(() => result.current.forgetFolder());

    expect(mockSetSetting).toHaveBeenCalledWith(mockDb, 'backupFolderUri', null);
    expect(result.current.folderUri).toBeNull();
  });
});

describe('planning a restore', () => {
  it('reports a canceled pick', async () => {
    mockPickBundleBytes.mockResolvedValue(null);
    const { result } = await renderBackupHook();

    let plan: unknown;
    await act(async () => {
      plan = await result.current.planRestore();
    });

    expect(plan).toBeNull();
    expect(mockInspectBundle).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'restore-canceled' });
    expect(result.current.statusText).toBe(en.backup.restoreCanceled);
  });

  it('rejects a file that is not a backup', async () => {
    mockPickBundleBytes.mockResolvedValue({ name: 'notes.txt', bytes: BYTES });
    mockInspectBundle.mockReturnValue(null);
    const { result } = await renderBackupHook();

    let plan: unknown;
    await act(async () => {
      plan = await result.current.planRestore();
    });

    expect(plan).toBeNull();
    expect(mockInspectBundle).toHaveBeenCalledWith(BYTES);
    expect(result.current.status).toEqual({ kind: 'restore-invalid' });
    expect(result.current.statusText).toBe(en.backup.restoreInvalid);
  });

  it('refuses a backup from a different schema baseline', async () => {
    mockPickBundleBytes.mockResolvedValue({ name: 'b.shotledger', bytes: BYTES });
    mockInspectBundle.mockReturnValue({ manifest: {}, compatibility: 'mismatch' });
    const { result } = await renderBackupHook();

    let plan: unknown;
    await act(async () => {
      plan = await result.current.planRestore();
    });

    expect(plan).toBeNull();
    expect(result.current.status).toEqual({ kind: 'restore-schema-mismatch' });
    expect(result.current.statusText).toBe(en.backup.restoreSchemaMismatch);
    expect(mockRestoreBundle).not.toHaveBeenCalled();
  });

  it('returns the preview and bytes of a valid backup without touching the database', async () => {
    const preview = {
      manifest: { schemaMigrationTag: '0000_baseline', schemaMigrationWhen: 1 },
      compatibility: 'ok',
    };
    mockPickBundleBytes.mockResolvedValue({ name: 'b.shotledger', bytes: BYTES });
    mockInspectBundle.mockReturnValue(preview);
    const { result } = await renderBackupHook();

    let plan: unknown;
    await act(async () => {
      plan = await result.current.planRestore();
    });

    expect(plan).toEqual({ preview, bytes: BYTES });
    expect(result.current.status).toEqual({ kind: 'idle' });
    expect(mockRestoreBundle).not.toHaveBeenCalled();
  });
});

describe('confirming a restore', () => {
  it('restores the bundle into the live database', async () => {
    mockRestoreBundle.mockResolvedValue(true);
    const { result } = await renderBackupHook();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.confirmRestore(BYTES);
    });

    expect(mockRestoreBundle).toHaveBeenCalledWith(mockRawDb, BYTES);
    expect(outcome).toEqual({ kind: 'ok' });
    expect(result.current.status).toEqual({ kind: 'restore-success' });
    expect(result.current.statusText).toBe(en.backup.restoreSuccess);
    expect(result.current.busy).toBe(false);
  });

  it('reports a restore that returns false', async () => {
    mockRestoreBundle.mockResolvedValue(false);
    const { result } = await renderBackupHook();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.confirmRestore(BYTES);
    });

    expect(outcome).toEqual({ kind: 'failed' });
    expect(result.current.status).toEqual({ kind: 'restore-failed' });
    expect(result.current.statusText).toBe(en.backup.restoreFailed);
    expect(result.current.busy).toBe(false);
  });

  it('reports a restore that throws', async () => {
    mockRestoreBundle.mockRejectedValue(new Error('disk full'));
    const { result } = await renderBackupHook();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.confirmRestore(BYTES);
    });

    expect(outcome).toEqual({ kind: 'failed' });
    expect(result.current.status).toEqual({ kind: 'restore-failed' });
    expect(result.current.busy).toBe(false);
  });

  it('fails without a database connection', async () => {
    mockClient.rawDb = null;
    const { result } = await renderBackupHook();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.confirmRestore(BYTES);
    });

    expect(outcome).toEqual({ kind: 'failed' });
    expect(result.current.status).toEqual({ kind: 'restore-failed' });
    expect(mockRestoreBundle).not.toHaveBeenCalled();
  });
});
