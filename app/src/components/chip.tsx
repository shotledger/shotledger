import { StyleSheet, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/theme/tokens';

export interface ChipProps extends ViewProps {
  label: string;
  tone?: 'neutral' | 'primary';
}

/** Small pill label — session type, tags, discipline. */
export function Chip({ label, tone = 'neutral', style, ...rest }: ChipProps) {
  return (
    <ThemedView
      type={tone === 'primary' ? 'primary' : 'backgroundSelected'}
      style={[styles.chip, style]}
      {...rest}
    >
      <ThemedText type="small" themeColor={tone === 'primary' ? 'onPrimary' : 'text'}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
});
