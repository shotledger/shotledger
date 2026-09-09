import { describe, expect, it } from 'vitest';

import { powerFactor } from './power-factor';

describe('powerFactor', () => {
  it('returns null when either input is missing', () => {
    expect(powerFactor(null, 350)).toBeNull();
    expect(powerFactor(124, null)).toBeNull();
    expect(powerFactor(null, null)).toBeNull();
    expect(powerFactor(undefined, 350)).toBeNull();
    expect(powerFactor(124, undefined)).toBeNull();
  });

  it('returns null for unusable numbers', () => {
    expect(powerFactor(0, 350)).toBeNull();
    expect(powerFactor(124, 0)).toBeNull();
    expect(powerFactor(-124, 350)).toBeNull();
    expect(powerFactor(124, -350)).toBeNull();
    expect(powerFactor(Number.NaN, 350)).toBeNull();
    expect(powerFactor(124, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('computes grain·fps/1000 from a metric velocity', () => {
    // 304.8 m/s is exactly 1000 fps, so the power factor is the bullet weight.
    expect(powerFactor(125, 304.8)).toBe(125);
    expect(powerFactor(165, 304.8)).toBe(165);
    expect(powerFactor(180, 304.8)).toBe(180);
  });

  it('truncates the fraction rather than rounding it', () => {
    // 124.999… fps-equivalent: one thousandth short of the 125 Minor floor.
    expect(powerFactor(125, 304.7975)).toBe(124);
    // Comfortably over — the fraction is dropped, not rounded up.
    expect(powerFactor(125, 304.9)).toBe(125);
    expect(powerFactor(125, 307.0)).toBe(125);
  });

  it('matches real loads', () => {
    // 124 gr 9x19 at 350 m/s (1148 fps) — Minor.
    expect(powerFactor(124, 350)).toBe(142);
    // 180 gr .40 S&W at 300 m/s (984 fps) — Major.
    expect(powerFactor(180, 300)).toBe(177);
    // 115 gr 9x19 at 365 m/s.
    expect(powerFactor(115, 365)).toBe(137);
    // 40 gr .22 LR at 330 m/s — nowhere near either floor.
    expect(powerFactor(40, 330)).toBe(43);
  });

  it('handles fractional bullet weights', () => {
    expect(powerFactor(122.5, 350)).toBe(140);
  });
});
