import { describe, expect, it } from 'vitest';

import { muzzleEnergyJoules, powerFactor } from './power-factor';

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

describe('muzzleEnergyJoules', () => {
  it('computes E = half m v squared', () => {
    // 124 gr = 0.00803506... kg; at 350 m/s that is 492.1 J.
    expect(muzzleEnergyJoules(124, 350)).toBeCloseTo(492.1, 1);
  });

  it('keeps a decimal where the number is small', () => {
    // An air pistol pellet: 8.2 gr at 145 m/s — single-digit joules, where
    // whole-joule rounding would erase the interesting part.
    const energy = muzzleEnergyJoules(8.2, 145)!;
    expect(energy).toBeGreaterThan(5);
    expect(energy).toBeLessThan(6);
    expect(Number.isInteger(energy)).toBe(false);
  });

  it('scales with the square of velocity, not linearly', () => {
    const single = muzzleEnergyJoules(100, 100)!;
    const double = muzzleEnergyJoules(100, 200)!;
    expect(double / single).toBeCloseTo(4, 3);
  });

  it('scales linearly with mass', () => {
    expect(muzzleEnergyJoules(200, 300)! / muzzleEnergyJoules(100, 300)!).toBeCloseTo(2, 3);
  });

  it('is null for anything missing or not usable', () => {
    expect(muzzleEnergyJoules(null, 350)).toBeNull();
    expect(muzzleEnergyJoules(124, null)).toBeNull();
    expect(muzzleEnergyJoules(undefined, undefined)).toBeNull();
    expect(muzzleEnergyJoules(0, 350)).toBeNull();
    expect(muzzleEnergyJoules(124, 0)).toBeNull();
    expect(muzzleEnergyJoules(-124, 350)).toBeNull();
    expect(muzzleEnergyJoules(124, -350)).toBeNull();
    expect(muzzleEnergyJoules(Number.NaN, 350)).toBeNull();
    expect(muzzleEnergyJoules(124, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('uses the defined grain, not a rounded one', () => {
    // 0.0648 kg/1000gr would put this at 7.51 J; the defined constant does not.
    const energy = muzzleEnergyJoules(8.2, 168.5)!;
    expect(energy).toBeLessThanOrEqual(7.6);
    expect(energy).toBeGreaterThan(7.0);
  });
});
