// Key lifecycle with mocked secure-store and mocked expo-crypto key
// generation (real AES-256-GCM correctness lives in
// shared/src/vault/envelope.test.ts).
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store');
jest.mock('./vault-crypto', () => ({
  generateVaultKey: jest.fn(async () => ({ id: 'generated-key' })),
  exportVaultKey: jest.fn(async (key: { id: string }) => `raw:${key.id}`),
  importVaultKey: jest.fn(async (raw: string) => {
    if (raw === 'raw:corrupt') throw new Error('bad key material');
    return { id: raw.replace('raw:', '') };
  }),
}));

import { clearVaultKeyCache, getOrCreateVaultKey } from './vault-key';

const mockedGetItem = SecureStore.getItemAsync as jest.Mock;
const mockedSetItem = SecureStore.setItemAsync as jest.Mock;

beforeEach(() => {
  clearVaultKeyCache();
  mockedGetItem.mockReset();
  mockedSetItem.mockReset();
});

describe('vault key lifecycle', () => {
  it('generates and persists a key on first access when none is stored', async () => {
    mockedGetItem.mockResolvedValue(null);

    const key = await getOrCreateVaultKey();

    expect(key).toEqual({ id: 'generated-key' });
    expect(mockedSetItem).toHaveBeenCalledWith('vault_aes_key_v1', 'raw:generated-key');
  });

  it('reuses the stored key on subsequent access without regenerating', async () => {
    mockedGetItem.mockResolvedValue('raw:existing-key');

    const key = await getOrCreateVaultKey();

    expect(key).toEqual({ id: 'existing-key' });
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('caches the key in-process — a second call does not re-read secure-store', async () => {
    mockedGetItem.mockResolvedValue('raw:existing-key');

    await getOrCreateVaultKey();
    await getOrCreateVaultKey();

    expect(mockedGetItem).toHaveBeenCalledTimes(1);
  });

  it('regenerates rather than throwing when the stored value is present but unreadable', async () => {
    mockedGetItem.mockResolvedValue('raw:corrupt');

    const key = await getOrCreateVaultKey();

    expect(key).toEqual({ id: 'generated-key' });
    expect(mockedSetItem).toHaveBeenCalledWith('vault_aes_key_v1', 'raw:generated-key');
  });

  it('regenerates rather than throwing when secure-store read itself rejects', async () => {
    mockedGetItem.mockRejectedValue(new Error('keystore unavailable'));

    const key = await getOrCreateVaultKey();

    expect(key).toEqual({ id: 'generated-key' });
  });
});
