import {
  fromFraction,
  moveThumb,
  nearestThumb,
  snap,
  toFraction,
  type RangeBounds,
} from './range-slider-math';

// The shot timer's random start delay: 0-10 s in whole seconds.
const B: RangeBounds = { min: 0, max: 10, step: 1 };
const TENTHS: RangeBounds = { min: 0, max: 3, step: 0.1 };

describe('snap', () => {
  it('snaps to the nearest step', () => {
    expect(snap(2.4, B)).toBe(2);
    expect(snap(2.6, B)).toBe(3);
  });

  it('clamps into range', () => {
    expect(snap(-5, B)).toBe(0);
    expect(snap(99, B)).toBe(10);
  });

  it('never leaves the range when the grid overshoots the max', () => {
    // max is not on the grid: 0, 0.3, 0.6 ... 2.9 would round past 3.
    expect(snap(2.99, { min: 0, max: 3, step: 0.3 })).toBeLessThanOrEqual(3);
  });

  it('does not accumulate float dust', () => {
    expect(snap(0.30000000000000004, TENTHS)).toBe(0.3);
    expect(snap(2.7000000000000002, TENTHS)).toBe(2.7);
  });

  it('rejects a nonsensical step rather than looping', () => {
    expect(() => snap(1, { ...B, step: 0 })).toThrow(RangeError);
    expect(() => snap(1, { ...B, step: -1 })).toThrow(RangeError);
  });
});

describe('toFraction / fromFraction', () => {
  it('round-trips a value on the grid', () => {
    for (const v of [0, 3, 7, 10]) expect(fromFraction(toFraction(v, B), B)).toBe(v);
  });

  it('clamps the fraction to the track', () => {
    expect(toFraction(-5, B)).toBe(0);
    expect(toFraction(50, B)).toBe(1);
  });

  it('does not divide by zero on a degenerate track', () => {
    expect(toFraction(5, { min: 5, max: 5 })).toBe(0);
  });
});

describe('nearestThumb', () => {
  it('grabs the closer thumb', () => {
    expect(nearestThumb(0.1, 1, 8, B)).toBe('low');
    expect(nearestThumb(0.9, 1, 8, B)).toBe('high');
  });

  it('breaks a tie toward low, so the pair can still be opened up', () => {
    expect(nearestThumb(toFraction(5, B), 5, 5, B)).toBe('low');
  });

  it('breaks a tie toward high when low is pinned at the maximum', () => {
    // Both at max: grabbing low would be stuck, since it cannot move right.
    expect(nearestThumb(1, 10, 10, B)).toBe('high');
  });
});

describe('moveThumb', () => {
  it('moves the low thumb', () => {
    expect(moveThumb('low', 3, 1, 8, B)).toEqual({ low: 3, high: 8 });
  });

  it('moves the high thumb', () => {
    expect(moveThumb('high', 6, 1, 8, B)).toEqual({ low: 1, high: 6 });
  });

  it('pushes rather than swaps when low is dragged past high', () => {
    // Swapping would hand your finger the other thumb mid-drag.
    expect(moveThumb('low', 9, 1, 4, B)).toEqual({ low: 9, high: 9 });
  });

  it('pushes rather than swaps when high is dragged below low', () => {
    expect(moveThumb('high', 2, 5, 8, B)).toEqual({ low: 2, high: 2 });
  });

  it('keeps low <= high however it is driven', () => {
    for (const to of [-3, 0, 4, 7, 99]) {
      for (const thumb of ['low', 'high'] as const) {
        const r = moveThumb(thumb, to, 3, 6, B);
        expect(r.low).toBeLessThanOrEqual(r.high);
        expect(r.low).toBeGreaterThanOrEqual(B.min);
        expect(r.high).toBeLessThanOrEqual(B.max);
      }
    }
  });
});
