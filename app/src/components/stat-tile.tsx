import { StyleSheet, type ViewProps } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

export interface StatTileProps extends ViewProps {
  label: string;
  value: string;
}

/** A single labeled number — the primitive behind Home's totals and /stats. */
export function StatTile({ label, value, style, ...rest }: StatTileProps) {
  return (
    <Card style={[styles.tile, style]} {...rest}>
      <ThemedText type="subtitle" style={styles.value}>
        {value}
      </ThemedText>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.half,
  },
  value: {
    fontSize: 32,
    lineHeight: 36,
  },
});
