import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
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
   * Also inset the bottom edge.
   *
   * Off by default because a tab screen's bottom is already handled by
   * `BottomTabInset` — adding the safe area there would double the gap. A
   * PUSHED screen has no tab bar, so without this its last element sits
   * under the Android gesture bar (maintainer, on device 2026-09-11: the
   * photo viewer's "Score from This Photo" was behind the system menu).
   */
  safeBottom?: boolean;
}

/** Standard screen shell: safe area, max content width, bottom tab-bar clearance. */
export function Screen({
  children,
  scroll = true,
  fab,
  safeBottom = false,
  style,
  ...rest
}: ScreenProps) {
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
        edges={safeBottom ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}
      >
        {scroll ? (
          <ScrollView contentContainerStyle={contentStyle}>{inner}</ScrollView>
        ) : (
          <View style={contentStyle}>{inner}</View>
        )}
        {fab ? (
          <View pointerEvents="box-none" style={styles.fabLayer}>
            <View pointerEvents="box-none" style={styles.fabLayerInner}>
              {fab}
            </View>
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
