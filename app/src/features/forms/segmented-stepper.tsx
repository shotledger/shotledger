// A number picked by stepping (#822, finding "Six ways to pick one option"):
// a segmented track of three 48dp cells, − / value / +. It replaces the rows
// of seven bare digits on fält station entry, whose cells were about 40dp
// wide on a phone and under the touch-target floor. The value cell takes the
// segmented control's selected state, so it reads as the current choice.
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { stepOption } from '@/features/forms/segmented-stepper-logic';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { MIN_TOUCH_TARGET, Radius, Spacing, TabularNums } from '@/theme/tokens';

export interface SegmentedStepperOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedStepperProps<T extends string> extends Omit<ViewProps, 'style'> {
  /** In order, lowest first. */
  options: readonly SegmentedStepperOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The field's name, read with the value and on each button. */
  label: string;
  /** Already-translated button names ("Hits, decrease"). */
  decrementLabel: string;
  incrementLabel: string;
  style?: ViewProps['style'];
}

export function SegmentedStepper<T extends string>({
  options,
  value,
  onChange,
  label,
  decrementLabel,
  incrementLabel,
  style,
  testID,
  ...rest
}: SegmentedStepperProps<T>) {
  const theme = useTheme();
  const values = options.map((option) => option.value);
  const index = values.indexOf(value);
  const current = options[index]?.label ?? value;
  const atMin = index <= 0 && index !== -1;
  const atMax = index === values.length - 1;

  function step(delta: -1 | 1) {
    const next = stepOption(values, value, delta);
    if (next !== undefined && next !== value) onChange(next);
  }

  function button(delta: -1 | 1, name: string, glyph: string, disabled: boolean, id: string) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => step(delta)}
        testID={testID ? `${testID}-${id}` : undefined}
        style={({ pressed }) => [
          styles.button,
          { borderColor: theme.border },
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <ThemedText type="headline" themeColor={disabled ? 'textSecondary' : 'text'}>
          {glyph}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={[styles.track, style]} testID={testID} {...rest}>
      {button(-1, decrementLabel, '−', atMin || values.length === 0, 'decrement')}
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${label}, ${current}`}
        accessibilityLiveRegion="polite"
        style={[
          styles.value,
          { backgroundColor: theme.selected, borderColor: theme.selectedOutline },
        ]}
        testID={testID ? `${testID}-value` : undefined}
      >
        <ThemedText type="headline" style={TabularNums}>
          {current}
        </ThemedText>
      </View>
      {button(1, incrementLabel, '+', atMax || values.length === 0, 'increment')}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.medium,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  // Material's 48dp minimum touch target in both directions.
  button: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: Radius.small,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
