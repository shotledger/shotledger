import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/theme/tokens';

export interface ListRowProps {
  title: string;
  /** One line, or several stacked lines — a blank/absent entry renders nothing. */
  subtitle?: string | readonly (string | null | undefined)[];
  trailing?: ReactNode;
  onPress?: () => void;
  /** Tints the title — `danger` for a row that destroys data. */
  themeColor?: ThemeColor;
  testID?: string;
}

/** One row in a list group — session, firearm, or settings entry. */
export function ListRow({ title, subtitle, trailing, onPress, themeColor, testID }: ListRowProps) {
  const subtitleLines = (typeof subtitle === 'string' ? [subtitle] : (subtitle ?? [])).filter(
    (line): line is string => Boolean(line),
  );

  const content = (
    <View style={styles.row}>
      <View style={styles.text}>
        <ThemedText type="default" themeColor={themeColor}>
          {title}
        </ThemedText>
        {subtitleLines.map((line) => (
          <ThemedText key={line} type="small" themeColor="textSecondary">
            {line}
          </ThemedText>
        ))}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
});
