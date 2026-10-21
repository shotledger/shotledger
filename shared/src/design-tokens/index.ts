// ShotLedger's design tokens: colour, data-viz, spacing, radius and type.
// Pure TypeScript with no React Native import, so the app (`app/src/theme`)
// and the web (`web/src/theme.ts`, ARCHITECTURE.md § Web app) read the one object.
// `app/DESIGN.md` documents them; `tokens.test.ts` asserts every contrast
// pair the system draws.

export const Colors = {
  // Light is the same world in a higher key: neutrals carry the lavender hue
  // rather than being neutral gray, and `primary` is Signal Lavender darkened
  // until white text clears AA on it. The previous stock blue (#208AEF) and
  // green (#2E9E5B) both failed AA against the ground they were drawn on.
  light: {
    text: '#1A1325',
    background: '#FCFBFE',
    backgroundElement: '#F4F1F8',
    /** The raised neutral: a pressed row, a neutral chip. Not a selection (see `selected`). */
    backgroundSelected: '#E7E1EF',
    /** Cards and tiles. White on the off-white ground, so light cards also take a `border` (#822). */
    surface: '#FFFFFF',
    /** The chosen option's fill, always drawn with a `selectedOutline` border (WCAG 1.4.11). */
    selected: '#EADDFF',
    selectedOutline: '#6E30CF',
    textSecondary: '#635874',
    primary: '#6E30CF',
    onPrimary: '#FFFFFF',
    // Was #D4CDDF, 1.50:1 on the ground: light cards and fields had no visible edge (#822).
    border: '#857A9B',
    danger: '#C4321F',
    success: '#1F7A44',
    /** Semantic only (a licence due soon); the gold-for-buttons ruling stands. */
    warning: '#9A5B00',
    // Perfect-series gold (#482) — decorative only, never an interactive token.
    celebration: '#8A6100',
  },
  // "Purple Rain" dark theme. Deep near-black purple ground with
  // purple-tinted (never gray) text and borders. Two accent options were
  // designed and checked for WCAG AA contrast (see tokens.test.ts). Gold won
  // on contrast but the maintainer rejected it for buttons (2026-09-01, "do
  // not use yellow for buttons"), so `primary` is the lavender accent; the
  // gold values are kept below as PURPLE_RAIN_GOLD_ACCENT_REJECTED,
  // non-interactive use only.
  dark: {
    text: '#F6EEE4',
    background: '#16101F',
    backgroundElement: '#221934',
    backgroundSelected: '#2E2246',
    surface: '#221934', // === backgroundElement: dark cards separate by tone, no border
    selected: '#3B2A5E',
    selectedOutline: '#B98CFF',
    textSecondary: '#C9B9DC',
    primary: '#B98CFF', // === PURPLE_RAIN_LAVENDER_ACCENT.primary (asserted in tokens.test.ts)
    onPrimary: '#1A1226',
    border: '#7360B0',
    danger: '#FF7A85',
    success: '#4FD68C',
    warning: '#F2C062',
    celebration: '#E8B84B', // === PURPLE_RAIN_GOLD_ACCENT_REJECTED.primary, non-interactive use
  },
} as const;

/**
 * Chart colours, one set per theme, each >= 3:1 against the ground,
 * `backgroundElement` and the card surface of its theme (asserted in
 * tokens.test.ts).
 *
 * `categorical`: identity (one discipline per line), assigned in this fixed
 * order and never cycled; eight slots, so a chart draws up to eight
 * disciplines. Slot by slot the two themes keep a hue family (violet, green,
 * amber, pink, blue, sky, olive, rose) as far as the narrower dark lightness
 * band allows; light slot 6 is a deeper blue and slot 8 a plum. Validated
 * with the `dataviz` skill's checker (2026-10-14): EVERY pair, not only
 * neighbours, clears the colour-blind target (OKLab ΔE >= 8, protan and
 * deutan) and the normal-vision floor (>= 15) in both themes; tokens.test.ts
 * recomputes both.
 *
 * `rings`: a single-hue (orchid) sequential ramp for ring values, weakest
 * first. Kept off the accent's hue so a ring value never reads as a button.
 */
export const DataViz = {
  light: {
    categorical: [
      '#AF65FE',
      '#19979A',
      '#7A4503',
      '#FD3184',
      '#4E6DC4',
      '#1C31D2',
      '#4F9B00',
      '#82078D',
    ],
    rings: ['#B75CBD', '#A342AA', '#8D2B94', '#74177B', '#5B0861'],
  },
  dark: {
    categorical: [
      '#8B4CC1',
      '#58A86B',
      '#C58501',
      '#ED49AB',
      '#0365FD',
      '#0B9AD9',
      '#677406',
      '#AA5E70',
    ],
    rings: ['#AA50B1', '#C26CC7', '#D78ADB', '#E9ABEC', '#F7CFF8'],
  },
} as const;

/**
 * The dark theme's accent: bright lavender. Passes WCAG AA against
 * `background` and `backgroundElement` (3:1 UI-component minimum) and against
 * `onPrimary` (4.5:1 text minimum).
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

export type ThemeName = keyof typeof Colors;
/** A colour token. Both palettes have the same keys (asserted in tokens.test.ts). */
export type ThemeColor = keyof typeof Colors.light;

/** The spacing scale (px / dp). Values outside it do not appear. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** The radius scale (px / dp): nested, workhorse, large container, pill. */
export const Radius = {
  small: 8,
  medium: 12,
  large: 20,
  pill: 999,
} as const;

/**
 * The type scale. The family is the platform system font, chosen per platform
 * by the app (`Fonts` in `app/src/theme/tokens.ts`); only `code` is monospace.
 *
 * #822 set the scale components are built on: `score` (the number that is the
 * point of a screen), `title` (one per screen, in `Header`), `headline` (a
 * card's lead number or heading), `body`, `label`, `labelStrong` and
 * `caption` (chart axes and footnotes). `display` (48) and `legacyHeadline`
 * (32/44) are what screens drew before #822; they stay until the per-screen
 * rollout moves each screen to the new scale, and nothing new uses them.
 */
export const Typography = {
  score: { fontSize: 40, lineHeight: 44, fontWeight: 700 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: 700 },
  headline: { fontSize: 22, lineHeight: 28, fontWeight: 600 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  labelStrong: { fontSize: 14, lineHeight: 20, fontWeight: 700 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: 500 },
  link: { fontSize: 14, lineHeight: 30 },
  code: { fontSize: 12, fontWeight: 500 },
  /** @deprecated Pre-#822 screen title; new screens use `title` through `Header`. */
  display: { fontSize: 48, lineHeight: 52, fontWeight: 600 },
  /** @deprecated Pre-#822 headline (ThemedText `subtitle`); new code uses `headline` or `score`. */
  legacyHeadline: { fontSize: 32, lineHeight: 44, fontWeight: 600 },
} as const;

/**
 * Tabular (fixed-width) numerals for every number the app draws, so a column
 * of scores lines up and a running total does not jitter as it changes. In
 * React Native this is the `fontVariant` style; on the web, the CSS
 * `font-variant-numeric` property takes the same value.
 */
export const TABULAR_NUMS = 'tabular-nums' as const;

/** The minimum touch target (dp), Material's floor. Off the spacing scale on purpose. */
export const MIN_TOUCH_TARGET = 48;
