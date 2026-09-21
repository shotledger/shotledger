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

  it('property: allowed matches the spec definition exactly for all non-negative inputs', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000_000 }),
        fc.nat({ max: 10_000_000 }),
        fc.nat({ max: 10_000_000 }),
        (usedBytes, limitBytes, incomingBytes) => {
          const result = checkQuota(usedBytes, limitBytes, incomingBytes);
          expect(result.allowed).toBe(usedBytes + incomingBytes <= limitBytes);
          if (!result.allowed) expect(result.reason).toBe('quota_exceeded');
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
 * Top-level and identifier-titled so reqstool can match this testcase back to
 * its annotation — see the convention in ADR 0015.
 *
 * @SVCs SVC_BACKEND_001
 */
it('quota_boundary_is_inclusive_and_usage_is_floored_at_zero', () => {
  expect(checkQuota(800, 1000, 200)).toEqual({ allowed: true });
  expect(checkQuota(800, 1000, 201)).toEqual({ allowed: false, reason: 'quota_exceeded' });
  expect(applyQuotaDelta(100, -1000)).toBe(0);
});
