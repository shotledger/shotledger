import type { Ref } from 'react';
import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/theme/tokens';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
  ref?: Ref<View>;
};

export function ThemedView({
  style,
  lightColor: _lightColor,
  darkColor: _darkColor,
  type,
  ...otherProps
}: ThemedViewProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}
