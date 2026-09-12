// The quieter sibling of PrimaryButton, for actions that sit beside the
// content rather than conclude it.
//
// PrimaryButton is documented as "the one primary action per screen", so a
// pair of side-by-side tools — the session's stopwatch and sights — cannot
// both be one without the screen losing its centre of gravity. Outlined
// rather than filled: present, tappable, and plainly not the main event.
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface SecondaryButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  style?: StyleProp<ViewStyle>;
}

export function SecondaryButton({ label, style, disabled, ...rest }: SecondaryButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { borderColor: disabled === true ? theme.border : theme.primary },
        pressed && { backgroundColor: theme.backgroundSelected },
        style,
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
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
