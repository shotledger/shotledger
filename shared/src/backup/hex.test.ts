import { describe, expect, it } from 'vitest';

import { bytesToHex, hexToBytes, InvalidHexError } from './hex';

describe('hex', () => {
  it('round-trips arbitrary bytes, zero-padding each one', () => {
    const bytes = Uint8Array.from([0, 1, 15, 16, 127, 128, 254, 255]);
    expect(bytesToHex(bytes)).toBe('00010f107f80feff');
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('round-trips the empty string', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });

  it('accepts uppercase input', () => {
    expect(hexToBytes('AABB')).toEqual(Uint8Array.from([0xaa, 0xbb]));
  });

  it('rejects an odd-length string, naming the length in the message', () => {
    expect(() => hexToBytes('abc')).toThrow(InvalidHexError);
    // The exact wording is asserted so a mutant that empties it is caught: a
    // silent or blank error is what turns a bad bundle into a mystery.
    expect(() => hexToBytes('abc')).toThrow('hex string has odd length: 3');
    try {
      hexToBytes('abc');
      expect.unreachable();
    } catch (error) {
      expect((error as Error).name).toBe('InvalidHexError');
    }
  });

  it('rejects a non-hex character rather than silently decoding NaN bytes', () => {
    expect(() => hexToBytes('zz')).toThrow(InvalidHexError);
    expect(() => hexToBytes('zz')).toThrow('hex string contains a non-hex character');
    expect(() => hexToBytes('00 11')).toThrow(InvalidHexError);
  });

  it('decodes exactly as many bytes as the string holds', () => {
    // Locks the loop bound: an extra iteration would append a byte here.
    for (const [hex, length] of [
      ['', 0],
      ['00', 1],
      ['0011', 2],
      ['001122', 3],
    ] as const) {
      expect(hexToBytes(hex).length, hex).toBe(length);
    }
  });
});
