/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type ThemeColor } from '@/theme/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppSettings } from '@/state/app-settings';

/** The resolved 'light' | 'dark' name, honoring the app's theme setting over the raw device scheme. */
export function useResolvedThemeName(): 'light' | 'dark' {
  const scheme = useColorScheme();
  const { theme: themeSetting } = useAppSettings();
  const deviceTheme = scheme === 'unspecified' || !scheme ? 'light' : scheme;
  return themeSetting === 'system' ? deviceTheme : themeSetting;
}

export function useTheme(): Record<ThemeColor, string> {
  const theme = useResolvedThemeName();
  return Colors[theme];
}
