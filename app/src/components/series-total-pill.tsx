// A full-score series total on the session list (#482): solid gold, with an
// outer ring when perfect.
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface SeriesTotalPillProps {
  label: string;
  tier: 'fullScore' | 'perfect';
  testID?: string;
}

export function SeriesTotalPill({ label, tier, testID }: SeriesTotalPillProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tierLabel = t(
    tier === 'perfect' ? 'session.celebrationPerfect' : 'session.celebrationFullScore',
  );

  return (
    <View
      style={[styles.ring, tier === 'perfect' && { borderColor: theme.celebration }]}
      accessible
      accessibilityLabel={`${label}, ${tierLabel}`}
      testID={testID}
    >
      <View style={[styles.pill, { backgroundColor: theme.celebration }]}>
        <ThemedText type="smallBold" style={[styles.label, { color: theme.background }]}>
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
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  label: {
    fontVariant: ['tabular-nums'],
  },
});
