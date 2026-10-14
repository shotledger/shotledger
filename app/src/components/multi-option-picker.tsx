// Multi-select sibling of OptionPicker, drawn as multi-select ChoiceChips
// (#822) so "any of" uses the same pills and selected state as every other
// choice. Added for the analytics report's tag filter ("let the user filter
// by one or more tags"); the toggle-one-value API is kept for its callers.
import { ChoiceChips } from '@/components/choice-chips';
import { ThemedText } from '@/components/themed-text';

export interface MultiPickerOption {
  value: string;
  label: string;
}

export interface MultiOptionPickerProps {
  options: readonly MultiPickerOption[];
  values: readonly string[];
  onToggle: (value: string) => void;
  /** Rendered instead of the options when the list is empty. */
  emptyLabel?: string;
  /** Names the group for a screen reader ("Tags"). */
  accessibilityLabel?: string;
  testID?: string;
}

export function MultiOptionPicker({
  options,
  values,
  onToggle,
  emptyLabel,
  accessibilityLabel,
  testID,
}: MultiOptionPickerProps) {
  if (options.length === 0 && emptyLabel) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {emptyLabel}
      </ThemedText>
    );
  }

  return (
    <ChoiceChips
      mode="multi"
      options={options}
      value={values}
      // ChoiceChips hands back the whole selection; the one value whose state
      // changed is the one that was tapped.
      onChange={(next) => {
        const tapped = options.find(
          (option) => next.includes(option.value) !== values.includes(option.value),
        );
        if (tapped) onToggle(tapped.value);
      }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  );
}
