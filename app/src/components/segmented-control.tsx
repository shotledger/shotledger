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

/** Exclusive-choice control — used for theme/language and program pickers. */
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
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(option.value)}
        style={scrolls ? undefined : styles.segmentPressable}
      >
        <View
          style={[
            styles.segment,
            scrolls && styles.segmentAuto,
            selected && { backgroundColor: theme.backgroundSelected },
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
      <ThemedView type="backgroundElement" style={[styles.scrollTrack, style]} {...rest}>
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
    <ThemedView type="backgroundElement" style={[styles.track, style]} {...rest}>
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
  scrollContent: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  segmentPressable: {
    flex: 1,
  },
  segment: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    alignItems: 'center',
  },
  segmentAuto: {
    paddingHorizontal: Spacing.three,
  },
  label: {
    textAlign: 'center',
  },
});
