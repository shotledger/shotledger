// The refused-changes line on the Account & Sync screen (app/account.tsx)
// (docs/specs/sync-payload-validation-spec.md C3, P12): shown with its count
// once the server has refused a change, and absent until then. The waiting line
// beside it is docs/specs/sync-family-refusal-spec.md §11.6; both count the
// account's durable refusal marks.
import { render, screen } from '@testing-library/react-native';
import type { SyncStatus } from '@shotledger/shared';
import { initialSyncStatus } from '@shotledger/shared';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSettingsProvider } from '@/state/app-settings';

import AccountScreen from '@/app/account';

const mockStatus: { value: SyncStatus } = { value: initialSyncStatus };
jest.mock('@/features/sync/use-sync', () => ({
  useSync: () => ({ status: mockStatus.value, syncNow: jest.fn() }),
}));
jest.mock('@/features/account/use-account', () => ({
  useAccount: () => ({
    loading: false,
    signedIn: true,
    email: 'shooter@example.invalid',
    error: null,
    signUp: jest.fn(),
    signIn: jest.fn(),
    signInWithPasskey: jest.fn(),
    signOut: jest.fn(),
    deleteAccount: jest.fn(),
  }),
}));

jest.mock('@/features/account/use-passkeys', () => ({
  usePasskeys: () => ({
    supported: true,
    passkeys: [],
    busy: false,
    error: null,
    add: jest.fn(),
    remove: jest.fn(),
  }),
}));

jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => ({ db: {}, rawDb: {} }));
jest.mock('@/db/queries/settings', () => ({
  SETTINGS_KEYS: { theme: 'theme', language: 'language' },
  getSetting: (_db: unknown, _key: string, fallback: unknown) => fallback,
  setSetting: jest.fn(),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
require('@/i18n');

async function renderAccount(): Promise<void> {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AppSettingsProvider>
        <AccountScreen />
      </AppSettingsProvider>
    </SafeAreaProvider>,
  );
}

describe('the refused-changes line', () => {
  it('is absent while nothing was refused', async () => {
    mockStatus.value = initialSyncStatus;
    await renderAccount();
    expect(screen.getByTestId('sync-pending')).toBeTruthy();
    expect(screen.queryByTestId('sync-refused')).toBeNull();
  });

  it('shows the count once the server refused a change', async () => {
    mockStatus.value = { ...initialSyncStatus, refusedCount: 2 };
    await renderAccount();
    expect(screen.getByTestId('sync-refused')).toHaveTextContent(
      '2 change(s) refused by the server and not synced',
    );
  });
});

// docs/specs/sync-family-refusal-spec.md §11.6, H1', H11': a second line while
// the server holds any change back behind a refused one.
describe('the held-changes line', () => {
  it('is absent while nothing is held', async () => {
    mockStatus.value = { ...initialSyncStatus, refusedCount: 1 };
    await renderAccount();
    expect(screen.queryByTestId('sync-held')).toBeNull();
  });

  it('shows the count beside the refused line', async () => {
    mockStatus.value = { ...initialSyncStatus, refusedCount: 1, heldCount: 3 };
    await renderAccount();
    expect(screen.getByTestId('sync-held')).toHaveTextContent(
      '3 change(s) waiting on a refused change',
    );
    expect(screen.getByTestId('sync-refused')).toBeTruthy();
  });

  it('shows on its own, before a pull lists a refused change another device made', async () => {
    mockStatus.value = { ...initialSyncStatus, heldCount: 3 };
    await renderAccount();
    expect(screen.getByTestId('sync-held')).toHaveTextContent(
      '3 change(s) waiting on a refused change',
    );
    expect(screen.queryByTestId('sync-refused')).toBeNull();
  });

  it('shows a single held change', async () => {
    mockStatus.value = { ...initialSyncStatus, heldCount: 1 };
    await renderAccount();
    expect(screen.getByTestId('sync-held')).toHaveTextContent(
      '1 change(s) waiting on a refused change',
    );
  });
});
