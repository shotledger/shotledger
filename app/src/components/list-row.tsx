import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/theme/tokens';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Tints the title — `danger` for a row that destroys data. */
  themeColor?: ThemeColor;
  testID?: string;
}

/** One row in a list group — session, firearm, or settings entry. */
export function ListRow({ title, subtitle, trailing, onPress, themeColor, testID }: ListRowProps) {
  const content = (
    <View style={styles.row}>
      <View style={styles.text}>
        <ThemedText type="default" themeColor={themeColor}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
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
