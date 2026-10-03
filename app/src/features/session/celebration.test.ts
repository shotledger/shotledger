import {
  celebratesDiscipline,
  celebrationTier,
  tierToCelebrate,
  totalFillFraction,
  type TierContext,
} from './celebration';

const ten = { valueTenths: 100, isInnerTen: false };
const x = { valueTenths: 100, isInnerTen: true };
const nine = { valueTenths: 90, isInnerTen: false };
const ctx: TierContext = { mode: 'integer', seriesLength: 5, guldThreshold: 45, isSighter: false };
const decimal = (values: number[]) => values.map((v) => ({ valueTenths: v, isInnerTen: false }));

describe('celebrationTier', () => {
  it('is fullScore when every shot is in the 10 ring', () => {
    expect(celebrationTier([ten, x, ten, ten, x], ctx)).toBe('fullScore');
  });

  it('is perfect when every shot is an inner ten', () => {
    expect(celebrationTier([x, x, x, x, x], ctx)).toBe('perfect');
  });

  it('is nothing until the series is complete', () => {
    expect(celebrationTier([x, x, x, x, null], ctx)).toBeNull();
    expect(celebrationTier([ten, ten, ten, ten], ctx)).toBeNull();
  });

  it('follows the series length rather than a fixed 50', () => {
    const six = { ...ctx, seriesLength: 6 };
    expect(celebrationTier([ten, ten, ten, ten, ten], six)).toBeNull();
    expect(celebrationTier([ten, ten, ten, ten, ten, ten], six)).toBe('fullScore');
  });

  it('in decimal, is fullScore from 10.0 and perfect only at 10.9 every shot', () => {
    const dec = { ...ctx, mode: 'decimal' as const };
    expect(celebrationTier(decimal([101, 100, 109, 104, 100]), dec)).toBe('fullScore');
    expect(celebrationTier(decimal([109, 109, 109, 109, 109]), dec)).toBe('perfect');
    expect(celebrationTier(decimal([109, 109, 109, 109, 108]), dec)).toBe('fullScore');
  });

  it('in decimal, the inner-ten flag alone is not perfect', () => {
    expect(celebrationTier([x, x, x, x, x], { ...ctx, mode: 'decimal' })).toBe('fullScore');
  });

  it('is gold at the threshold, nothing below it', () => {
    expect(celebrationTier([ten, ten, ten, nine, nine], { ...ctx, guldThreshold: 48 })).toBe(
      'gold',
    );
    expect(celebrationTier([ten, ten, ten, nine, nine], { ...ctx, guldThreshold: 49 })).toBeNull();
  });

  it('gives no gold tier without a threshold or on a sighter', () => {
    expect(celebrationTier([ten, ten, ten, ten, nine], { ...ctx, guldThreshold: null })).toBeNull();
    expect(celebrationTier([ten, ten, ten, ten, nine], { ...ctx, isSighter: true })).toBeNull();
  });

  it('still celebrates a full score on a sighter', () => {
    expect(celebrationTier([ten, ten, ten, ten, ten], { ...ctx, isSighter: true })).toBe(
      'fullScore',
    );
  });
});

describe('tierToCelebrate', () => {
  it('celebrates a first tier', () => {
    expect(tierToCelebrate(null, 'fullScore')).toBe('fullScore');
  });

  it('stays quiet at or below the highest tier already reached', () => {
    expect(tierToCelebrate('fullScore', 'fullScore')).toBeNull();
    expect(tierToCelebrate('fullScore', 'gold')).toBeNull();
    expect(tierToCelebrate('gold', null)).toBeNull();
  });

  it('celebrates a climb to a higher tier', () => {
    expect(tierToCelebrate('gold', 'fullScore')).toBe('fullScore');
    expect(tierToCelebrate('fullScore', 'perfect')).toBe('perfect');
  });
});

describe('totalFillFraction', () => {
  it('is the total over every shot in the 10 ring', () => {
    expect(totalFillFraction(470, 5)).toBeCloseTo(0.94);
    expect(totalFillFraction(500, 5)).toBe(1);
    expect(totalFillFraction(0, 5)).toBe(0);
  });

  it('caps a decimal total above 50 at full', () => {
    expect(totalFillFraction(545, 5)).toBe(1);
  });

  it('is empty for a series with no length', () => {
    expect(totalFillFraction(100, 0)).toBe(0);
  });
});

describe('celebratesDiscipline', () => {
  it.each(['spsf-precision', 'spsf-magnumprecision', 'spsf-milsnabb'])('includes %s', (id) => {
    expect(celebratesDiscipline(id)).toBe(true);
  });

  it.each(['spsf-falt', 'issf-air-pistol', null, undefined])('excludes %s', (id) => {
    expect(celebratesDiscipline(id)).toBe(false);
  });
});
