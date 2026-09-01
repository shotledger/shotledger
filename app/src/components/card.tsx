import { StyleSheet, type ViewProps } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/theme/tokens';

export type CardProps = ViewProps;

/** Elevated content container — the base surface for tiles, list groups, forms. */
export function Card({ style, children, ...rest }: CardProps) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]} {...rest}>
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
