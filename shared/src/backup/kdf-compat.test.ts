// Cross-implementation compatibility for the bundle passphrase KDF.
//
// The KDF moved from a hand-written SHA-256/PBKDF2 (shared/src/backup/
// {sha256,pbkdf2}.ts, deleted) to `@noble/hashes`. A bundle exported before
// that swap must still restore after it, and vice versa, so the vectors below
// were captured by *running the pre-noble implementation* and are asserted
// against the current one. They are golden values: regenerating them to make
// a test pass would mean every existing bundle had become unreadable.
import { describe, expect, it } from 'vitest';

import { importWebCryptoKey, webCryptoProvider } from '../vault/webcrypto-provider';

import { bytesToHex, hexToBytes } from './hex';
import { pbkdf2Sha256 } from './pbkdf2';
import { unpackVaultPayload } from './vault-payload';
import { openVaultSection, type VaultCryptoDeps } from './vault-crypt';

const utf8 = new TextEncoder();

const deps: VaultCryptoDeps<CryptoKey> = {
  provider: webCryptoProvider,
  importRawKey: importWebCryptoKey,
};

/** [passphrase, saltHex, iterations, keyLength, derived key hex] */
const LEGACY_KDF_VECTORS: readonly (readonly [string, string, number, number, string])[] = [
  [
    'correct horse battery staple',
    '000102030405060708090a0b0c0d0e0f',
    1,
    32,
    'd63fa1f74cd7e3db498fdd14a1e8aa34937ba1e9cf663db83a790d458a8e849a',
  ],
  [
    'a passphrase with åäö and a space',
    '5f9c2b7de1a04836bb7e10c3f4d29a6e',
    1000,
    32,
    '328bb836f7afa644e77f856959141cdef155aefb9785dfb1cb68b0d8bf054fbb',
  ],
  // The parameters the app actually ships: 150 000 iterations, 16-byte salt,
  // 32-byte key, and a passphrase carrying non-ASCII characters.
  [
    'tröskelvärde-lösenord',
    'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    150_000,
    32,
    '8a5095eb5874b369aad949c28a955f9f4ad76271685b35ce96e97cbc6319bea3',
  ],
  // Three output blocks, so the block-index counter is exercised too.
  [
    'multi block',
    '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
    137,
    96,
    'c1d1dde4b1b40e3458280bfe58b9c418ae1b156f0f72e37f73cf1793b017faf1' +
      'fe473a654ba4f142963f1676838867e20cadedcb382da654f28947e0884e9be7' +
      '45879daf12769d96db459a4620f221c2224611b0a07c1b689208dc812b32d0ef',
  ],
];

/** A vault section sealed end-to-end by the pre-noble code path. */
const LEGACY_SEALED_SECTION = {
  passphrase: 'a legacy bundle passphrase',
  saltHex: '9d3f0b1c2e4a5867788796a5b4c3d2e1',
  iterations: 1000,
  indexJson: '{"documents":[{"id":"a","label":"Synthetic card"}]}',
  documentBytes: Uint8Array.from([1, 2, 3, 4, 5]),
  sealedHex:
    '0150f517a61da8d321e3b3cf4b248429fac42a0ea5d20223e7ca1e343b2e' +
    '6f4e8ca9bfbdb98b8124eba2abaabdb9ff0f5191e0e94da9b9c6bc7359b4' +
    '9ca51deeff2f60266e027a02d8452160cef8a7a58ccb95e568e19c70cc92' +
    'b624b9643bbfb84167877da3d233ec197ab1eec2acb2f0de206b8cc6105a' +
    'eea661c20bce4030617a',
} as const;

describe('KDF compatibility across the @noble/hashes swap', () => {
  it('C1: derives byte-identical keys to the pre-noble implementation', () => {
    for (const [passphrase, saltHex, iterations, keyLength, expected] of LEGACY_KDF_VECTORS) {
      expect(
        bytesToHex(
          pbkdf2Sha256(utf8.encode(passphrase), hexToBytes(saltHex), iterations, keyLength),
        ),
        `${passphrase} c=${iterations} dkLen=${keyLength}`,
      ).toBe(expected);
    }
  }, 120_000);

  it('C2: opens a vault section that the pre-noble implementation sealed', async () => {
    const opened = await openVaultSection(
      hexToBytes(LEGACY_SEALED_SECTION.sealedHex),
      LEGACY_SEALED_SECTION.passphrase,
      LEGACY_SEALED_SECTION.saltHex,
      LEGACY_SEALED_SECTION.iterations,
      deps,
    );
    const payload = unpackVaultPayload(opened);
    expect(payload.indexJson).toBe(LEGACY_SEALED_SECTION.indexJson);
    expect(payload.documents).toEqual([{ id: 'a', bytes: LEGACY_SEALED_SECTION.documentBytes }]);
  });
});
