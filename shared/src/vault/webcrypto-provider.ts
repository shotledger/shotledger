// Standards-compliant AES-GCM provider backed by the platform WebCrypto API
// (`globalThis.crypto.subtle`, available in Node 19+ and vitest's Node
// environment). Used by shared/'s own tests to prove `envelope.ts` against a
// real AEAD implementation without depending on a native module — see
// docs/specs/document-vault-spec.md. The app's runtime uses a separate
// expo-crypto-backed provider (app/src/platform/vault-crypto.ts, not this
// file) for the same `AesGcmProvider` interface.
import { TAG_BYTES } from './types';
import type { AesGcmProvider } from './types';

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('WebCrypto (globalThis.crypto.subtle) is not available in this environment');
  }
  return c.subtle;
}

export async function generateWebCryptoKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function importWebCryptoKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', new Uint8Array(raw), { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** `AesGcmProvider<CryptoKey>` for use in `shared/` tests. */
export const webCryptoProvider: AesGcmProvider<CryptoKey> = {
  randomBytes(byteLength) {
    const bytes = new Uint8Array(byteLength);
    (globalThis as { crypto: Crypto }).crypto.getRandomValues(bytes);
    return bytes;
  },

  async encrypt(plaintext, key, iv) {
    // SubtleCrypto returns ciphertext with the tag appended; split it so the
    // envelope's own header packs the two apart (spec "Envelope format").
    const combined = new Uint8Array(
      await subtle().encrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(plaintext),
      ),
    );
    const tagStart = combined.length - TAG_BYTES;
    return {
      ciphertext: combined.slice(0, tagStart),
      tag: combined.slice(tagStart),
    };
  },

  async decrypt(ciphertext, tag, key, iv) {
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);
    // Throws (OperationError) on tag mismatch — envelope.open() maps this to
    // VaultTamperError.
    const plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      combined,
    );
    return new Uint8Array(plaintext);
  },
};
