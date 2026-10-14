import { Switch, type SwitchProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * The app's on/off switch: React Native's `Switch` in the theme's colours.
 * A bare `Switch` draws the platform's own (Material teal on Android, green on
 * iOS), which is the one control on screen outside the palette (#823).
 */
export function Toggle({ value, ...rest }: SwitchProps) {
  const theme = useTheme();
  return (
    <Switch
      value={value}
      trackColor={{ false: theme.backgroundSelected, true: theme.primary }}
      thumbColor={value ? theme.onPrimary : theme.textSecondary}
      ios_backgroundColor={theme.backgroundSelected}
      // react-native-web paints the "on" thumb from its own prop and ignores
      // `thumbColor` there, defaulting to Material teal. Not in RN's types.
      {...({ activeThumbColor: theme.onPrimary } as Partial<SwitchProps>)}
      {...rest}
    />
  );
}
