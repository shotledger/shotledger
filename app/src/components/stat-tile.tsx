import { StyleSheet, type ViewProps } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

export interface StatTileProps extends ViewProps {
  label: string;
  value: string;
  /**
   * `center` centres both lines. Home asked for it (#138) because its three
   * labels differ so much in width that left-aligned numbers read as ragged;
   * the default stays `start` so the other screens' tiles are untouched.
   */
  align?: 'start' | 'center';
}

/** A single labeled number — the primitive behind Home's totals and /stats. */
export function StatTile({ label, value, align = 'start', style, ...rest }: StatTileProps) {
  return (
    <Card style={[styles.tile, align === 'center' && styles.centered, style]} {...rest}>
      {/* Both lines sit in a fixed-width slot, so they shrink or truncate —
          never wrap (PRODUCT.md, font-scale exception). */}
      <ThemedText
        type="subtitle"
        style={[styles.value, align === 'center' && styles.centeredText]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </ThemedText>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={align === 'center' && styles.centeredText}
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
  centered: {
    alignItems: 'center',
  },
  // `adjustsFontSizeToFit` shrinks the glyphs inside the text box but does not
  // move the box, so the alignment has to be set on the text as well.
  centeredText: {
    textAlign: 'center',
  },
  value: {
    fontSize: 32,
    lineHeight: 36,
  },
});
