/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/theme/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppSettings } from '@/state/app-settings';

export function useTheme() {
  const scheme = useColorScheme();
  const { theme: themeSetting } = useAppSettings();
  const deviceTheme = scheme === 'unspecified' || !scheme ? 'light' : scheme;
  const theme = themeSetting === 'system' ? deviceTheme : themeSetting;

  return Colors[theme];
}
