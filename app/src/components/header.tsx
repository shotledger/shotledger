// Header (#822, DESIGN.md "Header"): the one title at the top of a screen,
// in the `title` type (28/34 700), with an optional subtitle and one
// trailing action. It is the screen's only `header` role, so a screen
// reader's "next heading" lands on it first. ScreenTitle still draws the
// existing screens until the per-screen rollout moves them here.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Typography } from '@/theme/tokens';

export interface HeaderProps {
  title: string;
  /** One line of context under the title, in secondary text. */
  subtitle?: string;
  /** One action at the end of the row: an icon button or a text Button. */
  trailing?: ReactNode;
  testID?: string;
}

export function Header({ title, subtitle, trailing, testID }: HeaderProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.text}>
        <ThemedText accessibilityRole="header" style={styles.title}>
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
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  title: Typography.title,
  trailing: {
    flexShrink: 0,
  },
});
