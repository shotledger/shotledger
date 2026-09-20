import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export type TextFieldProps = TextInputProps;

/**
 * The app's single text input. Before this existed the same nine style
 * declarations were copied into nineteen screens, the radius was written three
 * different ways, and twelve of them left `placeholderTextColor` unset — so
 * placeholders fell back to the platform gray on the Purple Rain ground.
 *
 * The border carries focus, which the copies had no affordance for at all.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { style, multiline, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      ref={ref}
      multiline={multiline}
      placeholderTextColor={theme.textSecondary}
      // The caret and selection handles otherwise render in the platform's own
      // accent — Android's default teal, which is off-brand everywhere.
      selectionColor={theme.primary}
      cursorColor={theme.primary}
      selectionHandleColor={theme.primary}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.field,
        multiline && styles.multiline,
        { color: theme.text, borderColor: focused ? theme.primary : theme.border },
        style,
      ]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
