// A single choice with a heading (#822, finding "Six ways to pick one
// option"). It no longer draws pills of its own: two to four short options
// render as a SegmentedControl, anything else as single-select ChoiceChips,
// so every screen that picks one thing uses one of the two controls and the
// same selected state (fill plus outline).
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { optionPickerLayout } from '@/components/option-picker-layout';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  testID?: string;
}

export interface OptionPickerProps<T extends string> {
  /** Omit inside a card that already names the field, to avoid a repeated heading. */
  label?: string;
  options: readonly PickerOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Rendered instead of the options when the list is empty. */
  emptyLabel?: string;
  /** Forces one of the two controls instead of choosing by count and length. */
  layout?: 'segmented' | 'chips';
  /** On the control itself (the radio group), not the heading. */
  testID?: string;
}

export function OptionPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  emptyLabel,
  layout,
  testID,
}: OptionPickerProps<T>) {
  const drawAs = layout ?? optionPickerLayout(options.map((option) => option.label));

  let control;
  if (options.length === 0 && emptyLabel) {
    control = (
      <ThemedText type="small" themeColor="textSecondary">
        {emptyLabel}
      </ThemedText>
    );
  } else if (drawAs === 'segmented') {
    control = (
      <SegmentedControl
        options={options}
        // Nothing chosen yet (null) leaves every segment unselected.
        value={value as T}
        onChange={onChange}
        scrollable={false}
        accessibilityLabel={label}
        testID={testID}
      />
    );
  } else {
    control = (
      <ChoiceChips
        options={options}
        value={value === null ? [] : [value]}
        onChange={(next) => {
          const [picked] = next;
          if (picked !== undefined) onChange(picked);
        }}
        accessibilityLabel={label}
        testID={testID}
      />
    );
  }

  return (
    <View style={styles.container}>
      {label ? <ThemedText type="smallBold">{label}</ThemedText> : null}
      {control}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
