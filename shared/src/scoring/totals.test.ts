import { describe, expect, it } from 'vitest';

import { sumValueTenths, tenthsToScore } from './totals';

describe('sumValueTenths', () => {
  it('sums an empty list to 0', () => {
    expect(sumValueTenths([])).toBe(0);
  });

  it('sums integer-mode shots (value x10)', () => {
    expect(sumValueTenths([{ valueTenths: 90 }, { valueTenths: 100 }, { valueTenths: 80 }])).toBe(
      270,
    );
  });

  it('sums decimal-mode shots (tenths)', () => {
    expect(sumValueTenths([{ valueTenths: 103 }, { valueTenths: 98 }])).toBe(201);
  });
});

describe('tenthsToScore', () => {
  it('converts tenths to a display score', () => {
    expect(tenthsToScore(470)).toBe(47);
    expect(tenthsToScore(103)).toBe(10.3);
    expect(tenthsToScore(0)).toBe(0);
  });
});
