/**
 * Design tokens. Both themes are built on one accent hue —
 * `SIGNAL_LAVENDER_HUE` — so light is a tonal variation of Purple Rain rather
 * than a separate palette; `tokens.test.ts` asserts that and the WCAG floors.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  // Light is the same world in a higher key: neutrals carry the lavender hue
  // rather than being neutral gray, and `primary` is Signal Lavender darkened
  // until white text clears AA on it. The previous stock blue (#208AEF) and
  // green (#2E9E5B) both failed AA against the ground they were drawn on.
  light: {
    text: '#1A1325',
    background: '#FCFBFE',
    backgroundElement: '#F4F1F8',
    backgroundSelected: '#E7E1EF',
    textSecondary: '#635874',
    primary: '#6E30CF',
    onPrimary: '#FFFFFF',
    border: '#D4CDDF',
    danger: '#C4321F',
    success: '#1F7A44',
  },
  // "Purple Rain" dark theme. Deep near-black purple ground with
  // purple-tinted (never gray) text and borders. Two accent options were
  // designed and checked for WCAG AA contrast (see app/src/theme/tokens.test.ts
  // and the evidence report on this branch). Gold won on contrast but the
  // maintainer rejected it for buttons (2026-09-01, "do not use yellow for
  // buttons"), so `primary` is the lavender accent; the gold values are kept
  // below as PURPLE_RAIN_GOLD_ACCENT_REJECTED, non-interactive use only.
  dark: {
    text: '#F6EEE4',
    background: '#16101F',
    backgroundElement: '#221934',
    backgroundSelected: '#2E2246',
    textSecondary: '#C9B9DC',
    primary: '#B98CFF', // === PURPLE_RAIN_LAVENDER_ACCENT.primary (asserted in tokens.test.ts)
    onPrimary: '#1A1226',
    border: '#7360B0',
    danger: '#FF7A85',
    success: '#4FD68C',
  },
} as const;

/**
 * The dark theme's accent: bright lavender. Passes WCAG AA against
 * `background` and `backgroundElement` (3:1 UI-component minimum) and against
 * `onPrimary` (4.5:1 text minimum) — contrast table in the evidence report.
 */
export const PURPLE_RAIN_LAVENDER_ACCENT = {
  primary: '#B98CFF',
  onPrimary: '#1A1226',
} as const;

/**
 * REJECTED FOR BUTTONS (maintainer, 2026-09-01: "do not use yellow for
 * buttons"). Kept only so the contrast work is not lost; do not assign it to
 * `primary` or any other interactive token. Semantic colors
 * (success/warning/danger) are unaffected by that ruling.
 */
export const PURPLE_RAIN_GOLD_ACCENT_REJECTED = {
  primary: '#E8B84B',
  onPrimary: '#1A1226',
} as const;

/**
 * The hue both themes are tuned to (HSL degrees). Dark uses it at high
 * lightness (#B98CFF), light at low (#6E30CF); the shared hue is what makes
 * them one identity instead of two palettes that happen to ship together.
 */
export const SIGNAL_LAVENDER_HUE = 263.5;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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
