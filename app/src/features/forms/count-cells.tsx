// A count picked in one tap (#822, finding "Six ways to pick one option"):
// every value as a 48dp cell on a segmented track, wrapping onto evened-out
// rows when one row would push a cell under 48dp. It replaces the rows of
// seven bare digits on fält station entry, which were about 40dp wide on a
// phone. Selected is the `selected` fill plus a `selectedOutline` border, as
// on SegmentedControl; every cell carries the 2px border, so nothing moves.
import { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { countCellsLayout, MIN_CELL } from '@/features/forms/count-cells-layout';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing, TabularNums } from '@/theme/tokens';

export interface CountCellsOption<T extends string> {
  value: T;
  label: string;
}

export interface CountCellsProps<T extends string> extends Omit<ViewProps, 'style'> {
  /** In order, lowest first. */
  options: readonly CountCellsOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The field's name, for a screen reader ("Hits"). */
  label: string;
  style?: ViewProps['style'];
}

const GAP = Spacing.half;

export function CountCells<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
  testID,
  ...rest
}: CountCellsProps<T>) {
  const theme = useTheme();
  // The track's inner width; 0 until the first layout, which draws one row.
  const [width, setWidth] = useState(0);
  const { cellWidth } = countCellsLayout(width, options.length, GAP);

  return (
    <ThemedView
      type="backgroundElement"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, style]}
      testID={testID}
      {...rest}
    >
      <View
        style={styles.row}
        onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`${label} ${option.label}`}
              onPress={() => onChange(option.value)}
              testID={testID ? `${testID}-${option.value}` : undefined}
              style={({ pressed }) => [
                styles.cell,
                width > 0 ? { width: cellWidth } : styles.cellUnmeasured,
                pressed && { backgroundColor: theme.backgroundSelected },
                selected && {
                  backgroundColor: theme.selected,
                  borderColor: theme.selectedOutline,
                },
              ]}
            >
              <ThemedText
                type="headline"
                themeColor={selected ? 'text' : 'textSecondary'}
                style={TabularNums}
              >
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: Radius.medium,
    padding: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  // Material's 48dp touch-target floor in both directions.
  cell: {
    minWidth: MIN_CELL,
    minHeight: MIN_CELL,
    borderRadius: Radius.small,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellUnmeasured: {
    flexGrow: 1,
  },
});
