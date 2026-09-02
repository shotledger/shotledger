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

  it('rejects an odd-length string', () => {
    expect(() => hexToBytes('abc')).toThrow(InvalidHexError);
  });

  it('rejects a non-hex character rather than silently decoding NaN bytes', () => {
    expect(() => hexToBytes('zz')).toThrow(InvalidHexError);
    expect(() => hexToBytes('00 11')).toThrow(InvalidHexError);
  });
});
