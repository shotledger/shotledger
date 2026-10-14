// The quietest button tier: an accent label with no fill or outline, for a
// section-level action such as "Add Caliber" that sits in the section's
// header row. PrimaryButton is the one main action per screen and
// SecondaryButton the outlined alternatives beside it; a section's own "add"
// is neither, so it reads as a link-like control next to the section title.
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface TextButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
}

export function TextButton({ label, disabled, ...rest }: TextButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}
      {...rest}
    >
      <ThemedText
        type="smallBold"
        themeColor={disabled === true ? 'textSecondary' : 'primary'}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Material's 48dp minimum touch target, not a spacing value.
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
});
