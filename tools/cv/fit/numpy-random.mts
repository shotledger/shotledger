// numpy's `np.random.default_rng(seed).shuffle(list)` in TypeScript, so the
// fits split photos into the same cross-validation folds the Python did:
// SeedSequence -> PCG64 (XSL-RR 128/64) -> Generator.shuffle's untyped path,
// which draws each swap index with `random_interval` (masked rejection on
// 32-bit draws). Checked against numpy 2.5 in tools.check.ts.

const MASK32 = 0xffffffff;
const M128 = (1n << 128n) - 1n;
const M64 = (1n << 64n) - 1n;
const PCG_MULT = (2549297995355413924n << 64n) + 4865540595714422341n;

const mul32 = (a: number, b: number) => Math.imul(a, b) >>> 0;

/** `SeedSequence(seed).generate_state(4, np.uint64)` for a non-negative integer seed. */
function seedState(seed: number): bigint[] {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError(`seed ${seed}`);
  const entropy: number[] = [];
  for (let n = BigInt(seed); entropy.length === 0 || n > 0n; n >>= 32n) {
    entropy.push(Number(n & 0xffffffffn));
  }
  let hashConst = 0x43b0d7e5;
  const hashmix = (value: number) => {
    let v = (value ^ hashConst) >>> 0;
    hashConst = mul32(hashConst, 0x931e8875);
    v = mul32(v, hashConst);
    return (v ^ (v >>> 16)) >>> 0;
  };
  const mix = (x: number, y: number) => {
    const r = (mul32(0xca01f9dd, x) - mul32(0x4973f715, y)) >>> 0;
    return (r ^ (r >>> 16)) >>> 0;
  };
  const pool = [0, 0, 0, 0].map((_, i) => hashmix(entropy[i] ?? 0));
  for (let src = 0; src < 4; src += 1) {
    for (let dst = 0; dst < 4; dst += 1) {
      if (src !== dst) pool[dst] = mix(pool[dst]!, hashmix(pool[src]!));
    }
  }
  for (let src = 4; src < entropy.length; src += 1) {
    for (let dst = 0; dst < 4; dst += 1) pool[dst] = mix(pool[dst]!, hashmix(entropy[src]!));
  }
  let hashB = 0x8b51f9dd;
  const words: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    let v = (pool[i % 4]! ^ hashB) >>> 0;
    hashB = mul32(hashB, 0x58f38ded);
    v = mul32(v, hashB);
    words.push((v ^ (v >>> 16)) >>> 0);
  }
  // uint32 words viewed as little-endian uint64
  return [0, 1, 2, 3].map((i) => (BigInt(words[2 * i + 1]!) << 32n) | BigInt(words[2 * i]!));
}

/** numpy's PCG64 bit generator, seeded as `default_rng(seed)` seeds it. */
export class Pcg64 {
  private state = 0n;
  private readonly inc: bigint;
  private spare: number | null = null;

  constructor(seed: number) {
    const [s0, s1, i0, i1] = seedState(seed) as [bigint, bigint, bigint, bigint];
    this.inc = ((((i0 << 64n) | i1) << 1n) | 1n) & M128;
    this.step();
    this.state = (this.state + ((s0 << 64n) | s1)) & M128;
    this.step();
  }

  private step(): void {
    this.state = (this.state * PCG_MULT + this.inc) & M128;
  }

  next64(): bigint {
    this.step();
    const x = ((this.state >> 64n) ^ this.state) & M64;
    const rot = this.state >> 122n;
    return ((x >> rot) | (x << ((64n - rot) & 63n))) & M64;
  }

  /** Low half of a 64-bit draw, then its high half on the next call. */
  next32(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    const v = this.next64();
    this.spare = Number(v >> 32n);
    return Number(v & 0xffffffffn);
  }

  /** `random_interval(max)`: uniform on [0, max] by masked rejection. */
  interval(max: number): number {
    if (max === 0) return 0;
    if (max > MASK32) throw new RangeError('interval above 2^32 is not needed here');
    let mask = max;
    for (const s of [1, 2, 4, 8, 16]) mask |= mask >>> s;
    for (;;) {
      const v = (this.next32() & mask) >>> 0;
      if (v <= max) return v;
    }
  }

  /** `Generator.shuffle` on a Python list, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i >= 1; i -= 1) {
      const j = this.interval(i);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
