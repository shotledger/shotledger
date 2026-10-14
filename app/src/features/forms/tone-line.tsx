// A status in words with a dot of the same colour (#822): the shape of
// StatusLine for statuses that are not a licence's — maintenance due, a
// licence activity requirement. It replaces status chips that turned the
// accent lavender for "amber" and "red", which spent the interaction colour
// on a value and still did not say which was worse.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing, type ThemeColor } from '@/theme/tokens';

/** The traffic-light levels the firearm screens report. */
export type ToneLevel = 'green' | 'amber' | 'red';

export const TONE_LEVEL_COLOR: Record<ToneLevel, ThemeColor> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
};

export interface ToneLineProps {
  level: ToneLevel;
  label: string;
  testID?: string;
}

export function ToneLine({ level, label, testID }: ToneLineProps) {
  const theme = useTheme();
  const tone = TONE_LEVEL_COLOR[level];
  return (
    <View style={styles.row} accessible accessibilityRole="text" testID={testID}>
      <View style={[styles.dot, { backgroundColor: theme[tone] }]} />
      <ThemedText type="smallBold" themeColor={tone} style={styles.label}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: Spacing.two,
    height: Spacing.two,
    borderRadius: Radius.pill,
  },
  label: {
    flexShrink: 1,
  },
});
