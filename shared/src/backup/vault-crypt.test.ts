// Spec behaviours V1–V11 — passphrase re-wrap of the bundle's vault section,
// exercised against a standards-compliant AES-GCM (Node WebCrypto) through
// the same `AesGcmProvider` seam the app fills with expo-crypto at runtime.
import { describe, expect, it } from 'vitest';

import { importWebCryptoKey, webCryptoProvider } from '../vault/webcrypto-provider';
import { VaultEnvelopeFormatError } from '../vault';

import { hexToBytes } from './hex';
import { pbkdf2Sha256 } from './pbkdf2';
import { packVaultPayload, unpackVaultPayload } from './vault-payload';
import {
  BackupVaultPassphraseError,
  normalizePassphrase,
  openVaultSection,
  sealVaultSection,
  VAULT_KDF_ITERATIONS,
  VAULT_KDF_KEY_BYTES,
  VAULT_KDF_SALT_BYTES,
  type VaultCryptoDeps,
} from './vault-crypt';

// A low iteration count keeps the suite fast; K4 in pbkdf2.test.ts covers the
// shipped count, and the count is a manifest field, not a constant of the
// format.
const TEST_ITERATIONS = 1000;

const deps: VaultCryptoDeps<CryptoKey> = {
  provider: webCryptoProvider,
  importRawKey: importWebCryptoKey,
};

const payload = packVaultPayload({
  indexJson: '{"documents":[{"id":"a","label":"Synthetic card"}]}',
  documents: [{ id: 'a', bytes: Uint8Array.from([1, 2, 3, 4, 5]) }],
});

describe('vault section crypto', () => {
  it('V1: round-trips a payload through a passphrase', async () => {
    const sealed = await sealVaultSection(payload, 'a good passphrase', deps, TEST_ITERATIONS);
    const opened = await openVaultSection(
      sealed.sealed,
      'a good passphrase',
      sealed.saltHex,
      sealed.iterations,
      deps,
    );
    expect(unpackVaultPayload(opened)).toEqual(unpackVaultPayload(payload));
  });

  it('V2: rejects the wrong passphrase with BackupVaultPassphraseError', async () => {
    const sealed = await sealVaultSection(payload, 'correct passphrase', deps, TEST_ITERATIONS);
    await expect(
      openVaultSection(sealed.sealed, 'wrong passphrase', sealed.saltHex, sealed.iterations, deps),
    ).rejects.toBeInstanceOf(BackupVaultPassphraseError);
  });

  it('V3: rejects the right passphrase against the wrong salt', async () => {
    const sealed = await sealVaultSection(payload, 'passphrase', deps, TEST_ITERATIONS);
    const otherSalt = 'ff'.repeat(VAULT_KDF_SALT_BYTES);
    await expect(
      openVaultSection(sealed.sealed, 'passphrase', otherSalt, sealed.iterations, deps),
    ).rejects.toBeInstanceOf(BackupVaultPassphraseError);
  });

  it('V4: rejects the right passphrase against the wrong iteration count', async () => {
    const sealed = await sealVaultSection(payload, 'passphrase', deps, TEST_ITERATIONS);
    await expect(
      openVaultSection(sealed.sealed, 'passphrase', sealed.saltHex, TEST_ITERATIONS + 1, deps),
    ).rejects.toBeInstanceOf(BackupVaultPassphraseError);
  });

  it('V5: rejects a tampered ciphertext byte', async () => {
    const sealed = await sealVaultSection(payload, 'passphrase', deps, TEST_ITERATIONS);
    const corrupted = Uint8Array.from(sealed.sealed);
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0x01;
    await expect(
      openVaultSection(corrupted, 'passphrase', sealed.saltHex, sealed.iterations, deps),
    ).rejects.toBeInstanceOf(BackupVaultPassphraseError);
  });

  it('V6: rejects a truncated vault section as a format error, not a passphrase error', async () => {
    const sealed = await sealVaultSection(payload, 'passphrase', deps, TEST_ITERATIONS);
    await expect(
      openVaultSection(
        sealed.sealed.slice(0, 10),
        'passphrase',
        sealed.saltHex,
        sealed.iterations,
        deps,
      ),
    ).rejects.toBeInstanceOf(VaultEnvelopeFormatError);
  });

  it('V7: uses a fresh random salt per export, so the same passphrase gives different bytes', async () => {
    const a = await sealVaultSection(payload, 'same passphrase', deps, TEST_ITERATIONS);
    const b = await sealVaultSection(payload, 'same passphrase', deps, TEST_ITERATIONS);
    expect(a.saltHex).not.toBe(b.saltHex);
    expect(hexToBytes(a.saltHex).length).toBe(VAULT_KDF_SALT_BYTES);
    expect(Array.from(a.sealed)).not.toEqual(Array.from(b.sealed));
  });

  it('V8: never places the passphrase or the derived key in the sealed bytes or manifest fields', async () => {
    const passphrase = 'UNMISTAKABLE-PASSPHRASE-9137';
    const sealed = await sealVaultSection(payload, passphrase, deps, TEST_ITERATIONS);
    const derived = pbkdf2Sha256(
      new TextEncoder().encode(passphrase),
      hexToBytes(sealed.saltHex),
      TEST_ITERATIONS,
      VAULT_KDF_KEY_BYTES,
    );

    const haystack = Array.from(sealed.sealed).join(',');
    expect(haystack).not.toContain(Array.from(new TextEncoder().encode(passphrase)).join(','));
    expect(haystack).not.toContain(Array.from(derived).join(','));
    expect(sealed.saltHex).not.toContain(passphrase);
  });

  it('V9: normalises surrounding whitespace so a stray trailing space still opens the bundle', async () => {
    const sealed = await sealVaultSection(payload, ' my passphrase ', deps, TEST_ITERATIONS);
    const opened = await openVaultSection(
      sealed.sealed,
      'my passphrase',
      sealed.saltHex,
      sealed.iterations,
      deps,
    );
    expect(opened).toEqual(payload);
  });

  it('V10: normalises composed and decomposed forms of the same passphrase to the same key', async () => {
    const composed = 'l\u00f6senord'; // "ö" as one code point
    const decomposed = 'lo\u0308senord'; // "o" + combining diaeresis
    expect(normalizePassphrase(decomposed)).toBe(normalizePassphrase(composed));

    const sealed = await sealVaultSection(payload, composed, deps, TEST_ITERATIONS);
    await expect(
      openVaultSection(sealed.sealed, decomposed, sealed.saltHex, sealed.iterations, deps),
    ).resolves.toEqual(payload);
  });

  it('V11: ships a default iteration count that is a real barrier', () => {
    expect(VAULT_KDF_ITERATIONS).toBeGreaterThanOrEqual(100_000);
  });

  it('V12: defaults to the shipped iteration count when the caller omits one', async () => {
    const sealed = await sealVaultSection(payload, 'passphrase', deps);
    expect(sealed.iterations).toBe(VAULT_KDF_ITERATIONS);
    await expect(
      openVaultSection(sealed.sealed, 'passphrase', sealed.saltHex, sealed.iterations, deps),
    ).resolves.toEqual(payload);
  }, 120_000);

  it('V13: still derives a key on a runtime without String.prototype.normalize', async () => {
    // Hermes can be built without full Unicode support; the KDF must not
    // throw there, it just skips normalisation (both devices skip it alike).
    const original = String.prototype.normalize;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (String.prototype as any).normalize;
    try {
      expect(normalizePassphrase('  spaced  ')).toBe('spaced');
      const sealed = await sealVaultSection(payload, ' passphrase ', deps, TEST_ITERATIONS);
      await expect(
        openVaultSection(sealed.sealed, 'passphrase', sealed.saltHex, sealed.iterations, deps),
      ).resolves.toEqual(payload);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (String.prototype as any).normalize = original;
    }
  });
});
