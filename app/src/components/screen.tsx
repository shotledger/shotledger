import { ReactNode, useRef, useState, type Ref } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FabClearance } from '@/components/fab';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/theme/tokens';

export interface ScreenProps extends ViewProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Default true. */
  scroll?: boolean;
  /**
   * A `<FAB>` for this screen. Passing it here rather than as a child is what
   * keeps it pinned to the viewport and keeps the content clear of it — see
   * the `fabLayer` comment below.
   */
  fab?: ReactNode;
  /**
   * Inset the bottom edge for the system navigation / gesture bar.
   *
   * **Defaults to `!scroll`**, which is the whole of the problem it solves.
   * A scrolling screen already clears the bottom: `scrollContent` pads
   * `BottomTabInset + Spacing.four` (80 dp on Android), far more than a
   * gesture bar. A `scroll={false}` screen gets `plainContent`, which is
   * bare `flex: 1`, so its last element sits under the system bar —
   * maintainer, on device 2026-09-11, first on the photo viewer and then
   * "in other places as well".
   *
   * An audit of every route found **no tab screen uses `scroll={false}`**,
   * so keying off `scroll` cannot double a tab bar's gap. Opting in per
   * screen was the wrong shape: it left 9 screens broken and every new one
   * broken by default.
   */
  safeBottom?: boolean;
  /**
   * Ref to the underlying `ScrollView`, for a screen that needs to move it
   * itself — the Statistics tab scrolls back to the top when it regains
   * focus. Ignored when `scroll` is false.
   */
  scrollRef?: Ref<ScrollView>;
}

/**
 * How far a finger must travel before the FAB reacts, so a list that jitters
 * by a pixel does not make the button flicker.
 */
const FabHideThreshold = 8;

/** Standard screen shell: safe area, max content width, bottom tab-bar clearance. */
export function Screen({
  children,
  scroll = true,
  fab,
  safeBottom,
  scrollRef,
  style,
  ...rest
}: ScreenProps) {
  // A FAB sits in the bottom-right corridor of every row it floats over, and
  // on Home that is where the session-type chip is — so whichever card the
  // button happens to land on loses it (#348). Sliding the button out while
  // the user scrolls down gives the list the whole width back, and scrolling
  // up (or reaching the top) brings it straight back.
  const [fabOffset] = useState(() => new Animated.Value(0));
  const lastOffsetY = useRef(0);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const delta = y - lastOffsetY.current;
    lastOffsetY.current = y;
    if (Math.abs(delta) < FabHideThreshold) return;
    const hide = y > FabHideThreshold && delta > 0;
    Animated.timing(fabOffset, {
      toValue: hide ? FabClearance : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }

  const inner = (
    <View style={[styles.inner, !scroll && styles.innerFlex, style]} {...rest}>
      {children}
    </View>
  );
  const contentStyle = [
    scroll ? styles.scrollContent : styles.plainContent,
    fab ? styles.contentWithFab : null,
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        style={styles.safeArea}
        edges={
          (safeBottom ?? !scroll) ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']
        }
      >
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={contentStyle}
            onScroll={fab ? onScroll : undefined}
            scrollEventThrottle={16}
          >
            {inner}
          </ScrollView>
        ) : (
          <View style={contentStyle}>{inner}</View>
        )}
        {fab ? (
          <View pointerEvents="box-none" style={styles.fabLayer}>
            <Animated.View
              pointerEvents="box-none"
              style={[styles.fabLayerInner, { transform: [{ translateY: fabOffset }] }]}
            >
              {fab}
            </Animated.View>
          </View>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: BottomTabInset + Spacing.four,
    alignItems: 'center',
  },
  plainContent: {
    flex: 1,
    alignItems: 'center',
  },
  // Reserves the strip the FAB floats over, so the last row can scroll clear
  // of it instead of sitting under it (issue #62, reopened on Ammunition).
  contentWithFab: {
    paddingBottom: FabClearance,
  },
  // The FAB is a sibling of the scroll view, not a child, so `bottom` resolves
  // against the viewport rather than the content box and the button neither
  // scrolls away nor rides up into a short list. This layer only mirrors the
  // content column's width so the button lines up with the rows on a wide
  // screen; `box-none` keeps it from swallowing taps meant for the list.
  fabLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
  },
  fabLayerInner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
    // Fills the viewport when the content is shorter, so a screen's own
    // bottom-anchored content does not ride up (issue #62).
    flexGrow: 1,
  },
  innerFlex: {
    flex: 1,
  },
});
