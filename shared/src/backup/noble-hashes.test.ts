// Vectors that pin `@noble/hashes` — the SHA-256 and HMAC-SHA256 the bundle
// passphrase KDF is built on (pbkdf2.ts). These assertions are the ones that
// used to guard the hand-written implementation this replaced, kept verbatim
// so a Renovate bump of the dependency has to reproduce them: `node:crypto`
// here is OpenSSL, an entirely independent implementation, so byte equality
// across randomised inputs is the evidence (spec behaviours H1–H3, H6–H7).
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';

import { bytesToHex } from './hex';

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  return hmac(sha256, key, message);
}

function opensslSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function opensslHmac(key: Uint8Array, message: Uint8Array): string {
  return createHmac('sha256', key).update(message).digest('hex');
}

describe('sha256', () => {
  it('H1: matches the published FIPS 180-4 vectors', () => {
    const encoder = new TextEncoder();
    expect(bytesToHex(sha256(encoder.encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(bytesToHex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(
      bytesToHex(
        sha256(encoder.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
      ),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('H2: matches OpenSSL for every input length across the block/padding boundaries', () => {
    for (let length = 0; length <= 200; length++) {
      const input = new Uint8Array(length);
      for (let i = 0; i < length; i++) input[i] = (i * 31 + 7) & 0xff;
      expect(bytesToHex(sha256(input)), `length ${length}`).toBe(opensslSha256(input));
    }
  });

  it('H3: matches OpenSSL on randomised inputs', () => {
    for (let i = 0; i < 200; i++) {
      const input = new Uint8Array(randomBytes(Math.floor(Math.random() * 1000)));
      expect(bytesToHex(sha256(input))).toBe(opensslSha256(input));
    }
  });

  it('H5: hashes a multi-megabyte input the same as OpenSSL (length encoding > 2^16 bits)', () => {
    const input = new Uint8Array(randomBytes(2_000_003));
    expect(bytesToHex(sha256(input))).toBe(opensslSha256(input));
  }, 60_000);
});

describe('hmacSha256', () => {
  it('H6: matches the RFC 4231 test vectors', () => {
    const encoder = new TextEncoder();
    // Test Case 1
    expect(bytesToHex(hmacSha256(new Uint8Array(20).fill(0x0b), encoder.encode('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
    // Test Case 2 — key shorter than the block
    expect(
      bytesToHex(
        hmacSha256(encoder.encode('Jefe'), encoder.encode('what do ya want for nothing?')),
      ),
    ).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    // Test Case 6 — key longer than the block (131 bytes), so it is hashed first
    expect(
      bytesToHex(
        hmacSha256(
          new Uint8Array(131).fill(0xaa),
          encoder.encode('Test Using Larger Than Block-Size Key - Hash Key First'),
        ),
      ),
    ).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
  });

  it('H7: matches OpenSSL across key and message lengths spanning the block boundary', () => {
    for (const keyLength of [0, 1, 32, 63, 64, 65, 100, 200]) {
      for (const messageLength of [0, 1, 55, 56, 64, 65, 300]) {
        const key = new Uint8Array(randomBytes(keyLength));
        const message = new Uint8Array(randomBytes(messageLength));
        expect(bytesToHex(hmacSha256(key, message)), `key ${keyLength} msg ${messageLength}`).toBe(
          opensslHmac(key, message),
        );
      }
    }
  });
});
