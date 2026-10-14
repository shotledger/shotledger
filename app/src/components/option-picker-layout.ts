// Which of the two single-choice controls an OptionPicker draws (#822,
// finding "Six ways to pick one option"): Segmented for two to four short
// options that share one row, Choice Chips for anything more or longer.
// Kept free of React so the rule is tested on its own.

export type OptionPickerLayout = 'segmented' | 'chips';

/**
 * The longest label each option count still fits as an equal-width segment
 * on a 360dp phone inside a card, at Label size: two options get about
 * 140dp each, four get about 65dp. Measured in characters, which is the
 * honest unit here: the labels are translated, so the rule has to look at
 * the words actually on screen.
 */
const MAX_SEGMENT_LABEL: Readonly<Record<number, number>> = { 2: 16, 3: 11, 4: 7 };

export function optionPickerLayout(labels: readonly string[]): OptionPickerLayout {
  const limit = MAX_SEGMENT_LABEL[labels.length];
  if (limit === undefined) return 'chips';
  return labels.every((label) => [...label].length <= limit) ? 'segmented' : 'chips';
}
