import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/hooks/use-theme';

export interface FABProps extends Omit<PressableProps, 'style'> {
  label: string;
}

/** Floating action button, bottom-right above the tab bar — one per screen. */
export function FAB({ label, ...rest }: FABProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.primary },
        pressed && styles.pressed,
      ]}
      {...rest}
    >
      <ThemedText type="smallBold" themeColor="onPrimary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: BottomTabInset + Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  pressed: {
    opacity: 0.85,
  },
});
