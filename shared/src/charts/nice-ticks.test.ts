import { describe, expect, it } from 'vitest';

import { niceStep, niceTicks, stepDecimals } from './nice-ticks.js';

describe('niceStep', () => {
  it.each([
    [1, 1],
    [1.2, 2],
    [2, 2],
    [2.1, 5],
    [4.9, 5],
    [5.01, 10],
    [7, 10],
    [0.3, 0.5],
    [0.03 / 0.01, 5],
    [13, 20],
    [130, 200],
    [0.0013, 0.002],
  ])('rounds %p up to %p', (rough, expected) => {
    expect(niceStep(rough)).toBeCloseTo(expected, 12);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuses %p', (rough) => {
    expect(() => niceStep(rough)).toThrow(RangeError);
  });
});

describe('stepDecimals', () => {
  it.each([
    [100, 0],
    [5, 0],
    [1, 0],
    [0.5, 1],
    [0.1, 1],
    [0.02, 2],
  ])('needs %p → %p digits', (step, digits) => {
    expect(stepDecimals(step)).toBe(digits);
  });
});

describe('niceTicks', () => {
  it('rounds a series total range out to tens', () => {
    expect(niceTicks(41, 98, 5)).toEqual({
      min: 40,
      max: 100,
      step: 20,
      ticks: [40, 60, 80, 100],
      decimals: 0,
    });
  });

  it('uses decimal steps for a decimal-scored range', () => {
    const result = niceTicks(9.3, 10.7, 5);
    expect(result.ticks).toEqual([9, 9.5, 10, 10.5, 11]);
    expect(result.step).toBe(0.5);
    expect(result.decimals).toBe(1);
  });

  it('leaves no float noise in the ticks', () => {
    const { ticks } = niceTicks(0.1, 0.7, 8);
    expect(ticks).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  });

  it('accepts the bounds in either order', () => {
    expect(niceTicks(98, 41, 5)).toEqual(niceTicks(41, 98, 5));
  });

  it('crosses zero without a negative zero tick', () => {
    const { ticks } = niceTicks(-3, 4, 5);
    expect(ticks).toEqual([-4, -2, 0, 2, 4]);
    expect(ticks.some((t) => Object.is(t, -0))).toBe(false);
  });

  it('widens a single value to one step either side', () => {
    expect(niceTicks(50, 50, 5).ticks).toEqual([45, 50, 55]);
    expect(niceTicks(0, 0, 5).ticks).toEqual([-1, -0.5, 0, 0.5, 1]);
  });

  it.each([
    [0, 1000, 2],
    [0, 1000, 3],
    [3, 97, 4],
    [0, 600, 6],
    [-0.4, 0.37, 5],
    [1234, 5678, 7],
  ])('never exceeds the tick budget (%p..%p, %p)', (lo, hi, max) => {
    const result = niceTicks(lo, hi, max);
    expect(result.ticks.length).toBeLessThanOrEqual(max);
    expect(result.ticks.length).toBeGreaterThanOrEqual(2);
    expect(result.min).toBeLessThanOrEqual(lo);
    expect(result.max).toBeGreaterThanOrEqual(hi);
    for (let i = 1; i < result.ticks.length; i += 1) {
      expect(result.ticks[i]! - result.ticks[i - 1]!).toBeCloseTo(result.step, 9);
    }
  });

  it('defaults to five ticks', () => {
    expect(niceTicks(0, 100)).toEqual(niceTicks(0, 100, 5));
    expect(niceTicks(0, 100).ticks).toEqual([0, 50, 100]);
  });

  it.each([
    [Number.NaN, 1, 5],
    [0, Number.POSITIVE_INFINITY, 5],
    [0, 1, 1],
    [0, 1, 2.5],
  ])('refuses (%p, %p, %p)', (lo, hi, max) => {
    expect(() => niceTicks(lo, hi, max)).toThrow(RangeError);
  });
});
