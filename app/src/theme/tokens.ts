/**
 * Design tokens. The values live in `shared/src/design-tokens/` so the web
 * reads the same ones; this file re-exports them and adds what needs React
 * Native (`Fonts`, `BottomTabInset`). Both themes are built on one accent hue
 * — `SIGNAL_LAVENDER_HUE` — so light is a tonal variation of Purple Rain
 * rather than a separate palette; `shared/src/design-tokens/tokens.test.ts`
 * asserts that and the WCAG floors.
 */

import '@/global.css';

import { Platform, type FontVariant } from 'react-native';

export {
  Colors,
  DataViz,
  PURPLE_RAIN_GOLD_ACCENT_REJECTED,
  PURPLE_RAIN_LAVENDER_ACCENT,
  SIGNAL_LAVENDER_HUE,
  type ThemeColor,
  type ThemeName,
} from './colors';
import { TABULAR_NUMS } from '@shotledger/shared/src/design-tokens';

export {
  MIN_TOUCH_TARGET,
  Radius,
  Spacing,
  TABULAR_NUMS,
  Typography,
} from '@shotledger/shared/src/design-tokens';

/** Spread into any `Text` style that draws a number (DESIGN.md, Typography). */
export const TabularNums: { fontVariant: FontVariant[] } = { fontVariant: [TABULAR_NUMS] };

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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
