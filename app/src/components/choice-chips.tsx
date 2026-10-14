// Choice Chips (#822, DESIGN.md "Choice Chips"): a wrapping row of pill
// options, single or multi select. Selected is the `selected` fill plus a
// 2px `selectedOutline` edge, so a choice never rests on border thickness or
// text colour alone (WCAG 1.4.11). Every chip carries the 2px border, so
// selecting one moves nothing. Use Segmented for two to four exclusive
// options that fit one row; chips for more, or for "any of".
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { toggleChoice, type ChoiceMode } from '@/components/choice-chips-logic';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/tokens';

export interface ChoiceChipOption<T extends string> {
  value: T;
  label: string;
  /** Set on the chip's own pressable, for tests and e2e flows. */
  testID?: string;
}

export interface ChoiceChipsProps<T extends string> extends Omit<ViewProps, 'children'> {
  options: readonly ChoiceChipOption<T>[];
  /** The chosen values. Single select holds at most one. */
  value: readonly T[];
  onChange: (value: T[]) => void;
  mode?: ChoiceMode;
  /** Names the group for a screen reader ("Disciplines"). */
  accessibilityLabel?: string;
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  mode = 'single',
  style,
  ...rest
}: ChoiceChipsProps<T>) {
  const theme = useTheme();
  const order = options.map((o) => o.value);

  return (
    <View
      // Single select is a radio group; multi select is a set of checkboxes.
      accessibilityRole={mode === 'single' ? 'radiogroup' : undefined}
      style={[styles.row, style]}
      {...rest}
    >
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={option.label}
            testID={option.testID}
            onPress={() => onChange(toggleChoice(value, option.value, mode, order))}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: theme.border },
              pressed && { backgroundColor: theme.backgroundSelected },
              selected && { backgroundColor: theme.selected, borderColor: theme.selectedOutline },
            ]}
          >
            <ThemedText
              type={selected ? 'smallBold' : 'small'}
              themeColor={selected ? 'text' : 'textSecondary'}
              numberOfLines={1}
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
