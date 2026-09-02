import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

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
}

/**
 * A wrapping row of selectable pills. Used where a SegmentedControl would be
 * too cramped — disciplines, programs, vapengrupper, klasser, firearms.
 */
export function OptionPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  emptyLabel,
}: OptionPickerProps<T>) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {label ? <ThemedText type="smallBold">{label}</ThemedText> : null}
      {options.length === 0 && emptyLabel ? (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyLabel}
        </ThemedText>
      ) : (
        <View style={styles.row}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={option.testID}
                onPress={() => onChange(option.value)}
                style={[
                  styles.pill,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  selected && {
                    borderColor: theme.primary,
                    backgroundColor: theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
