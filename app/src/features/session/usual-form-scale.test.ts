import { signed, usualFormMarks } from './usual-form-scale';

describe('usualFormMarks', () => {
  it('centres the usual mark and places today by two usual spreads', () => {
    // SD 10 → half span 20; today 10 above → 0.5 + 10/40.
    expect(usualFormMarks(450, 460, 10)).toEqual({ usual: 0.5, today: 0.75 });
    expect(usualFormMarks(450, 440, 10)).toEqual({ usual: 0.5, today: 0.25 });
  });

  it('widens the bar when today is beyond two spreads, keeping today inside it', () => {
    // Difference 100 → half span 125 → 0.5 + 100/250.
    expect(usualFormMarks(450, 550, 10).today).toBeCloseTo(0.9, 12);
    expect(usualFormMarks(450, 350, 10).today).toBeCloseTo(0.1, 12);
  });

  it('copes with no spread at all', () => {
    expect(usualFormMarks(450, 450, null)).toEqual({ usual: 0.5, today: 0.5 });
    expect(usualFormMarks(450, 450, 0)).toEqual({ usual: 0.5, today: 0.5 });
    expect(usualFormMarks(450, 452, 0).today).toBeCloseTo(0.9, 12);
  });
});

describe('signed', () => {
  it('puts a plus on positive numbers only', () => {
    expect(signed(1.6, 2)).toBe('+1.60');
    expect(signed(-0.4, 2)).toBe('-0.40');
    expect(signed(0, 1)).toBe('0.0');
  });

  it('never shows a signed zero after rounding', () => {
    expect(signed(0.001, 2)).toBe('0.00');
    expect(signed(-0.001, 2)).toBe('0.00');
  });
});
