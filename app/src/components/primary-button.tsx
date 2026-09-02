import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/hooks/use-theme';

export interface PrimaryButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
}

/** Full-width filled action button — the one primary action per screen. */
export function PrimaryButton({ label, ...rest }: PrimaryButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
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
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
