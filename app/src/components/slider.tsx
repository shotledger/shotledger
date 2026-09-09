// A plain React Native slider. There is no slider primitive in this project:
// `@react-native-community/slider` is not a dependency, and adding one is out
// of bounds (§0 rule 2), so this is built from `PanResponder` the way
// `corner-adjuster.tsx` and `mark-loupe.tsx` already are — which also keeps it
// identical on Android, iOS and the web preview.
import { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  PanResponder,
  type PanResponderInstance,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/theme/tokens';

const TRACK_HEIGHT = 6;
const THUMB_SIZE = 28;
// Material's 48dp minimum touch target: the track is thin, the grab area is not.
const TOUCH_HEIGHT = 48;

export interface SliderProps extends Omit<ViewProps, 'style' | 'onLayout'> {
  value: number;
  min: number;
  max: number;
  /** Values snap to this grid. Default 1 — these are whole seconds. */
  step?: number;
  onChange: (value: number) => void;
  /** Spoken/announced label; the value itself is announced from `value`. */
  accessibilityLabel: string;
  style?: ViewProps['style'];
}

function snap(raw: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((raw - min) / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  accessibilityLabel,
  style,
  ...rest
}: SliderProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  // The pan handlers are created once, so the live geometry and callback are
  // read through refs rather than closed over — same pattern as CornerAdjuster.
  const widthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const rangeRef = useRef({ min, max, step });
  useEffect(() => {
    onChangeRef.current = onChange;
    rangeRef.current = { min, max, step };
  }, [onChange, min, max, step]);

  const [responder, setResponder] = useState<PanResponderInstance | null>(null);
  useEffect(() => {
    function pick(locationX: number): void {
      const trackWidth = widthRef.current;
      if (trackWidth <= 0) return;
      const { min: lo, max: hi, step: grid } = rangeRef.current;
      const ratio = Math.min(1, Math.max(0, locationX / trackWidth));
      onChangeRef.current(snap(lo + ratio * (hi - lo), lo, hi, grid));
    }
    setResponder(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => pick(event.nativeEvent.locationX),
        onPanResponderMove: (event) => pick(event.nativeEvent.locationX),
      }),
    );
  }, []);

  function onLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    setWidth(next);
  }

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const thumbLeft = Math.min(1, Math.max(0, ratio)) * Math.max(0, width - THUMB_SIZE);

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
        onChange(snap(value + delta, min, max, step));
      }}
      style={[styles.container, style]}
      onLayout={onLayout}
      {...(responder?.panHandlers ?? {})}
      {...rest}
    >
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: theme.primary }]} />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          { left: thumbLeft, backgroundColor: theme.primary, borderColor: theme.background },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: TOUCH_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: Radius.small,
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_HEIGHT,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
});
