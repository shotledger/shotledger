import {
  Colors,
  PURPLE_RAIN_GOLD_ACCENT_REJECTED,
  PURPLE_RAIN_LAVENDER_ACCENT,
  SIGNAL_LAVENDER_HUE,
} from './tokens';

const toRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as [number, number, number];

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const h =
    max === r
      ? 60 * (((g - b) / delta) % 6)
      : max === g
        ? 60 * ((b - r) / delta + 2)
        : 60 * ((r - g) / delta + 4);
  return h < 0 ? h + 360 : h;
}

describe('theme tokens', () => {
  it('defines both light and dark palettes with the same keys', () => {
    expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
  });

  // Maintainer, 2026-09-01: "do not use yellow for buttons".
  it('uses the lavender accent, never the rejected gold, for interactive tokens', () => {
    expect(Colors.dark.primary).toBe(PURPLE_RAIN_LAVENDER_ACCENT.primary);
    expect(Colors.dark.onPrimary).toBe(PURPLE_RAIN_LAVENDER_ACCENT.onPrimary);
    expect(Colors.dark.primary).not.toBe(PURPLE_RAIN_GOLD_ACCENT_REJECTED.primary);
    expect(Colors.light.primary).not.toBe(PURPLE_RAIN_GOLD_ACCENT_REJECTED.primary);
  });

  // The two themes are one identity in two keys, not two palettes. Before this
  // was asserted, light shipped a stock blue accent (#208AEF) unrelated to the
  // dark lavender.
  it('tunes both accents to the same hue', () => {
    expect(hue(Colors.dark.primary)).toBeCloseTo(SIGNAL_LAVENDER_HUE, 0);
    expect(hue(Colors.light.primary)).toBeCloseTo(SIGNAL_LAVENDER_HUE, 0);
  });

  // Neutrals carry the accent hue rather than being neutral grey. `text` in
  // dark is the deliberate exception: a warm cream, chosen to sit against the
  // cool ground rather than disappear into it.
  it.each([
    'background',
    'backgroundElement',
    'backgroundSelected',
    'textSecondary',
    'border',
  ] as const)('tints the light and dark %s with the accent hue', (token) => {
    expect(Math.abs(hue(Colors.light[token]) - SIGNAL_LAVENDER_HUE)).toBeLessThan(10);
    expect(Math.abs(hue(Colors.dark[token]) - SIGNAL_LAVENDER_HUE)).toBeLessThan(10);
  });

  // PRODUCT.md records bright outdoor sunlight as a confirmed condition of
  // use, so these floors are not academic. Both themes are checked because the
  // light one is reachable from Settings and is the fallback when the device
  // reports no scheme.
  describe.each(['light', 'dark'] as const)('%s theme contrast', (name) => {
    const c = Colors[name];

    it.each([
      ['text on background', c.text, c.background],
      ['text on backgroundElement', c.text, c.backgroundElement],
      ['text on backgroundSelected', c.text, c.backgroundSelected],
      ['textSecondary on background', c.textSecondary, c.background],
      ['textSecondary on backgroundElement', c.textSecondary, c.backgroundElement],
      ['onPrimary on primary', c.onPrimary, c.primary],
      ['primary on background', c.primary, c.background],
      ['danger on background', c.danger, c.background],
      ['success on background', c.success, c.background],
      ['danger on backgroundElement', c.danger, c.backgroundElement],
      ['success on backgroundElement', c.success, c.backgroundElement],
    ])('clears AA 4.5:1 for %s', (_label, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
