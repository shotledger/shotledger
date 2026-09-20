import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, nextBackoffMs, shouldRetry } from './backoff';

describe('nextBackoffMs', () => {
  it('starts at exactly the base delay', () => {
    expect(nextBackoffMs(0)).toBe(BACKOFF_BASE_MS);
  });

  it('doubles per attempt', () => {
    expect(nextBackoffMs(1)).toBe(BACKOFF_BASE_MS * 2);
    expect(nextBackoffMs(3)).toBe(BACKOFF_BASE_MS * 8);
  });

  it('clamps at the maximum', () => {
    expect(nextBackoffMs(50)).toBe(BACKOFF_MAX_MS);
  });

  it('treats a negative attempt as the first one', () => {
    expect(nextBackoffMs(-3)).toBe(BACKOFF_BASE_MS);
  });

  it('honors overridden bounds', () => {
    expect(nextBackoffMs(2, { baseMs: 10, maxMs: 25 })).toBe(25);
    expect(nextBackoffMs(1, { baseMs: 10, maxMs: 100 })).toBe(20);
  });

  it('property: never exceeds the cap and never decreases', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), (attempt) => {
        const value = nextBackoffMs(attempt);
        expect(value).toBeLessThanOrEqual(BACKOFF_MAX_MS);
        expect(value).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
        expect(Number.isFinite(value)).toBe(true);
        expect(nextBackoffMs(attempt + 1)).toBeGreaterThanOrEqual(value);
      }),
    );
  });
});

describe('shouldRetry', () => {
  it('does not retry a dead session', () => {
    expect(shouldRetry('unauthenticated')).toBe(false);
  });

  it('retries transient failures', () => {
    expect(shouldRetry('network')).toBe(true);
    expect(shouldRetry('unknown')).toBe(true);
    expect(shouldRetry('versionUnsupported')).toBe(true);
  });
});
