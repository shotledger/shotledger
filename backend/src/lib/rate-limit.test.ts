import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { isWithinLimit, windowStart } from './rate-limit';

describe('windowStart', () => {
  it('floors to the start of the containing window', () => {
    expect(windowStart(3_600_000 + 1234, 3_600_000)).toBe(3_600_000);
  });

  it('is exact at a window boundary', () => {
    expect(windowStart(7_200_000, 3_600_000)).toBe(7_200_000);
  });

  it('is 0 for times before the first window ends', () => {
    expect(windowStart(500, 3_600_000)).toBe(0);
  });

  it('property: result never exceeds nowMs', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (nowMs, windowMs) => {
          expect(windowStart(nowMs, windowMs)).toBeLessThanOrEqual(nowMs);
        },
      ),
    );
  });

  it('property: result is idempotent under re-application to its own output', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (nowMs, windowMs) => {
          const start = windowStart(nowMs, windowMs);
          expect(windowStart(start, windowMs)).toBe(start);
        },
      ),
    );
  });
});

describe('isWithinLimit', () => {
  it('allows the count strictly below the max', () => {
    expect(isWithinLimit(59, 60)).toBe(true);
  });

  it('rejects the count equal to the max (the Nth request was the last allowed)', () => {
    expect(isWithinLimit(60, 60)).toBe(false);
  });

  it('rejects a count above the max', () => {
    expect(isWithinLimit(61, 60)).toBe(false);
  });

  it('property: true for every count in [0, max) and false for every count in [max, max+50], exhaustive over a bounded range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        (count, max) => {
          expect(isWithinLimit(count, max)).toBe(count < max);
        },
      ),
    );
  });
});
