// A series total on the session list, over a gold fill that grows towards a
// full score (#482). Full score is solid gold; perfect adds an outer ring.
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { CelebrationTier } from '@/features/session/celebration';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface SeriesTotalPillProps {
  label: string;
  /** 0–1, from `totalFillFraction`. */
  fraction: number;
  tier: CelebrationTier | null;
  testID?: string;
}

export function SeriesTotalPill({ label, fraction, tier, testID }: SeriesTotalPillProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const solid = tier === 'fullScore' || tier === 'perfect';
  const tierLabel =
    tier === 'perfect'
      ? t('session.celebrationPerfect')
      : tier === 'fullScore'
        ? t('session.celebrationFullScore')
        : null;

  return (
    <View
      style={[styles.ring, tier === 'perfect' && { borderColor: theme.celebration }]}
      accessible
      accessibilityLabel={tierLabel ? `${label}, ${tierLabel}` : label}
      testID={testID}
    >
      <View style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: theme.celebration, width: `${fraction * 100}%` },
            !solid && styles.partial,
          ]}
        />
        <ThemedText type="smallBold" style={[styles.label, solid && { color: theme.background }]}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: Spacing.half,
  },
  pill: {
    minWidth: 52,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    right: undefined,
  },
  partial: {
    opacity: 0.35,
  },
  // Padding on the label, not the pill: a percentage width on the absolute
  // fill resolves against the pill's content box and would stop short of it.
  label: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    fontVariant: ['tabular-nums'],
  },
});
