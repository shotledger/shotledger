import type { Ref } from 'react';
import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, TabularNums, ThemeColor, Typography } from '@/theme/tokens';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  ref?: Ref<Text>;
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    // The #822 scale. `score` draws tabular numerals; give `headline` and
    // `caption` `TabularNums` when they hold a number.
    | 'score'
    | 'headline'
    | 'caption';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text')] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'score' && styles.score,
        type === 'headline' && styles.headline,
        type === 'caption' && styles.caption,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: Typography.label,
  smallBold: Typography.labelStrong,
  default: Typography.body,
  title: Typography.display,
  subtitle: Typography.legacyHeadline,
  link: Typography.link,
  linkPrimary: Typography.link,
  score: { ...Typography.score, ...TabularNums },
  headline: Typography.headline,
  caption: Typography.caption,
  code: {
    ...Typography.code,
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? Typography.code.fontWeight,
  },
});
