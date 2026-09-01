/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#208AEF',
    onPrimary: '#ffffff',
    border: '#D8D9DE',
    danger: '#D2402D',
    success: '#2E9E5B',
  },
  // "Purple Rain" dark theme. Deep near-black purple ground with
  // purple-tinted (never gray) text and borders. Two accent options were
  // designed and checked for WCAG AA contrast (see app/src/theme/tokens.test.ts
  // and the evidence report on this branch); gold is the committed default
  // — it beats lavender on every pairing (10.10:1/9.06:1/9.83:1 vs
  // 7.32:1/6.57:1/7.13:1 for background/backgroundElement/onPrimary-on-primary)
  // while still reading as "Prince's gold". To switch to the lavender
  // alternative, replace `primary`/`onPrimary` below with
  // `PURPLE_RAIN_LAVENDER_ACCENT.primary`/`.onPrimary` — a one-line change.
  dark: {
    text: '#F6EEE4',
    background: '#16101F',
    backgroundElement: '#221934',
    backgroundSelected: '#2E2246',
    textSecondary: '#C9B9DC',
    primary: '#E8B84B',
    onPrimary: '#1A1226',
    border: '#7360B0',
    danger: '#FF7A85',
    success: '#4FD68C',
  },
} as const;

/**
 * Alternative dark-theme accent (bright lavender/purple) for the "Purple
 * Rain" theme, kept here so swapping the default gold accent is a one-line
 * change: set `Colors.dark.primary`/`.onPrimary` to these values. Both
 * accents pass WCAG AA against `background` and `backgroundElement`
 * (3:1 UI-component minimum) and against `onPrimary` (4.5:1 text minimum) —
 * see the evidence report for the full contrast table.
 */
export const PURPLE_RAIN_LAVENDER_ACCENT = {
  primary: '#B98CFF',
  onPrimary: '#1A1226',
} as const;

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
