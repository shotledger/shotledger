// One track, two thumbs — a range, not two settings that happen to be stacked.
//
// `@react-native-community/slider` (what components/slider.tsx wraps) is
// single-thumb only, so this is built on react-native-gesture-handler and
// reanimated, both already dependencies. No new dependency (hard rule 2).
//
// The arithmetic lives in range-slider-math.ts and is tested there; what is
// left here is layout, the gesture, and accessibility.
import { useState } from 'react';
import {
  type LayoutChangeEvent,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type ViewProps,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import {
  fromFraction,
  moveThumb,
  nearestThumb,
  toFraction,
  type RangeBounds,
  type Thumb,
} from '@/components/range-slider-math';

const TOUCH_HEIGHT = 48;
const TRACK_HEIGHT = 4;
const THUMB = 28;

export interface RangeSliderProps extends Omit<ViewProps, 'onLayout'> {
  low: number;
  high: number;
  min: number;
  max: number;
  /** Values snap to this grid. Default 1. */
  step?: number;
  onChange: (next: { low: number; high: number }) => void;
  /** Announced for each thumb; the value itself is announced from the range. */
  lowAccessibilityLabel: string;
  highAccessibilityLabel: string;
  testID?: string;
}

export function RangeSlider({
  low,
  high,
  min,
  max,
  step = 1,
  onChange,
  lowAccessibilityLabel,
  highAccessibilityLabel,
  testID,
  style,
  ...rest
}: RangeSliderProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const bounds: RangeBounds = { min, max, step };

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  // The usable track is inset by half a thumb at each end, so a thumb at the
  // extreme sits inside the component rather than half outside it.
  const usable = Math.max(1, width - THUMB);
  const xFor = (value: number) => toFraction(value, bounds) * usable;

  function applyAt(x: number, thumb: Thumb) {
    const value = fromFraction((x - THUMB / 2) / usable, bounds);
    onChange(moveThumb(thumb, value, low, high, bounds));
  }

  // Which thumb the current drag owns, decided once on touch-down: deciding
  // per-frame would hand the drag to the other thumb as soon as they met. A
  // A shared value rather than a ref or a local: a local resets on every
  // render (and this gesture re-renders on each frame it moves), and a ref
  // cannot be read from a callback built during render.
  const dragging = useSharedValue<Thumb>('low');
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      const fraction = (event.x - THUMB / 2) / usable;
      dragging.value = nearestThumb(fraction, low, high, bounds);
      runOnJS(applyAt)(event.x, dragging.value);
    })
    .onUpdate((event) => {
      runOnJS(applyAt)(event.x, dragging.value);
    })
    .runOnJS(true);

  /** Keyboard/switch-control users move a thumb one step at a time. */
  function adjust(thumb: Thumb, direction: 1 | -1) {
    const current = thumb === 'low' ? low : high;
    onChange(moveThumb(thumb, current + direction * step, low, high, bounds));
  }
  const onAction = (thumb: Thumb) => (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') adjust(thumb, 1);
    if (event.nativeEvent.actionName === 'decrement') adjust(thumb, -1);
  };

  const thumbStyle = (value: number) => [
    styles.thumb,
    { backgroundColor: theme.primary, left: xFor(value) },
  ];

  return (
    <View style={[styles.container, style]} onLayout={onLayout} testID={testID} {...rest}>
      <GestureDetector gesture={pan}>
        <View style={styles.surface}>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]} />
          {/* Only the span between the thumbs is "selected" — that span is the
              setting, which is the whole point of one track over two. */}
          <View
            style={[
              styles.track,
              styles.selected,
              {
                backgroundColor: theme.primary,
                left: xFor(low) + THUMB / 2,
                width: Math.max(0, xFor(high) - xFor(low)),
              },
            ]}
          />
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={lowAccessibilityLabel}
            accessibilityValue={{ min, max: high, now: low }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={onAction('low')}
            style={thumbStyle(low)}
            testID={testID ? `${testID}-low` : undefined}
          />
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={highAccessibilityLabel}
            accessibilityValue={{ min: low, max, now: high }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={onAction('high')}
            style={thumbStyle(high)}
            testID={testID ? `${testID}-high` : undefined}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: TOUCH_HEIGHT, justifyContent: 'center' },
  surface: { height: TOUCH_HEIGHT, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  selected: { right: undefined },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
});
