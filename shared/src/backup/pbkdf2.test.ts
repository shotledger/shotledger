// PBKDF2-HMAC-SHA256 evidence (spec behaviours K1–K5): published RFC 7914
// vectors plus byte-for-byte agreement with OpenSSL over randomised
// parameters, including multi-block derived keys and the exact parameters the
// app ships with.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { bytesToHex } from './hex';
import { pbkdf2Sha256 } from './pbkdf2';
import { VAULT_KDF_ITERATIONS, VAULT_KDF_KEY_BYTES, VAULT_KDF_SALT_BYTES } from './vault-crypt';

const utf8 = new TextEncoder();

function openssl(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): string {
  return pbkdf2Sync(password, salt, iterations, keyLength, 'sha256').toString('hex');
}

describe('pbkdf2Sha256', () => {
  it('K1: matches the RFC 7914 §11 PBKDF2-HMAC-SHA256 vectors', () => {
    expect(bytesToHex(pbkdf2Sha256(utf8.encode('passwd'), utf8.encode('salt'), 1, 64))).toBe(
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc' +
        '49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
    );
    expect(bytesToHex(pbkdf2Sha256(utf8.encode('Password'), utf8.encode('NaCl'), 80000, 64))).toBe(
      '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56' +
        'a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d',
    );
  }, 120_000);

  it('K2: matches OpenSSL across randomised passwords, salts, counts and key lengths', () => {
    for (let i = 0; i < 40; i++) {
      const password = new Uint8Array(randomBytes(Math.floor(Math.random() * 80)));
      const salt = new Uint8Array(randomBytes(1 + Math.floor(Math.random() * 40)));
      const iterations = 1 + Math.floor(Math.random() * 300);
      const keyLength = 1 + Math.floor(Math.random() * 100);
      expect(
        bytesToHex(pbkdf2Sha256(password, salt, iterations, keyLength)),
        `i=${iterations} dkLen=${keyLength}`,
      ).toBe(openssl(password, salt, iterations, keyLength));
    }
  });

  it('K3: matches OpenSSL for derived keys spanning exactly one, two and three blocks', () => {
    const password = utf8.encode('correct horse battery staple');
    const salt = new Uint8Array(randomBytes(16));
    for (const keyLength of [31, 32, 33, 64, 65, 96]) {
      expect(bytesToHex(pbkdf2Sha256(password, salt, 137, keyLength))).toBe(
        openssl(password, salt, 137, keyLength),
      );
    }
  });

  it('K4: matches OpenSSL at the parameters the app actually ships', () => {
    const password = utf8.encode('a passphrase with åäö and a space');
    const salt = new Uint8Array(randomBytes(VAULT_KDF_SALT_BYTES));
    expect(
      bytesToHex(pbkdf2Sha256(password, salt, VAULT_KDF_ITERATIONS, VAULT_KDF_KEY_BYTES)),
    ).toBe(openssl(password, salt, VAULT_KDF_ITERATIONS, VAULT_KDF_KEY_BYTES));
  }, 120_000);

  it('K5: rejects nonsensical parameters rather than returning weak key material', () => {
    const salt = new Uint8Array(16);
    expect(() => pbkdf2Sha256(utf8.encode('x'), salt, 0, 32)).toThrow(RangeError);
    expect(() => pbkdf2Sha256(utf8.encode('x'), salt, -1, 32)).toThrow(RangeError);
    expect(() => pbkdf2Sha256(utf8.encode('x'), salt, 1.5, 32)).toThrow(RangeError);
    expect(() => pbkdf2Sha256(utf8.encode('x'), salt, 10, 0)).toThrow(RangeError);
    expect(() => pbkdf2Sha256(utf8.encode('x'), salt, 10, -8)).toThrow(RangeError);

    // The wording is asserted, not just the type: `@noble/hashes` answers a
    // bare `Error` for c === 0 and dkLen === 0, so these guards exist to keep
    // this module's contract, and a blank message would hide which one fired.
    expect(() => pbkdf2Sha256(utf8.encode('x'), salt, 0, 32)).toThrow(
      'pbkdf2Sha256: iterations must be a positive integer, got 0',
    );
    expect(() => pbkdf2Sha256(utf8.encode('x'), salt, 10, 0)).toThrow(
      'pbkdf2Sha256: keyLength must be a positive integer, got 0',
    );

    // …and the smallest legal values are still accepted: the guards reject
    // what is nonsensical, not what is merely small.
    expect(bytesToHex(pbkdf2Sha256(utf8.encode('x'), salt, 1, 1))).toBe(
      openssl(utf8.encode('x'), salt, 1, 1),
    );
  });
});
