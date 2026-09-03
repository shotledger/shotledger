// expo-crypto-backed AesGcmProvider — the runtime counterpart of
// shared/src/vault/webcrypto-provider.ts (test-only). See
// docs/specs/document-vault-spec.md "Crypto choice". Confirmed against the
// installed expo-crypto@57.0.2 package's own .d.ts files, not docs alone.
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytes,
} from 'expo-crypto';
import type { AesGcmProvider, VaultCryptoDeps } from '@shotledger/shared';

import { bytesToBase64 } from './base64';

export type VaultKey = AESEncryptionKey;

export async function generateVaultKey(): Promise<VaultKey> {
  return AESEncryptionKey.generate(256);
}

export async function importVaultKey(rawBase64: string): Promise<VaultKey> {
  return AESEncryptionKey.import(rawBase64, 'base64');
}

export async function exportVaultKey(key: VaultKey): Promise<string> {
  return key.encoded('base64');
}

/** `AesGcmProvider<AESEncryptionKey>` used by `shared/src/vault/envelope.ts` at runtime. */
export const vaultCryptoProvider: AesGcmProvider<VaultKey> = {
  randomBytes(byteLength) {
    return getRandomBytes(byteLength);
  },

  async encrypt(plaintext, key, iv) {
    const sealed = await aesEncryptAsync(plaintext, key, { nonce: { bytes: iv } });
    const ciphertext = await sealed.ciphertext({ includeTag: false, encoding: 'bytes' });
    const tag = await sealed.tag('bytes');
    return { ciphertext, tag };
  },

  async decrypt(ciphertext, tag, key, iv) {
    const sealed = AESSealedData.fromParts(iv, ciphertext, tag);
    return aesDecryptAsync(sealed, key, { output: 'bytes' });
  },
};

/** The same AES-GCM primitive, keyed by a passphrase-derived key instead of
 * the device's keystore key — used only for the opt-in vault section of a
 * backup bundle (shared/src/backup/vault-crypt.ts). The derived bytes are
 * never persisted; they exist for the duration of one export or restore. */
export const bundleVaultCryptoDeps: VaultCryptoDeps<VaultKey> = {
  provider: vaultCryptoProvider,
  importRawKey: (raw) => AESEncryptionKey.import(bytesToBase64(raw), 'base64'),
};
