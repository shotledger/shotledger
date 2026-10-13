// The restore hand-off at the end of the Backup card: a successful restore
// closes the live database, so the card must reload the app rather than leave
// it running on a closed connection (issue #780).
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import en from '@/i18n/en.json';
import { AppSettingsProvider } from '@/state/app-settings';

import { BackupCard } from './backup-card';

const BYTES = new Uint8Array([1, 2, 3]);
const mockPlanRestore = jest.fn();
const mockConfirmRestore = jest.fn();
jest.mock('./use-backup-export-import', () => ({
  ...jest.requireActual('./use-backup-export-import'),
  useBackupExportImport: () => ({
    exportBundle: jest.fn(),
    changeFolder: jest.fn(),
    forgetFolder: jest.fn(),
    planRestore: (...args: unknown[]) => mockPlanRestore(...args),
    confirmRestore: (...args: unknown[]) => mockConfirmRestore(...args),
    statusText: null,
    busy: false,
    lastBackupAt: null,
    folderUri: null,
    isFolderSaveSupported: false,
  }),
}));

jest.mock('@/db/client', () => ({ db: {}, rawDb: {} }));
jest.mock('@/db/queries/settings', () => ({
  SETTINGS_KEYS: { theme: 'theme', language: 'language' },
  getSetting: (_db: unknown, _key: string, fallback: unknown) => fallback,
  setSetting: jest.fn(),
}));

const mockReloadApp = jest.fn();
jest.mock('@/platform/app-reload', () => ({
  reloadApp: (...args: unknown[]) => mockReloadApp(...args),
}));

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
require('@/i18n');

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanRestore.mockResolvedValue({
    preview: {
      manifest: {
        kind: 'database',
        createdAt: '2026-10-01T10:00:00.000Z',
        counts: { sessions: 1, series: 2, shots: 3, firearms: 1, photos: 0 },
      },
      compatibility: 'ok',
    },
    bytes: BYTES,
  });
});

/** Presses the button labeled `label` on the `n`th Alert.alert call. */
function pressAlertButton(n: number, label: string): void {
  const buttons = alertSpy.mock.calls[n]?.[2] as AlertButton[];
  const button = buttons.find((b) => b.text === label);
  if (!button?.onPress) throw new Error(`no "${label}" button on alert ${n}`);
  button.onPress();
}

async function restoreThroughPreview(): Promise<void> {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AppSettingsProvider>
        <BackupCard />
      </AppSettingsProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {
    await fireEvent.press(screen.getByTestId('settings-restore-backup'));
  });
  await act(async () => {
    pressAlertButton(0, en.backup.restoreConfirmAction);
  });
}

describe('after a restore', () => {
  it('reloads the app once the user taps Restart, and cannot be dismissed', async () => {
    mockConfirmRestore.mockResolvedValue({ kind: 'ok' });

    await restoreThroughPreview();

    expect(mockConfirmRestore).toHaveBeenCalledWith(BYTES);
    expect(alertSpy).toHaveBeenCalledTimes(2);
    const [title, body, buttons, options] = alertSpy.mock.calls[1]!;
    expect(title).toBe(en.backup.restoreRestartTitle);
    expect(body).toBe(en.backup.restoreRestartBody);
    expect((buttons as AlertButton[]).map((b) => b.text)).toEqual([en.backup.restoreRestartAction]);
    expect(options).toEqual({ cancelable: false });
    expect(mockReloadApp).not.toHaveBeenCalled();

    pressAlertButton(1, en.backup.restoreRestartAction);

    expect(mockReloadApp).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the restore failed', async () => {
    mockConfirmRestore.mockResolvedValue({ kind: 'failed' });

    await restoreThroughPreview();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockReloadApp).not.toHaveBeenCalled();
  });
});
