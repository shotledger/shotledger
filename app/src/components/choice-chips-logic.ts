// The selection rule behind ChoiceChips, kept free of React so it is tested
// on its own. Single select behaves like a radio group (tapping the chosen
// chip keeps it chosen); multi select toggles, in the options' own order.

export type ChoiceMode = 'single' | 'multi';

/**
 * The selection after tapping `tapped`. `order` is the options' values, so a
 * multi selection always comes back in display order, whatever order the
 * chips were tapped in.
 */
export function toggleChoice<T extends string>(
  selected: readonly T[],
  tapped: T,
  mode: ChoiceMode,
  order: readonly T[],
): T[] {
  if (mode === 'single') return [tapped];
  const next = selected.includes(tapped)
    ? selected.filter((v) => v !== tapped)
    : [...selected, tapped];
  return order.filter((v) => next.includes(v));
}
