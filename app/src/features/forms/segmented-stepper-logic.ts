// The step rule behind SegmentedStepper, free of React so it is tested on
// its own: a step moves one option along the list and stops at either end.
// A value missing from the list (the list narrowed under it) steps from the
// nearest end instead of jumping.

export function stepOption<T>(values: readonly T[], current: T, delta: -1 | 1): T | undefined {
  if (values.length === 0) return undefined;
  const index = values.indexOf(current);
  if (index === -1) return delta === 1 ? values[0] : values[values.length - 1];
  const next = Math.min(values.length - 1, Math.max(0, index + delta));
  return values[next];
}
