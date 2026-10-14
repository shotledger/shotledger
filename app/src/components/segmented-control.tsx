import { Pressable, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> extends Omit<ViewProps, 'style'> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewProps['style'];
  /**
   * Force content-width segments in a horizontal scroller. Left unset, this
   * turns itself on past `AUTO_SCROLL_FROM` options — see below.
   */
  scrollable?: boolean;
}

/**
 * Past this many options, equal-width segments get too narrow for real labels
 * ("Membership card" in a quarter of a phone screen wraps to three lines, and
 * mid-word at that), so the control switches to content-width segments that
 * scroll sideways instead.
 */
const AUTO_SCROLL_FROM = 4;

/**
 * Exclusive-choice control — used for theme/language and program pickers.
 * Two to four options is the design (DESIGN.md "Segmented Control"); more
 * scroll, and a long list belongs in an option picker or choice chips.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  scrollable,
  ...rest
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const scrolls = scrollable ?? options.length >= AUTO_SCROLL_FROM;

  const segments = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        // A radio in a radio group (#822): a screen reader says "Dark, radio
        // button, 3 of 3, selected", not a bare "button".
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected }}
        accessibilityLabel={option.label}
        onPress={() => onChange(option.value)}
        style={scrolls ? styles.segmentPressableAuto : styles.segmentPressable}
      >
        <View
          // Remounted on every selection change, which is the whole point of
          // the key: on Android a view that gains a background colour after
          // it has been laid out keeps its old, square drawable, so a segment
          // selected by tapping rendered with square corners while the one
          // selected at mount was correctly rounded (#349, reported against
          // the period control's "Max"). Setting the colour unconditionally
          // and only changing its value does not help — the view has to be
          // built again.
          key={selected ? 'selected' : 'unselected'}
          style={[
            styles.segment,
            scrolls && styles.segmentAuto,
            // Fill and outline both, so the choice does not rest on text
            // colour alone (WCAG 1.4.11; the old raised fill was 1.14:1 on
            // the track). Every segment carries the 2px border, so selecting
            // one moves nothing.
            selected && { backgroundColor: theme.selected, borderColor: theme.selectedOutline },
          ]}
        >
          <ThemedText
            type="small"
            themeColor={selected ? 'text' : 'textSecondary'}
            style={styles.label}
            // A label is a short noun phrase; breaking it across lines (and,
            // at narrow widths, mid-word) is never the right answer here.
            numberOfLines={1}
          >
            {option.label}
          </ThemedText>
        </View>
      </Pressable>
    );
  });

  if (scrolls) {
    return (
      <ThemedView
        type="backgroundElement"
        accessibilityRole="radiogroup"
        style={[styles.scrollTrack, style]}
        {...rest}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {segments}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      type="backgroundElement"
      accessibilityRole="radiogroup"
      style={[styles.track, style]}
      {...rest}
    >
      {segments}
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
  scrollTrack: {
    borderRadius: Radius.medium,
    padding: Spacing.half,
  },
  // Grows to the track when the segments fit, so they share the width instead
  // of bunching left.
  scrollContent: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: Spacing.half,
  },
  segmentPressable: {
    flex: 1,
  },
  segmentPressableAuto: {
    flexGrow: 1,
  },
  segment: {
    // Material's 48dp minimum touch target, not a spacing value — it is
    // deliberately off the 2/4/8/16/24/32/64 scale and should stay 48.
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  // Spacing.three clipped the fifth period option ("Anpassa") on a phone (#745).
  segmentAuto: {
    paddingHorizontal: Spacing.two,
  },
  label: {
    textAlign: 'center',
  },
});
