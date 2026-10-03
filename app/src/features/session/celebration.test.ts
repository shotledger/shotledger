import {
  celebratesDiscipline,
  celebrationTier,
  markStampPending,
  takePendingStamp,
  tierToCelebrate,
  type TierContext,
} from './celebration';

const ten = { valueTenths: 100, isInnerTen: false };
const x = { valueTenths: 100, isInnerTen: true };
const nine = { valueTenths: 90, isInnerTen: false };
const ctx: TierContext = { seriesLength: 5, guldThreshold: 45, isSighter: false };

describe('celebrationTier', () => {
  it('is perfect when every shot is in the 10 ring', () => {
    expect(celebrationTier([ten, x, ten, ten, x], ctx)).toBe('perfect');
  });

  it('is perfectInner when every shot is an inner ten', () => {
    expect(celebrationTier([x, x, x, x, x], ctx)).toBe('perfectInner');
  });

  it('is nothing until the series is complete', () => {
    expect(celebrationTier([ten, ten, ten, ten, null], ctx)).toBeNull();
    expect(celebrationTier([ten, ten, ten, ten], ctx)).toBeNull();
  });

  it('follows the series length rather than a fixed 50', () => {
    const six = { ...ctx, seriesLength: 6 };
    expect(celebrationTier([ten, ten, ten, ten, ten], six)).toBeNull();
    expect(celebrationTier([ten, ten, ten, ten, ten, ten], six)).toBe('perfect');
  });

  it('counts decimal shots of 10.0 and up as the 10 ring', () => {
    const decimal = [101, 100, 109, 104, 100].map((v) => ({ valueTenths: v, isInnerTen: false }));
    expect(celebrationTier(decimal, ctx)).toBe('perfect');
    expect(
      celebrationTier([...decimal.slice(0, 4), { valueTenths: 99, isInnerTen: false }], ctx),
    ).toBe('gold');
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

  it('still celebrates a perfect sighter', () => {
    expect(celebrationTier([ten, ten, ten, ten, ten], { ...ctx, isSighter: true })).toBe('perfect');
  });
});

describe('tierToCelebrate', () => {
  it('celebrates a first tier', () => {
    expect(tierToCelebrate(null, 'perfect')).toBe('perfect');
  });

  it('stays quiet at or below the highest tier already reached', () => {
    expect(tierToCelebrate('perfect', 'perfect')).toBeNull();
    expect(tierToCelebrate('perfect', 'gold')).toBeNull();
    expect(tierToCelebrate('gold', null)).toBeNull();
  });

  it('celebrates a climb to a higher tier', () => {
    expect(tierToCelebrate('gold', 'perfect')).toBe('perfect');
    expect(tierToCelebrate('perfect', 'perfectInner')).toBe('perfectInner');
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

describe('stamp pending', () => {
  it('is taken once', () => {
    markStampPending('a');
    expect(takePendingStamp()).toBe('a');
    expect(takePendingStamp()).toBeNull();
  });
});
