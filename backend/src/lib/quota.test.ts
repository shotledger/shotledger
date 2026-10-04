import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { applyQuotaDelta, checkQuota } from './quota';

describe('checkQuota', () => {
  it('allows an upload strictly under the limit', () => {
    expect(checkQuota(100, 1000, 200)).toEqual({ allowed: true });
  });

  it('allows an upload that lands exactly at the limit (inclusive boundary)', () => {
    expect(checkQuota(800, 1000, 200)).toEqual({ allowed: true });
  });

  it('rejects an upload that would exceed the limit by one byte', () => {
    expect(checkQuota(800, 1000, 201)).toEqual({ allowed: false, reason: 'quota_exceeded' });
  });

  it('rejects when already over the limit (no incoming bytes)', () => {
    expect(checkQuota(1001, 1000, 0)).toEqual({ allowed: false, reason: 'quota_exceeded' });
  });

  it('property: an upload is allowed exactly when it ends at or under the limit', () => {
    // Built from the boundary: the upload overshoots the free space by `over`
    // bytes, so the expected answer is the sign of `over`.
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000_000 }),
        fc.nat({ max: 10_000_000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (usedBytes, freeBytes, over) => {
          fc.pre(freeBytes + over >= 0);
          const result = checkQuota(usedBytes, usedBytes + freeBytes, freeBytes + over);
          expect(result).toEqual(
            over <= 0 ? { allowed: true } : { allowed: false, reason: 'quota_exceeded' },
          );
        },
      ),
    );
  });
});

describe('applyQuotaDelta', () => {
  it('adds a positive delta normally', () => {
    expect(applyQuotaDelta(100, 50)).toBe(150);
  });

  it('subtracts a negative delta normally', () => {
    expect(applyQuotaDelta(100, -50)).toBe(50);
  });

  it('clamps at 0 rather than going negative', () => {
    expect(applyQuotaDelta(100, -500)).toBe(0);
  });

  it('property: result is never negative for any inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        (usedBytes, deltaBytes) => {
          expect(applyQuotaDelta(usedBytes, deltaBytes)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('property: a normal (non-underflowing) decrement actually decrements — pairs the never-negative bound', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 10_000_000 }),
        fc.integer({ min: 1, max: 999 }),
        (usedBytes, decrement) => {
          expect(applyQuotaDelta(usedBytes, -decrement)).toBe(usedBytes - decrement);
        },
      ),
    );
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_BACKEND_001
 */
it('allows an upload exactly at the limit and floors usage at zero', () => {
  expect(checkQuota(800, 1000, 200)).toEqual({ allowed: true });
  expect(checkQuota(800, 1000, 201)).toEqual({ allowed: false, reason: 'quota_exceeded' });
  expect(applyQuotaDelta(100, -1000)).toBe(0);
});
