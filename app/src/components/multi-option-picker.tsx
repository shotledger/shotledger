// Multi-select sibling of OptionPicker — same rounded pills, but any number
// of them can be on at once. Added for the analytics report's tag filter
// ("let the user filter by one or more tags").
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

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
  testID?: string;
}

export function MultiOptionPicker({
  options,
  values,
  onToggle,
  emptyLabel,
  testID,
}: MultiOptionPickerProps) {
  const theme = useTheme();

  if (options.length === 0 && emptyLabel) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {emptyLabel}
      </ThemedText>
    );
  }

  return (
    <View style={styles.row} testID={testID}>
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            onPress={() => onToggle(option.value)}
            style={[
              styles.pill,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              selected && { borderColor: theme.primary, backgroundColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
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
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
