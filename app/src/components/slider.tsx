// The project's slider. A thin wrapper over `@react-native-community/slider`
// (added 2026-09-11 with the maintainer's approval, lifting the rule 2 block
// that made this a hand-rolled `PanResponder`), so the thumb, track and
// accessibility behaviour are the platform's rather than ours.
//
// The props are unchanged from the hand-rolled version — `min`/`max`/`step`
// and an `onChange` that fires with snapped values — so callers did not have
// to move. The underlying library names them `minimumValue`/`maximumValue`.
import Slider_ from '@react-native-community/slider';
import { StyleSheet, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// Material's minimum touch target. The library's own track is thinner than
// this; the height keeps the row comfortable to hit.
const TOUCH_HEIGHT = 48;

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  /** Values snap to this grid. Default 1 — these are whole seconds. */
  step?: number;
  onChange: (value: number) => void;
  /** Spoken/announced label; the value itself is announced from `value`. */
  accessibilityLabel: string;
  style?: ViewProps['style'];
  testID?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SliderProps) {
  const theme = useTheme();

  return (
    <Slider_
      value={value}
      minimumValue={min}
      maximumValue={max}
      step={step}
      onValueChange={onChange}
      accessibilityLabel={accessibilityLabel}
      minimumTrackTintColor={theme.primary}
      maximumTrackTintColor={theme.backgroundSelected}
      thumbTintColor={theme.primary}
      style={[styles.slider, style]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  slider: {
    height: TOUCH_HEIGHT,
  },
});
