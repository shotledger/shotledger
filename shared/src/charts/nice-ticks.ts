// "Nice" axis ticks: round steps of 1, 2 or 5 times a power of ten, so an
// axis reads 0, 20, 40, 60 rather than 0, 17.3, 34.6. Pure, shared by the
// app's chart kit and the web (#822). The method is Heckbert's "Nice numbers
// for graph labels" (Graphics Gems, 1990), with the tick count treated as a
// ceiling rather than a target.

export interface NiceTicks {
  /** The axis start, at or below the data minimum. */
  min: number;
  /** The axis end, at or above the data maximum. */
  max: number;
  /** The distance between ticks. */
  step: number;
  /** Every tick from `min` to `max` inclusive, free of float noise. */
  ticks: number[];
  /** Fraction digits a label needs to show every tick exactly. */
  decimals: number;
}

/** The nice step multipliers, smallest first. */
const STEPS = [1, 2, 5, 10] as const;

/** The smallest nice number (1, 2 or 5 times a power of ten) at or above `rough`. */
export function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) {
    throw new RangeError(`niceStep needs a positive finite number, got ${rough}`);
  }
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  // A tolerance, so 0.3 / 0.1 = 2.9999999999999996 still counts as 3 → 5.
  const multiplier = STEPS.find((s) => s >= fraction - 1e-9) ?? 10;
  return multiplier * magnitude;
}

/** Fraction digits a nice step needs: 0 for 5 or 20, 1 for 0.5, 2 for 0.02. */
export function stepDecimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/**
 * Ticks covering [`dataMin`, `dataMax`] with at most `maxTicks` ticks (at
 * least 2). The bounds may come in either order. An empty span (one value)
 * is widened to one nice step around it, so a single point still gets an axis.
 */
export function niceTicks(dataMin: number, dataMax: number, maxTicks = 5): NiceTicks {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    throw new RangeError(`niceTicks needs finite bounds, got ${dataMin} and ${dataMax}`);
  }
  if (!Number.isInteger(maxTicks) || maxTicks < 2) {
    throw new RangeError(`niceTicks needs at least 2 ticks, got ${maxTicks}`);
  }
  let lo = Math.min(dataMin, dataMax);
  let hi = Math.max(dataMin, dataMax);
  if (lo === hi) {
    const pad = lo === 0 ? 1 : niceStep(Math.abs(lo) / 10);
    lo -= pad;
    hi += pad;
  }

  // Start from the step that would fit exactly, and widen it until the
  // rounded-out axis fits the tick budget.
  let step = niceStep((hi - lo) / (maxTicks - 1));
  let start = Math.floor(lo / step + 1e-9) * step;
  let end = Math.ceil(hi / step - 1e-9) * step;
  while (Math.round((end - start) / step) + 1 > maxTicks) {
    step = niceStep(step * 1.000001);
    start = Math.floor(lo / step + 1e-9) * step;
    end = Math.ceil(hi / step - 1e-9) * step;
  }

  const decimals = stepDecimals(step);
  const clean = (v: number) => {
    const rounded = Number(v.toFixed(decimals));
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  const count = Math.round((end - start) / step) + 1;
  const ticks = Array.from({ length: count }, (_, i) => clean(start + i * step));
  return { min: ticks[0]!, max: ticks[ticks.length - 1]!, step: clean(step), ticks, decimals };
}
