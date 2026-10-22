// The colour tokens live in `shared/src/design-tokens/` (no React Native
// import), so the app and the web (ARCHITECTURE.md § Web app) read one palette. This file
// keeps the app's existing `@/theme/colors` imports working.
export {
  Colors,
  DataViz,
  PURPLE_RAIN_GOLD_ACCENT_REJECTED,
  PURPLE_RAIN_LAVENDER_ACCENT,
  SIGNAL_LAVENDER_HUE,
  type ThemeColor,
  type ThemeName,
} from '@shotledger/shared/src/design-tokens';
