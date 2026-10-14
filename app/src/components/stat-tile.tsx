import { StyleSheet, type ViewProps } from 'react-native';

import { Card } from '@/components/card';
import { FitText } from '@/components/fit-text';
import { Spacing } from '@/theme/tokens';

export interface StatTileProps extends ViewProps {
  label: string;
  value: string;
  /**
   * `center` centers both lines. Home asked for it (#138) because its three
   * labels differ so much in width that left-aligned numbers read as ragged;
   * the default stays `start` so the other screens' tiles are untouched.
   */
  align?: 'start' | 'center';
}

/** A single labeled number — the primitive behind Home's totals and /stats. */
export function StatTile({ label, value, align = 'start', style, ...rest }: StatTileProps) {
  return (
    <Card style={[styles.tile, align === 'center' && styles.centered, style]} {...rest}>
      {/* The value is one line and shrinks to fit. The caption wraps between
          words and shrinks only if one word is wider than the tile, so it
          neither truncates nor splits mid-word (#823; PRODUCT.md, font-scale
          exception). A row's tiles stretch to the tallest, so a two-line
          caption keeps the values level. */}
      <FitText
        wrap={false}
        minimumFontScale={0.6}
        type="subtitle"
        style={[styles.value, styles.fill, align === 'center' && styles.centeredText]}
      >
        {value}
      </FitText>
      <FitText
        wrap
        minimumFontScale={0.75}
        type="small"
        themeColor="textSecondary"
        style={[styles.caption, styles.fill, align === 'center' && styles.centeredText]}
      >
        {label}
      </FitText>
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
  // Both lines span the tile, so shrinking the font never changes the box's
  // width; centering is then the text's job.
  fill: {
    alignSelf: 'stretch',
  },
  centeredText: {
    textAlign: 'center',
  },
  value: {
    fontSize: 32,
    lineHeight: 36,
  },
  // `small`'s size, spelled out because FitText scales from it.
  caption: {
    fontSize: 14,
    lineHeight: 20,
  },
});
