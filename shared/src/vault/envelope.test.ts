// Behavior table: docs/specs/document-vault-spec.md "Behaviors — envelope.ts".
import { describe, expect, it } from 'vitest';

import { open, seal } from './envelope';
import { ENVELOPE_VERSION, VaultEnvelopeFormatError, VaultTamperError } from './types';
import { generateWebCryptoKey, importWebCryptoKey, webCryptoProvider } from './webcrypto-provider';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function flipBit(bytes: Uint8Array, index: number): void {
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Builds a v1 envelope directly from parts, bypassing seal() — for the vector tests. */
function buildEnvelope(ivHex: string, tagHex: string, ciphertextHex: string): Uint8Array {
  const iv = hexToBytes(ivHex);
  const tag = hexToBytes(tagHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const out = new Uint8Array(1 + iv.length + tag.length + ciphertext.length);
  out[0] = ENVELOPE_VERSION;
  out.set(iv, 1);
  out.set(tag, 1 + iv.length);
  out.set(ciphertext, 1 + iv.length + tag.length);
  return out;
}

describe('envelope round trip (E1-E3)', () => {
  it('E1: seal then open returns the original plaintext', async () => {
    const key = await generateWebCryptoKey();
    const plaintext = utf8('Vapenlicens: A123.456/2024-01');

    const sealed = await seal(plaintext, key, webCryptoProvider);
    const opened = await open(sealed, key, webCryptoProvider);

    expect(opened).toEqual(plaintext);
  });

  it('E2: round trip with empty plaintext succeeds', async () => {
    const key = await generateWebCryptoKey();
    const plaintext = new Uint8Array(0);

    const sealed = await seal(plaintext, key, webCryptoProvider);
    const opened = await open(sealed, key, webCryptoProvider);

    expect(opened).toEqual(plaintext);
  });

  it('E3: two seals of the same plaintext produce different ciphertext (random IV)', async () => {
    const key = await generateWebCryptoKey();
    const plaintext = utf8('Portkod: 4471#');

    const sealedA = await seal(plaintext, key, webCryptoProvider);
    const sealedB = await seal(plaintext, key, webCryptoProvider);

    expect(sealedA).not.toEqual(sealedB);
    // IVs (bytes 1..13) must differ too, not just because ciphertext moved.
    expect(sealedA.subarray(1, 13)).not.toEqual(sealedB.subarray(1, 13));
  });
});

describe('envelope tamper detection (E4-E6, E9)', () => {
  async function sealedFixture() {
    const key = await generateWebCryptoKey();
    const sealed = await seal(utf8('Membership card #4471'), key, webCryptoProvider);
    return { key, sealed };
  }

  it('E4: flipping a bit in the ciphertext region throws VaultTamperError', async () => {
    const { key, sealed } = await sealedFixture();
    const tampered = sealed.slice();
    flipBit(tampered, tampered.length - 1); // last byte is ciphertext
    const error = await open(tampered, key, webCryptoProvider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultTamperError);
    expect((error as Error).name).toBe('VaultTamperError');
    expect((error as Error).message.length).toBeGreaterThan(0);
  });

  it('E5: flipping a bit in the tag region throws VaultTamperError', async () => {
    const { key, sealed } = await sealedFixture();
    const tampered = sealed.slice();
    flipBit(tampered, 1 + 12); // first tag byte
    await expect(open(tampered, key, webCryptoProvider)).rejects.toBeInstanceOf(VaultTamperError);
  });

  it('E6: flipping a bit in the IV region throws VaultTamperError', async () => {
    const { key, sealed } = await sealedFixture();
    const tampered = sealed.slice();
    flipBit(tampered, 1); // first IV byte
    await expect(open(tampered, key, webCryptoProvider)).rejects.toBeInstanceOf(VaultTamperError);
  });

  it('E9: opening with the wrong key throws VaultTamperError', async () => {
    const { sealed } = await sealedFixture();
    const wrongKey = await generateWebCryptoKey();
    await expect(open(sealed, wrongKey, webCryptoProvider)).rejects.toBeInstanceOf(
      VaultTamperError,
    );
  });

  it('never returns plaintext when authentication fails (N3)', async () => {
    const { key, sealed } = await sealedFixture();
    const tampered = sealed.slice();
    flipBit(tampered, tampered.length - 1);
    let plaintextLeaked: Uint8Array | undefined;
    try {
      plaintextLeaked = await open(tampered, key, webCryptoProvider);
    } catch {
      // expected
    }
    expect(plaintextLeaked).toBeUndefined();
  });
});

describe('malformed envelopes (E7-E8)', () => {
  it('E7: truncated envelope throws VaultEnvelopeFormatError', async () => {
    const key = await generateWebCryptoKey();
    const tooShort = new Uint8Array(10); // < 1 + 12 + 16
    const error = await open(tooShort, key, webCryptoProvider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultEnvelopeFormatError);
    expect((error as Error).name).toBe('VaultEnvelopeFormatError');
    expect((error as Error).message).toBe('Envelope too short: expected at least 29 bytes, got 10');
  });

  it('E7b: exactly the minimum header length (29 bytes, no ciphertext) is accepted as well-formed', async () => {
    const key = await generateWebCryptoKey();
    const exactly29 = new Uint8Array(29);
    exactly29[0] = ENVELOPE_VERSION;
    // Not a real sealed envelope (garbage IV/tag), so this must fail
    // authentication, not the length check — proves the boundary is `< 29`,
    // not `<= 29`.
    const error = await open(exactly29, key, webCryptoProvider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultTamperError);
  });

  it('E8: unknown envelope version throws VaultEnvelopeFormatError', async () => {
    const key = await generateWebCryptoKey();
    const sealed = await seal(utf8('x'), key, webCryptoProvider);
    const badVersion = sealed.slice();
    badVersion[0] = 99;
    const error = await open(badVersion, key, webCryptoProvider).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultEnvelopeFormatError);
    expect((error as Error).name).toBe('VaultEnvelopeFormatError');
    expect((error as Error).message).toBe('Unsupported envelope version: 99');
  });
});

// Independently generated with Python's `cryptography` package (OpenSSL-backed —
// a different implementation than the Node WebCrypto provider these tests
// otherwise exercise). See docs/specs/document-vault-spec.md "Known-answer
// test vectors".
describe('known-answer test vectors (E10-E11)', () => {
  it('E10a: NIST/McGrew GCM Test Case 1 (zero key/iv, empty plaintext/AAD)', async () => {
    const key = await importWebCryptoKey(hexToBytes('00'.repeat(32)));
    const sealed = buildEnvelope('00'.repeat(12), '530f8afbc74536b9a963b4f1c4cb738b', '');

    const opened = await open(sealed, key, webCryptoProvider);

    expect(opened).toEqual(new Uint8Array(0));
  });

  it('E10b: door-code-shaped plaintext with non-zero key/iv', async () => {
    const keyHex = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
    const key = await importWebCryptoKey(hexToBytes(keyHex));
    const sealed = buildEnvelope(
      '101112131415161718191a1b',
      'cc3ba6c96fb22877e872c0f2aa94838b',
      'e284c86ce014789f6b64abac57e9',
    );

    const opened = await open(sealed, key, webCryptoProvider);

    expect(new TextDecoder().decode(opened)).toBe('Portkod: 4471#');
  });

  it('E10c: 64-byte binary-shaped plaintext with non-zero key/iv', async () => {
    const key = await importWebCryptoKey(hexToBytes('5f'.repeat(32)));
    const sealed = buildEnvelope(
      'aa'.repeat(12),
      '616b0473da1e49c70617835202cd955c',
      'aa1868ebacf8894d76c0b38c49a90180fbf09345e238f6df83e87ae791fb9cad2c13d63537a91857e939fb74d72463d9814db6f3f074f1fd6bb75b32b35d2917',
    );

    const opened = await open(sealed, key, webCryptoProvider);

    expect(opened).toEqual(Uint8Array.from({ length: 64 }, (_, i) => i));
  });

  it('E11: flipping a byte of a known-answer ciphertext throws VaultTamperError', async () => {
    const key = await importWebCryptoKey(hexToBytes('5f'.repeat(32)));
    const sealed = buildEnvelope(
      'aa'.repeat(12),
      '616b0473da1e49c70617835202cd955c',
      'aa1868ebacf8894d76c0b38c49a90180fbf09345e238f6df83e87ae791fb9cad2c13d63537a91857e939fb74d72463d9814db6f3f074f1fd6bb75b32b35d2917',
    );
    flipBit(sealed, sealed.length - 1);

    await expect(open(sealed, key, webCryptoProvider)).rejects.toBeInstanceOf(VaultTamperError);
  });
});
