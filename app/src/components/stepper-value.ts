// `Stepper`'s value rules, kept out of the component so they can be tested
// (and reused) without dragging React Native — and, through the theme, the
// SQLite client — into the test runner.

/**
 * The next value for one press. `null` ("not recorded") enters the recorded
 * state at the clamped zero rather than at ±step, so a setting that really is
 * on the shooter's zero is one press away — 0 is the most likely value the
 * sight-click columns hold.
 */
export function stepperNext(
  value: number | null,
  delta: number,
  min: number,
  max: number,
  step = 1,
): number {
  if (value === null) return clampStepperValue(0, min, max);
  return clampStepperValue(Math.round(value) + delta * step, min, max);
}

/** Integer inside [min, max]; a non-finite input falls back to a clamped 0. */
export function clampStepperValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Math.min(Math.max(0, min), max);
  return Math.min(Math.max(Math.round(value), min), max);
}
