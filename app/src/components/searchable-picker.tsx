import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextInputProps } from 'react-native';

import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface SearchablePickerOption<T extends string | number> {
  value: T;
  label: string;
  testID?: string;
}

export interface SearchablePickerProps<T extends string | number> {
  label: string;
  /** Rendered on the label row, e.g. an `InfoButton`. */
  labelTrailing?: ReactNode;
  options: readonly SearchablePickerOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Shown on the closed field when nothing is selected. */
  placeholder?: string;
  /** Shown inside the filter box. Defaults to `label`. */
  searchPlaceholder?: string;
  /** Shown below the filter box when no option matches. */
  emptyLabel?: string;
  /** Shows a "Clear" affordance next to a selected value. */
  clearable?: boolean;
  clearLabel?: string;
  onClear?: () => void;
  keyboardType?: TextInputProps['keyboardType'];
  testID?: string;
}

/**
 * A text-filterable dropdown for a list too long for a wrapping pill row
 * (`OptionPicker`) — years, or anything else with dozens of options. Tap the
 * closed field to open a filter box and a scrollable list of matches; typing
 * narrows the list by substring match against each option's label.
 */
export function SearchablePicker<T extends string | number>({
  label,
  labelTrailing,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  clearable,
  clearLabel,
  onClear,
  keyboardType,
  testID,
}: SearchablePickerProps<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function select(option: SearchablePickerOption<T>) {
    onChange(option.value);
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.labelRow}>
        <ThemedText type="smallBold" style={styles.label}>
          {label}
        </ThemedText>
        {labelTrailing}
        {clearable && selected && onClear && clearLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClear();
              setOpen(false);
              setQuery('');
            }}
            testID={testID ? `${testID}-clear` : undefined}
          >
            <ThemedText type="small" themeColor="primary">
              {clearLabel}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, { borderColor: theme.border }]}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <ThemedText type="default" themeColor={selected ? 'text' : 'textSecondary'}>
          {selected ? selected.label : (placeholder ?? '')}
        </ThemedText>
      </Pressable>
      {open ? (
        <View
          style={[
            styles.dropdown,
            { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          ]}
        >
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder ?? label}
            keyboardType={keyboardType}
            autoFocus
            style={[styles.searchInput, { color: theme.text, borderColor: theme.border }]}
            testID={testID ? `${testID}-search` : undefined}
          />
          {filtered.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              {emptyLabel ?? ''}
            </ThemedText>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={String(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => select(option)}
                    testID={option.testID}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && { backgroundColor: theme.backgroundSelected },
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText type="default">{option.label}</ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
  },
  field: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: Radius.small,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  list: {
    maxHeight: 220,
  },
  option: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
  },
  pressed: {
    opacity: 0.6,
  },
  emptyText: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
});
