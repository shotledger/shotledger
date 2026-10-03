import { describe, expect, it } from 'vitest';

import fixtures from './hole-features.fixtures.json';
import {
  HOLE_CROP_PX,
  HOLE_FILTER_BIAS,
  HOLE_FILTER_WEIGHTS,
  HOLE_PROBABILITY_THRESHOLD,
  holeFeatures,
  holeProbability,
  isHoleLike,
  reflectIndex,
  type GrayCrop,
  type HoleFeatures,
} from './hole-features';

const FEATURE_KEYS = [
  'orientEntropy',
  'hfEnergy',
  'laplacianVar',
  'gradMean',
  'centerDeviation',
  'stdDev',
] as const satisfies readonly (keyof HoleFeatures)[];

/** The fixture names features in snake_case; map once, here. */
const SNAKE_KEY: Record<(typeof FEATURE_KEYS)[number], string> = {
  orientEntropy: 'orient_entropy',
  hfEnergy: 'hf_energy',
  laplacianVar: 'laplacian_var',
  gradMean: 'grad_mean',
  centerDeviation: 'center_deviation',
  stdDev: 'std',
};

function crop(size: number, fill: (x: number, y: number) => number): GrayCrop {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) data[y * size + x] = fill(x, y);
  }
  return { data, size };
}

/**
 * Set when the fixture came from the Python spike (until ADR 0018), whose
 * OpenCV and numpy ran this pipeline in float32, the TypeScript in float64, so
 * the two agree to about 1e-7 relative and no closer. See the spec's revision
 * note on behavior 7: this bound is still orders of magnitude tighter than
 * either porting bug the fixture actually caught.
 */
const LOCKSTEP_RELATIVE_TOLERANCE = 1e-4;

function expectLockStep(actual: number, expected: number, what: string): void {
  const allowed = LOCKSTEP_RELATIVE_TOLERANCE * Math.max(1, Math.abs(expected));
  const difference = Math.abs(actual - expected);
  if (difference > allowed) {
    throw new Error(
      `${what}: got ${actual}, fixture ${expected} ` +
        `(difference ${difference}, allowed ${allowed})`,
    );
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = Buffer.from(value, 'base64');
  return new Uint8Array(binary);
}

describe('reflectIndex', () => {
  it('leaves an in-range index alone', () => {
    for (let i = 0; i < 5; i += 1) expect(reflectIndex(i, 5)).toBe(i);
  });

  it('mirrors without repeating the edge pixel, as BORDER_REFLECT_101 does', () => {
    expect(reflectIndex(-1, 5)).toBe(1);
    expect(reflectIndex(-2, 5)).toBe(2);
    expect(reflectIndex(5, 5)).toBe(3);
    expect(reflectIndex(6, 5)).toBe(2);
  });

  it('keeps folding until it lands inside, however far out the index is', () => {
    for (let i = -30; i <= 30; i += 1) {
      const folded = reflectIndex(i, 5);
      expect(folded).toBeGreaterThanOrEqual(0);
      expect(folded).toBeLessThan(5);
    }
  });

  it('collapses a single-pixel axis to its only index', () => {
    expect(reflectIndex(-7, 1)).toBe(0);
    expect(reflectIndex(0, 1)).toBe(0);
    expect(reflectIndex(9, 1)).toBe(0);
  });
});

describe('holeFeatures', () => {
  it('reports no texture at all for a uniform crop', () => {
    const features = holeFeatures(crop(32, () => 137));
    for (const key of FEATURE_KEYS) expect(features[key]).toBeCloseTo(0, 9);
  });

  it('is blind to a constant brightness offset', () => {
    const shape = (x: number, y: number) => ((x * 7 + y * 13) % 11) * 6;
    const dark = holeFeatures(crop(30, shape));
    const light = holeFeatures(crop(30, (x, y) => shape(x, y) + 40));
    for (const key of FEATURE_KEYS) expect(light[key]).toBeCloseTo(dark[key], 9);
  });

  it('gives a straight printed edge less orientation entropy than torn noise', () => {
    const edge = holeFeatures(crop(32, (x) => (x < 16 ? 30 : 220)));
    let seed = 1;
    const noise = holeFeatures(
      crop(32, () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % 256;
      }),
    );
    expect(edge.orientEntropy).toBeLessThan(noise.orientEntropy);
  });

  it('measures the center window as a magnitude, so polarity does not matter', () => {
    const bright = crop(30, (x, y) => (Math.abs(x - 15) < 5 && Math.abs(y - 15) < 5 ? 220 : 40));
    const dark = crop(30, (x, y) => (Math.abs(x - 15) < 5 && Math.abs(y - 15) < 5 ? 40 : 220));
    expect(holeFeatures(bright).centerDeviation).toBeGreaterThan(0.1);
    expect(holeFeatures(dark).centerDeviation).toBeCloseTo(holeFeatures(bright).centerDeviation, 9);
  });

  it('returns zeros rather than reading past the end of a short buffer', () => {
    // Deliberately textured, so a missing length guard would compute real
    // numbers off the front of the buffer instead of quietly reading zeros.
    const short = new Uint8Array(10);
    for (let i = 0; i < short.length; i += 1) short[i] = i * 25;
    const features = holeFeatures({ data: short, size: 32 });
    for (const key of FEATURE_KEYS) expect(features[key]).toBe(0);
  });

  it('returns zeros for a crop too small to convolve', () => {
    for (const size of [0, 1, 2, 2.5]) {
      const data = new Uint8Array(16);
      for (let i = 0; i < data.length; i += 1) data[i] = i * 15;
      const features = holeFeatures({ data, size });
      for (const key of FEATURE_KEYS) expect(features[key]).toBe(0);
    }
  });

  it('does measure the smallest crop a 3x3 kernel fits on', () => {
    // The boundary the size guard is written against: 3 is in, 2 is out.
    const features = holeFeatures({
      data: new Uint8Array([0, 120, 255, 30, 200, 10, 90, 15, 240]),
      size: 3,
    });
    expect(features.stdDev).toBeGreaterThan(0);
    expect(features.gradMean).toBeGreaterThan(0);
    expect(features.centerDeviation).toBeGreaterThan(0);
  });
});

describe('holeProbability', () => {
  it('is the logistic of bias plus the weighted features', () => {
    const features: HoleFeatures = {
      orientEntropy: 2.5,
      hfEnergy: 3,
      laplacianVar: 50,
      gradMean: 0.2,
      centerDeviation: 0.3,
      stdDev: 0.2,
    };
    const w = HOLE_FILTER_WEIGHTS;
    const z =
      HOLE_FILTER_BIAS +
      w.orientEntropy * 2.5 +
      w.hfEnergy * 3 +
      w.laplacianVar * 50 +
      w.gradMean * 0.2 +
      w.centerDeviation * 0.3 +
      w.stdDev * 0.2;
    expect(holeProbability(features)).toBeCloseTo(1 / (1 + Math.exp(-z)), 12);
  });

  it('saturates without overflowing at absurd inputs', () => {
    const big = Object.fromEntries(FEATURE_KEYS.map((k) => [k, 1e6])) as unknown as HoleFeatures;
    const small = Object.fromEntries(FEATURE_KEYS.map((k) => [k, -1e6])) as unknown as HoleFeatures;
    expect(holeProbability(big)).toBeGreaterThanOrEqual(0);
    expect(holeProbability(big)).toBeLessThanOrEqual(1);
    expect(holeProbability(small)).toBeGreaterThanOrEqual(0);
    expect(holeProbability(small)).toBeLessThanOrEqual(1);
    expect(Number.isNaN(holeProbability(big))).toBe(false);
    expect(Number.isNaN(holeProbability(small))).toBe(false);
  });

  it('isHoleLike cuts exactly at the threshold, inclusive', () => {
    const at = { probability: HOLE_PROBABILITY_THRESHOLD } as const;
    expect(at.probability).toBe(0.5);
    // Constructed so the logistic lands exactly on 0.5: z === 0.
    const zeroZ: HoleFeatures = {
      orientEntropy: -HOLE_FILTER_BIAS / HOLE_FILTER_WEIGHTS.orientEntropy,
      hfEnergy: 0,
      laplacianVar: 0,
      gradMean: 0,
      centerDeviation: 0,
      stdDev: 0,
    };
    expect(holeProbability(zeroZ)).toBeCloseTo(0.5, 12);
    expect(isHoleLike(zeroZ)).toBe(true);
  });
});

describe('lock-step with the fixture', () => {
  it('uses the crop size the weights were fitted on', () => {
    expect(HOLE_CROP_PX).toBe(fixtures.cropPx);
  });

  it('ships the constants the fixture was generated with', () => {
    expect(HOLE_FILTER_BIAS).toBeCloseTo(fixtures.bias, 12);
    expect(HOLE_PROBABILITY_THRESHOLD).toBeCloseTo(fixtures.threshold, 12);
    for (const key of FEATURE_KEYS) {
      const fixtureWeight = (fixtures.weights as Record<string, number>)[SNAKE_KEY[key]];
      expect(HOLE_FILTER_WEIGHTS[key]).toBeCloseTo(fixtureWeight as number, 12);
    }
  });

  it('has fixtures that actually span both answers', () => {
    // Otherwise the reproduction below could hold while the filter decided
    // nothing at all.
    const probabilities = fixtures.cases.map((c) => c.probability);
    expect(probabilities.some((p) => p >= 0.5)).toBe(true);
    expect(probabilities.some((p) => p < 0.5)).toBe(true);
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures.cases.map((c) => [c.name, c] as const))(
    'reproduces OpenCV feature values for %s',
    (_name, testCase) => {
      const features = holeFeatures({
        data: decodeBase64(testCase.dataBase64),
        size: testCase.size,
      });
      for (const key of FEATURE_KEYS) {
        const expected = (testCase.features as Record<string, number>)[SNAKE_KEY[key]];
        expectLockStep(features[key], expected as number, key);
      }
      expectLockStep(holeProbability(features), testCase.probability, 'probability');
    },
  );

  it('reads the flat dark patch as not a hole', () => {
    const patch = fixtures.cases.find((c) => c.name === 'flat_patch_dark');
    expect(patch).toBeDefined();
    const features = holeFeatures({
      data: decodeBase64(patch!.dataBase64),
      size: patch!.size,
    });
    expect(isHoleLike(features)).toBe(false);
  });

  it('reads the hole the same in either polarity', () => {
    const inBlack = fixtures.cases.find((c) => c.name === 'hole_in_black');
    const onPaper = fixtures.cases.find((c) => c.name === 'hole_on_paper');
    expect(inBlack).toBeDefined();
    expect(onPaper).toBeDefined();
    const a = holeFeatures({ data: decodeBase64(inBlack!.dataBase64), size: inBlack!.size });
    const b = holeFeatures({ data: decodeBase64(onPaper!.dataBase64), size: onPaper!.size });
    expect(isHoleLike(a)).toBe(true);
    expect(isHoleLike(b)).toBe(true);
    for (const key of FEATURE_KEYS) expect(b[key]).toBeCloseTo(a[key], 9);
  });
});
