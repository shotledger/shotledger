// A tappable row that reads as tappable: value on the right, chevron after
// it, visible pressed state. Added because the maintainer reported the
// records entry on /stats "is not obvious that it is clickable" — a bare
// ListRow with no trailing affordance looked like static text.
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface DrillDownRowProps {
  title: string;
  subtitle?: string;
  /** Current choice, shown right-aligned before the chevron. */
  value?: string;
  onPress: () => void;
  /** Rotates the chevron down — for a row that expands in place. */
  expanded?: boolean;
  testID?: string;
}

/** Chevron drawn with react-native-svg (no icon-font dependency). */
export function Chevron({ expanded = false, color }: { expanded?: boolean; color: string }) {
  return (
    // aria-hidden on a View, which React Native maps per platform; on the Svg
    // itself, web passed accessibilityElementsHidden to the DOM as unknown.
    <View aria-hidden>
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path
          d={expanded ? 'M3 6 L8 11 L13 6' : 'M6 3 L11 8 L6 13'}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export function DrillDownRow({
  title,
  subtitle,
  value,
  onPress,
  expanded,
  testID,
}: DrillDownRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <View style={styles.text}>
        <ThemedText type="default">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {value ? (
        <ThemedText type="small" themeColor="primary" numberOfLines={1} style={styles.value}>
          {value}
        </ThemedText>
      ) : null}
      <Chevron expanded={expanded} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginHorizontal: -Spacing.two,
    borderRadius: Radius.small,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
