import type { Ref } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useResolvedThemeName, useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export type CardProps = ViewProps & { ref?: Ref<View> };

/**
 * Elevated content container — the base surface for tiles, list groups, forms.
 * Dark cards separate from the ground by tone alone; light ones are white on
 * an off-white ground, too close to see, so they also take a 1px `border`
 * (3:1 against both, #822).
 */
export function Card({ style, children, ...rest }: CardProps) {
  const theme = useTheme();
  const outlined = useResolvedThemeName() === 'light';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface },
        outlined && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
