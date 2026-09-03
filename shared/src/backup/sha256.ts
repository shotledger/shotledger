// SHA-256 (FIPS 180-4) and HMAC-SHA256 (RFC 2104) in portable TypeScript.
//
// Why hand-written here rather than a library call: the passphrase KDF for
// the vault section of a backup bundle needs hundreds of thousands of
// compressions, and the only hashing `expo-crypto` exposes is an async
// whole-message `digest()` — one native round trip per call, which puts any
// realistic iteration count out of reach. No hashing library is in the
// lockfile and CLAUDE.md rule 2 forbids adding one unasked.
//
// The confidentiality of a bundle still rests on native, reviewed AES-256-GCM;
// this file only stretches a passphrase into key bytes. Its correctness is
// established by differential testing against OpenSSL (`node:crypto`) over
// every length from 0 to several blocks plus randomised inputs, and by the
// published FIPS/RFC vectors — see sha256.test.ts and pbkdf2.test.ts.

export const SHA256_BLOCK_BYTES = 64;
export const SHA256_DIGEST_BYTES = 32;

// FIPS 180-4 §4.2.2 — first 32 bits of the fractional parts of the cube
// roots of the first 64 primes.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// FIPS 180-4 §5.3.3 — first 32 bits of the fractional parts of the square
// roots of the first eight primes.
const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/**
 * Streaming SHA-256. `state`/`processedBytes` exist so HMAC can resume from a
 * precomputed key-pad state instead of re-hashing the pad on every PBKDF2
 * iteration (see `HmacSha256`).
 */
export class Sha256 {
  private readonly h: Uint32Array;
  private readonly block = new Uint8Array(SHA256_BLOCK_BYTES);
  private readonly w = new Uint32Array(64);
  private blockLength = 0;
  private processedBytes: number;

  constructor(state?: Uint32Array, processedBytes = 0) {
    this.h = state ? Uint32Array.from(state) : Uint32Array.from(INITIAL_STATE);
    this.processedBytes = processedBytes;
  }

  /** A copy of the current chaining state — the input to `new Sha256(state, n)`. */
  cloneState(): Uint32Array {
    return Uint32Array.from(this.h);
  }

  update(bytes: Uint8Array): this {
    let offset = 0;
    while (offset < bytes.length) {
      const take = Math.min(SHA256_BLOCK_BYTES - this.blockLength, bytes.length - offset);
      this.block.set(bytes.subarray(offset, offset + take), this.blockLength);
      this.blockLength += take;
      offset += take;
      if (this.blockLength === SHA256_BLOCK_BYTES) {
        this.compress(this.block);
        this.processedBytes += SHA256_BLOCK_BYTES;
        this.blockLength = 0;
      }
    }
    return this;
  }

  /** Finalises and returns the 32-byte digest. The instance is spent afterwards. */
  digest(): Uint8Array {
    const totalBytes = this.processedBytes + this.blockLength;
    const bitLength = totalBytes * 8;

    // FIPS 180-4 §5.1.1: append 0x80, pad with zeros, then the 64-bit length.
    this.block.fill(0, this.blockLength);
    this.block[this.blockLength] = 0x80;
    if (this.blockLength >= SHA256_BLOCK_BYTES - 8) {
      this.compress(this.block);
      this.block.fill(0);
    }
    // Split as two 32-bit words: JS numbers are exact to 2^53, so the high
    // word is derived by division rather than a 64-bit shift.
    const view = new DataView(this.block.buffer, this.block.byteOffset, this.block.byteLength);
    view.setUint32(SHA256_BLOCK_BYTES - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(SHA256_BLOCK_BYTES - 4, bitLength >>> 0, false);
    this.compress(this.block);

    const out = new Uint8Array(SHA256_DIGEST_BYTES);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, this.h[i]!, false);
    return out;
  }

  private compress(block: Uint8Array): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const o = i * 4;
      w[i] =
        ((block[o]! << 24) | (block[o + 1]! << 16) | (block[o + 2]! << 8) | block[o + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!;
      const y = w[i - 2]!;
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = this.h[0]!;
    let b = this.h[1]!;
    let c = this.h[2]!;
    let d = this.h[3]!;
    let e = this.h[4]!;
    let f = this.h[5]!;
    let g = this.h[6]!;
    let hh = this.h[7]!;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    this.h[0] = (this.h[0]! + a) >>> 0;
    this.h[1] = (this.h[1]! + b) >>> 0;
    this.h[2] = (this.h[2]! + c) >>> 0;
    this.h[3] = (this.h[3]! + d) >>> 0;
    this.h[4] = (this.h[4]! + e) >>> 0;
    this.h[5] = (this.h[5]! + f) >>> 0;
    this.h[6] = (this.h[6]! + g) >>> 0;
    this.h[7] = (this.h[7]! + hh) >>> 0;
  }
}

export function sha256(bytes: Uint8Array): Uint8Array {
  return new Sha256().update(bytes).digest();
}

/**
 * HMAC-SHA256 (RFC 2104) with the two key-pad blocks compressed once at
 * construction: `sign()` then costs two compressions per short message, which
 * is what makes a six-figure PBKDF2 iteration count viable in JS.
 */
export class HmacSha256 {
  private readonly innerState: Uint32Array;
  private readonly outerState: Uint32Array;

  constructor(key: Uint8Array) {
    const padded = new Uint8Array(SHA256_BLOCK_BYTES);
    padded.set(key.length > SHA256_BLOCK_BYTES ? sha256(key) : key);

    const inner = new Uint8Array(SHA256_BLOCK_BYTES);
    const outer = new Uint8Array(SHA256_BLOCK_BYTES);
    for (let i = 0; i < SHA256_BLOCK_BYTES; i++) {
      inner[i] = padded[i]! ^ 0x36;
      outer[i] = padded[i]! ^ 0x5c;
    }
    padded.fill(0);

    this.innerState = new Sha256().update(inner).cloneState();
    this.outerState = new Sha256().update(outer).cloneState();
    inner.fill(0);
    outer.fill(0);
  }

  sign(message: Uint8Array): Uint8Array {
    const innerDigest = new Sha256(this.innerState, SHA256_BLOCK_BYTES).update(message).digest();
    return new Sha256(this.outerState, SHA256_BLOCK_BYTES).update(innerDigest).digest();
  }
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  return new HmacSha256(key).sign(message);
}
