// The Passkeys card's glue (use-passkeys.ts): what reaches the Worker and the
// OS prompt, and which line the card shows for each outcome.
import { act, renderHook } from '@testing-library/react-native';
import { AuthError } from '@shotledger/shared';

import { usePasskeys } from './use-passkeys';

const mockApi = {
  listPasskeys: jest.fn(),
  passkeyRegistrationOptions: jest.fn(),
  addPasskey: jest.fn(),
  removePasskey: jest.fn(),
};
jest.mock('@/features/sync/client', () => ({ getAccountApi: () => mockApi }));

const mockPlatform = { supported: true, create: jest.fn() };
jest.mock('@/platform/passkey', () => ({
  passkeysSupported: () => mockPlatform.supported,
  createPasskey: (...args: unknown[]) => mockPlatform.create(...args),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));

const listed = [{ id: 'pk-1', name: 'ShotLedger app on Android', createdAt: '2026-10-20' }];
const ceremony = { options: { challenge: 'abc' }, challenge: 'handle' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.supported = true;
  mockApi.listPasskeys.mockResolvedValue(listed);
  mockApi.passkeyRegistrationOptions.mockResolvedValue(ceremony);
  mockApi.addPasskey.mockResolvedValue(undefined);
  mockApi.removePasskey.mockResolvedValue(undefined);
  mockPlatform.create.mockResolvedValue({ id: 'cred' });
});

async function render(signedIn = true) {
  const hook = await renderHook(() => usePasskeys(signedIn));
  await act(async () => {});
  return hook;
}

it('lists the passkeys once signed in', async () => {
  const { result } = await render();
  expect(result.current.passkeys).toEqual(listed);
  expect(result.current.supported).toBe(true);
});

it('lists nothing while signed out', async () => {
  const { result } = await render(false);
  expect(mockApi.listPasskeys).not.toHaveBeenCalled();
  expect(result.current.passkeys).toBeNull();
});

it('says so when the list fails', async () => {
  mockApi.listPasskeys.mockRejectedValue(new AuthError(500, 'down'));
  const { result } = await render();
  expect(result.current.error).toBe('listFailed');
});

it('reports a phone that cannot use passkeys', async () => {
  mockPlatform.supported = false;
  const { result } = await render();
  expect(result.current.supported).toBe(false);
});

it('adds a passkey named after the app and the OS, then reloads', async () => {
  const { result } = await render();
  await act(() => result.current.add());
  expect(mockPlatform.create).toHaveBeenCalledWith(ceremony.options);
  expect(mockApi.addPasskey).toHaveBeenCalledWith(
    ceremony,
    { id: 'cred' },
    expect.stringContaining('account.passkey.appName'),
  );
  expect(mockApi.listPasskeys).toHaveBeenCalledTimes(2);
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(false);
});

it('shows nothing when the OS prompt is dismissed', async () => {
  mockPlatform.create.mockRejectedValue({ error: 'UserCancelled', message: 'no' });
  const { result } = await render();
  await act(() => result.current.add());
  expect(mockApi.addPasskey).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
});

it('asks for a fresh sign-in when the session is too old to add one', async () => {
  mockApi.passkeyRegistrationOptions.mockRejectedValue(new AuthError(403, 'stale'));
  const { result } = await render();
  await act(() => result.current.add());
  expect(result.current.error).toBe('signInAgain');
});

it('removes a passkey and reloads', async () => {
  const { result } = await render();
  await act(() => result.current.remove('pk-1'));
  expect(mockApi.removePasskey).toHaveBeenCalledWith('pk-1');
  expect(mockApi.listPasskeys).toHaveBeenCalledTimes(2);
});

it('says so when removing fails', async () => {
  mockApi.removePasskey.mockRejectedValue(new AuthError(500, 'down'));
  const { result } = await render();
  await act(() => result.current.remove('pk-1'));
  expect(result.current.error).toBe('removeFailed');
});
