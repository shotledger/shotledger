// Stat (#822, DESIGN.md "Stat"): a labelled number that never truncates.
// StatTile keeps one line and shrinks to fit, which works on a phone but not
// on the web (`adjustsFontSizeToFit` is native only), where Home's tiles
// cut to "Shots Log…" and "Competiti…". Stat wraps instead: the label may
// take two lines, and the value breaks only where a number has room to.
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TabularNums } from '@/theme/tokens';

export interface StatProps extends ViewProps {
  label: string;
  value: string;
  /** A unit or qualifier after the value, in secondary text ("rounds", "%"). */
  unit?: string;
  /** `score` for the one number that is the point of a screen; `headline` otherwise. */
  size?: 'score' | 'headline';
  /** Draw on a card (the default) or bare, inside a card of its own. */
  bare?: boolean;
}

export function Stat({
  label,
  value,
  unit,
  size = 'headline',
  bare = false,
  style,
  ...rest
}: StatProps) {
  const body = (
    <>
      <View style={styles.valueRow}>
        {/* No numberOfLines anywhere: truncating a number is never right. */}
        <ThemedText type={size} style={TabularNums}>
          {value}
        </ThemedText>
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </>
  );

  // The value and label read as one phrase ("1 284 Shots Logged").
  const a11y = {
    accessible: true,
    accessibilityLabel: [value, unit, label].filter(Boolean).join(' '),
  };
  if (bare) {
    return (
      <View style={[styles.stat, style]} {...a11y} {...rest}>
        {body}
      </View>
    );
  }
  return (
    <Card style={[styles.stat, styles.tile, style]} {...a11y} {...rest}>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  stat: {
    gap: Spacing.half,
    minWidth: 0,
  },
  tile: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
});
