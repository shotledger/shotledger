// Wiring test only — jest-expo's auto-mock for expo-crypto's AES module
// stubs encryptAsync/decryptAsync to no-ops (see
// node_modules/expo-crypto/mocks/ExpoCryptoAES.ts), so real AES-GCM cannot
// be exercised here. Real crypto correctness is proven in
// shared/src/vault/envelope.test.ts against a standards-compliant
// implementation; this file only asserts vaultCryptoProvider calls the
// right expo-crypto functions with the right argument shapes (per
// docs/specs/document-vault-evidence.md).
import { AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';

jest.mock('expo-crypto', () => {
  const actual = jest.requireActual('expo-crypto');
  return {
    ...actual,
    getRandomBytes: jest.fn(() => new Uint8Array(12)),
    aesEncryptAsync: jest.fn(async () => ({
      ciphertext: jest.fn(async () => new Uint8Array([9, 9])),
      tag: jest.fn(async () => new Uint8Array(16)),
    })),
    aesDecryptAsync: jest.fn(async () => new Uint8Array([1, 2, 3])),
    AESSealedData: { fromParts: jest.fn(() => 'fake-sealed-data') },
  };
});

import { vaultCryptoProvider } from './vault-crypto';

describe('vaultCryptoProvider (expo-crypto adapter)', () => {
  it('randomBytes delegates to expo-crypto getRandomBytes', () => {
    const bytes = vaultCryptoProvider.randomBytes(12);
    expect(getRandomBytes).toHaveBeenCalledWith(12);
    expect(bytes).toHaveLength(12);
  });

  it('encrypt calls aesEncryptAsync with the IV as an explicit nonce and splits ciphertext/tag', async () => {
    const iv = new Uint8Array(12).fill(7);
    const key = {} as never;
    const result = await vaultCryptoProvider.encrypt(new Uint8Array([1, 2]), key, iv);

    expect(aesEncryptAsync).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      key,
      expect.objectContaining({ nonce: { bytes: iv } }),
    );
    expect(result.ciphertext).toEqual(new Uint8Array([9, 9]));
    expect(result.tag).toEqual(new Uint8Array(16));
  });

  it('decrypt builds sealed data from parts and calls aesDecryptAsync', async () => {
    const iv = new Uint8Array(12);
    const key = {} as never;
    const ciphertext = new Uint8Array([5]);
    const tag = new Uint8Array(16);

    const result = await vaultCryptoProvider.decrypt(ciphertext, tag, key, iv);

    expect(AESSealedData.fromParts).toHaveBeenCalledWith(iv, ciphertext, tag);
    expect(aesDecryptAsync).toHaveBeenCalledWith('fake-sealed-data', key, { output: 'bytes' });
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });
});
