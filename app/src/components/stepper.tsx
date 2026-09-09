// Integer stepper with an explicit "not recorded" state, for the signed
// nullable integer columns (sight elevation/windage clicks). A free-text
// numeric field let `3.5`, `1e3` and `--2` reach those columns; here the only
// reachable values are integers inside [min, max], or null.
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { stepperNext } from '@/components/stepper-value';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

/** Delay before a held button starts repeating, then the repeat interval. */
const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 90;

export interface StepperProps extends Omit<ViewProps, 'style'> {
  /** `null` is the explicit "not recorded" state, which maps to SQL NULL. */
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step?: number;
  /** Already-translated accessibility labels (§0 rule 5 — no `t` in here). */
  decrementLabel: string;
  incrementLabel: string;
  /** Given, a button that returns the value to `null` is shown. */
  clearLabel?: string;
  /** Renders the value; the default is a plain signed integer / em dash. */
  format?: (value: number | null) => string;
  style?: ViewProps['style'];
}

function defaultFormat(value: number | null): string {
  if (value === null) return '—';
  return value > 0 ? `+${value}` : String(value);
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  decrementLabel,
  incrementLabel,
  clearLabel,
  format = defaultFormat,
  style,
  testID,
  ...rest
}: StepperProps) {
  const theme = useTheme();

  // The repeat timers fire outside render, so they read the live value and
  // callback through refs — written in an effect, never during render.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [value, onChange]);

  const holdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeated = useRef(false);

  useEffect(
    () => () => {
      if (holdTimeout.current !== null) clearTimeout(holdTimeout.current);
      if (holdInterval.current !== null) clearInterval(holdInterval.current);
    },
    [],
  );

  function stopHold() {
    if (holdTimeout.current !== null) {
      clearTimeout(holdTimeout.current);
      holdTimeout.current = null;
    }
    if (holdInterval.current !== null) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  }

  function bump(delta: number) {
    onChangeRef.current(stepperNext(valueRef.current, delta, min, max, step));
  }

  function startHold(delta: number) {
    stopHold();
    repeated.current = false;
    holdTimeout.current = setTimeout(() => {
      holdInterval.current = setInterval(() => {
        repeated.current = true;
        bump(delta);
      }, HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  /** `onPress` still fires when a hold is released — that release must not
   *  add a step on top of the ones the repeat already applied. */
  function onPressButton(delta: number) {
    if (repeated.current) {
      repeated.current = false;
      return;
    }
    bump(delta);
  }

  const atMin = value !== null && value <= min;
  const atMax = value !== null && value >= max;

  function button(delta: number, label: string, glyph: string, disabled: boolean, id: string) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onPressButton(delta)}
        onPressIn={() => startHold(delta)}
        onPressOut={stopHold}
        testID={testID ? `${testID}-${id}` : undefined}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <ThemedText type="subtitle" themeColor={disabled ? 'textSecondary' : 'text'}>
          {glyph}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, style]} testID={testID} {...rest}>
      <ThemedView type="backgroundElement" style={styles.track}>
        {button(-1, decrementLabel, '−', atMin, 'decrement')}
        <ThemedText
          type="smallBold"
          style={styles.value}
          numberOfLines={1}
          testID={testID ? `${testID}-value` : undefined}
        >
          {format(value)}
        </ThemedText>
        {button(1, incrementLabel, '+', atMax, 'increment')}
      </ThemedView>
      {clearLabel !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          accessibilityState={{ disabled: value === null }}
          disabled={value === null}
          onPress={() => onChange(null)}
          testID={testID ? `${testID}-clear` : undefined}
          style={styles.clear}
        >
          <ThemedText type="small" themeColor={value === null ? 'textSecondary' : 'text'}>
            {clearLabel}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.medium,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  button: {
    // Material's 48dp minimum touch target, not a spacing value — it is
    // deliberately off the 2/4/8/16/24/32/64 scale and should stay 48.
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.small,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  value: {
    flex: 1,
    textAlign: 'center',
  },
  clear: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
