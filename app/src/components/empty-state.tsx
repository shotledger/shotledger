import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

export interface EmptyStateProps {
  title: string;
  body: string;
  ctaLabel?: string;
  onPressCta?: () => void;
  icon?: ReactNode;
}

/** Friendly no-data state with an optional CTA — never a bare "no results" label. */
export function EmptyState({ title, body, ctaLabel, onPressCta, icon }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon}
      <ThemedText type="subtitle" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
        {body}
      </ThemedText>
      {ctaLabel && onPressCta ? <PrimaryButton label={ctaLabel} onPress={onPressCta} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  title: {
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    textAlign: 'center',
  },
});
