// The arithmetic behind RangeSlider, kept out of the component so the rules
// are testable without a renderer or a gesture.
//
// Two thumbs on one track: the shot timer's random start delay is a *range*
// ("somewhere between 2 and 5 seconds"), and two stacked single-thumb sliders
// made that look like two unrelated settings.

export interface RangeBounds {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Snaps to the step grid and clamps into [min, max]. */
export function snap(value: number, { min, max, step }: RangeBounds): number {
  if (!(step > 0)) throw new RangeError(`step must be > 0, got ${step}`);
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  // Re-clamp: rounding can push the last grid point past max.
  const bounded = Math.min(max, Math.max(min, snapped));
  // Kill float dust from repeated addition (0.30000000000000004).
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(bounded.toFixed(decimals));
}

/** Fraction 0..1 of the way along the track. */
export function toFraction(value: number, { min, max }: Pick<RangeBounds, 'min' | 'max'>): number {
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** The value at a fraction 0..1 along the track, snapped. */
export function fromFraction(fraction: number, bounds: RangeBounds): number {
  return snap(bounds.min + fraction * (bounds.max - bounds.min), bounds);
}

export type Thumb = 'low' | 'high';

/**
 * Which thumb a touch at `fraction` should grab.
 *
 * Ties go to the low thumb *except* when both sit at the maximum, where the
 * low thumb can no longer move right and grabbing it would feel stuck.
 */
export function nearestThumb(
  fraction: number,
  low: number,
  high: number,
  bounds: RangeBounds,
): Thumb {
  const lowDistance = Math.abs(fraction - toFraction(low, bounds));
  const highDistance = Math.abs(fraction - toFraction(high, bounds));
  if (lowDistance === highDistance) return low >= bounds.max ? 'high' : 'low';
  return lowDistance < highDistance ? 'low' : 'high';
}

/**
 * Moves one thumb, keeping low <= high.
 *
 * The thumbs push rather than swap: dragging low past high carries high along.
 * Swapping would mean the thumb under your finger silently becomes the other
 * one, and the value you were setting starts moving the wrong way.
 */
export function moveThumb(
  thumb: Thumb,
  to: number,
  low: number,
  high: number,
  bounds: RangeBounds,
): { low: number; high: number } {
  const value = snap(to, bounds);
  if (thumb === 'low') {
    return { low: value, high: Math.max(value, high) };
  }
  return { low: Math.min(value, low), high: value };
}
