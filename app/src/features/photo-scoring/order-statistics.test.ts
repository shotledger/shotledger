import { kthSmallest, quantile } from './order-statistics';

/** The sort-based quantile it replaced in closeup-lock.ts, kept as the oracle. */
function sortedQuantile(values: Float64Array, q: number): number {
  const s = Float64Array.from(values).sort();
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, s.length - 1);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (pos - lo);
}

/** mulberry32, so a failure reproduces. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = 'continuous' | 'fewDistinct' | 'allEqual' | 'sorted' | 'reversed' | 'signedZeros';

function sample(shape: Shape, n: number, next: () => number): Float64Array {
  const a = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    switch (shape) {
      case 'continuous':
        a[i] = (next() - 0.3) * 1000;
        break;
      case 'fewDistinct':
        a[i] = Math.floor(next() * 5);
        break;
      case 'allEqual':
        a[i] = 7.25;
        break;
      case 'sorted':
        a[i] = i * 0.5;
        break;
      case 'reversed':
        a[i] = (n - i) * 0.5;
        break;
      case 'signedZeros':
        a[i] = [0, -0, 1, -1][Math.floor(next() * 4)] as number;
        break;
    }
  }
  if (shape === 'sorted' || shape === 'reversed') return a;
  // shuffle, so the duplicates and extremes are not where the pivot looks first
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const t = a[i] as number;
    a[i] = a[j] as number;
    a[j] = t;
  }
  return a;
}

const SHAPES: readonly Shape[] = [
  'continuous',
  'fewDistinct',
  'allEqual',
  'sorted',
  'reversed',
  'signedZeros',
];
const LENGTHS = [1, 2, 3, 4, 5, 10, 11, 100, 101, 1000, 1001, 4096, 4097];
const FIXED_Q = [0, 1, 0.05, 0.95, 0.5];

it('quantile is bit-identical to the sort-based version', () => {
  const next = rng(20261003);
  let checked = 0;
  for (const shape of SHAPES) {
    for (const n of LENGTHS) {
      for (let rep = 0; rep < 4; rep += 1) {
        const values = sample(shape, n, next);
        const before = Float64Array.from(values);
        for (const q of [...FIXED_Q, next(), next()]) {
          const got = quantile(values, q);
          const want = sortedQuantile(values, q);
          if (!Object.is(got, want)) {
            throw new Error(`${shape} n=${n} q=${q}: got ${got}, want ${want}`);
          }
          checked += 1;
        }
        // the caller's array is left as it was
        expect(values).toEqual(before);
      }
    }
  }
  expect(checked).toBe(SHAPES.length * LENGTHS.length * 4 * (FIXED_Q.length + 2));
});

it('quantile of an empty array is NaN, as the sort-based version gave', () => {
  expect(quantile(new Float64Array(0), 0.95)).toBeNaN();
  expect(sortedQuantile(new Float64Array(0), 0.95)).toBeNaN();
});

it('kthSmallest returns the k-th order statistic and partitions around it', () => {
  const next = rng(7);
  for (const n of [1, 2, 3, 50, 51, 999]) {
    const values = sample('fewDistinct', n, next);
    const sorted = Float64Array.from(values).sort();
    for (const k of [0, n >> 1, n - 1]) {
      const a = Float64Array.from(values);
      const v = kthSmallest(a, k);
      expect(v).toBe(sorted[k]);
      for (let i = 0; i < k; i += 1) expect(a[i]).toBeLessThanOrEqual(v);
      for (let i = k + 1; i < n; i += 1) expect(a[i]).toBeGreaterThanOrEqual(v);
    }
  }
});
