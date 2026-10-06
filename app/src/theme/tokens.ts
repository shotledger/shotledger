/**
 * Design tokens. Both themes are built on one accent hue —
 * `SIGNAL_LAVENDER_HUE` — so light is a tonal variation of Purple Rain rather
 * than a separate palette; `tokens.test.ts` asserts that and the WCAG floors.
 */

import '@/global.css';

import { Platform } from 'react-native';

export {
  Colors,
  PURPLE_RAIN_GOLD_ACCENT_REJECTED,
  PURPLE_RAIN_LAVENDER_ACCENT,
  SIGNAL_LAVENDER_HUE,
  type ThemeColor,
} from './colors';

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Radius = {
  small: 8,
  medium: 12,
  large: 20,
  pill: 999,
} as const;
