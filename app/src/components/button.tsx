// The button tiers (#822, DESIGN.md "Buttons"). One component names every
// tier so a screen picks a role, not a colour:
//
// - primary:     the one action that concludes a screen (PrimaryButton).
// - secondary:   an outlined action beside the content (SecondaryButton).
// - tonal:       a filled but quiet action — "Add Caliber" beside a list.
// - text:        a label-only action — "Add Caliber" in a section header
//                (TextButton).
// - destructive: delete or discard, in the danger colour, never lavender
//                (SecondaryButton tone="danger").
//
// Primary, secondary and text keep their own files, so the screens that
// import them are untouched; this adds the tonal tier they lacked.
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { TextButton } from '@/components/text-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MIN_TOUCH_TARGET, Radius, Spacing, type ThemeColor } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'text' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}

/** The colour roles the tonal tier is drawn in, as theme tokens. */
export interface TonalColors {
  background: ThemeColor | null;
  label: ThemeColor;
}

/**
 * Tonal: the `selected` fill with a text-coloured label. Disabled drops to
 * secondary text on no fill, which keeps 4.5:1 on every surface but stops
 * reading as tappable.
 */
export function tonalColors(disabled: boolean): TonalColors {
  return disabled
    ? { background: null, label: 'textSecondary' }
    : { background: 'selected', label: 'text' };
}

export function Button({ label, variant = 'secondary', style, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();

  if (variant === 'primary') {
    return <PrimaryButton label={label} disabled={disabled} style={style} {...rest} />;
  }
  if (variant === 'secondary' || variant === 'destructive') {
    return (
      <SecondaryButton
        label={label}
        tone={variant === 'destructive' ? 'danger' : 'primary'}
        disabled={disabled}
        style={style}
        {...rest}
      />
    );
  }

  if (variant === 'text') {
    return <TextButton label={label} disabled={disabled} style={style} {...rest} />;
  }

  const isDisabled = disabled === true;
  const colors = tonalColors(isDisabled);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        colors.background && { backgroundColor: theme[colors.background] },
        pressed && { backgroundColor: theme.backgroundSelected },
        style,
      ]}
      {...rest}
    >
      <ThemedText type="smallBold" themeColor={colors.label} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
