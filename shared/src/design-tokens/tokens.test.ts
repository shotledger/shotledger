import { describe, expect, it } from 'vitest';

import {
  Colors,
  DataViz,
  PURPLE_RAIN_GOLD_ACCENT_REJECTED,
  PURPLE_RAIN_LAVENDER_ACCENT,
  Radius,
  SIGNAL_LAVENDER_HUE,
  Spacing,
} from './index.js';

const toRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as [number, number, number];

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => v / 255) as [number, number, number];
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

describe('contrast helper', () => {
  // Anchors from the WCAG definition, so a broken helper cannot pass every pair.
  it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#7360B0', '#7360B0')).toBe(1);
  });
});

describe('theme tokens', () => {
  it('defines both light and dark palettes with the same keys', () => {
    expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
  });

  it('writes every colour as a six-digit hex', () => {
    const all = [
      ...Object.values(Colors.light),
      ...Object.values(Colors.dark),
      ...DataViz.light.categorical,
      ...DataViz.light.rings,
      ...DataViz.dark.categorical,
      ...DataViz.dark.rings,
    ];
    for (const value of all) expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });

  // Maintainer, 2026-09-01: "do not use yellow for buttons".
  it('uses the lavender accent, never the rejected gold, for interactive tokens', () => {
    expect(Colors.dark.primary).toBe(PURPLE_RAIN_LAVENDER_ACCENT.primary);
    expect(Colors.dark.onPrimary).toBe(PURPLE_RAIN_LAVENDER_ACCENT.onPrimary);
    for (const name of ['light', 'dark'] as const) {
      expect(Colors[name].primary).not.toBe(PURPLE_RAIN_GOLD_ACCENT_REJECTED.primary);
      expect(Colors[name].selectedOutline).not.toBe(PURPLE_RAIN_GOLD_ACCENT_REJECTED.primary);
    }
  });

  // The selection outline is the accent: a selected option is interaction.
  it("outlines a selection in each theme's accent", () => {
    expect(Colors.light.selectedOutline).toBe(Colors.light.primary);
    expect(Colors.dark.selectedOutline).toBe(Colors.dark.primary);
  });

  // The two themes are one identity in two keys, not two palettes. Before this
  // was asserted, light shipped a stock blue accent (#208AEF) unrelated to the
  // dark lavender.
  it('tunes both accents to the same hue', () => {
    expect(hue(Colors.dark.primary)).toBeCloseTo(SIGNAL_LAVENDER_HUE, 0);
    expect(hue(Colors.light.primary)).toBeCloseTo(SIGNAL_LAVENDER_HUE, 0);
  });

  // Neutrals carry the accent hue rather than being neutral gray. `text` in
  // dark is the deliberate exception: a warm cream, chosen to sit against the
  // cool ground rather than disappear into it. Light `surface` is white, which
  // has no hue; the dark one is checked.
  it.each([
    'background',
    'backgroundElement',
    'backgroundSelected',
    'selected',
    'textSecondary',
    'border',
  ] as const)('tints the light and dark %s with the accent hue', (token) => {
    expect(Math.abs(hue(Colors.light[token]) - SIGNAL_LAVENDER_HUE)).toBeLessThan(10);
    expect(Math.abs(hue(Colors.dark[token]) - SIGNAL_LAVENDER_HUE)).toBeLessThan(10);
  });

  it('tints the dark surface with the accent hue', () => {
    expect(Math.abs(hue(Colors.dark.surface) - SIGNAL_LAVENDER_HUE)).toBeLessThan(10);
  });

  // PRODUCT.md records bright outdoor sunlight as a confirmed condition of
  // use, so these floors are not academic. Both themes are checked because the
  // light one is reachable from Settings and is the fallback when the device
  // reports no scheme.
  describe.each(['light', 'dark'] as const)('%s theme contrast', (name) => {
    const c = Colors[name];

    // Text: WCAG 1.4.3, 4.5:1.
    it.each([
      ['text on background', c.text, c.background],
      ['text on backgroundElement', c.text, c.backgroundElement],
      ['text on backgroundSelected', c.text, c.backgroundSelected],
      ['text on surface', c.text, c.surface],
      ['text on selected', c.text, c.selected],
      ['textSecondary on background', c.textSecondary, c.background],
      ['textSecondary on backgroundElement', c.textSecondary, c.backgroundElement],
      ['textSecondary on surface', c.textSecondary, c.surface],
      ['onPrimary on primary', c.onPrimary, c.primary],
      ['primary on background', c.primary, c.background],
      ['primary on surface', c.primary, c.surface],
      ['danger on background', c.danger, c.background],
      ['success on background', c.success, c.background],
      ['warning on background', c.warning, c.background],
      ['danger on backgroundElement', c.danger, c.backgroundElement],
      ['success on backgroundElement', c.success, c.backgroundElement],
      ['warning on backgroundElement', c.warning, c.backgroundElement],
      ['danger on surface', c.danger, c.surface],
      ['success on surface', c.success, c.surface],
      ['warning on surface', c.warning, c.surface],
      ['celebration on background', c.celebration, c.background],
      ['celebration on backgroundElement', c.celebration, c.backgroundElement],
    ])('clears AA 4.5:1 for %s', (_label, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    // Non-text: WCAG 1.4.11, 3:1. The selected state was 1.14:1 (a raised
    // fill on the track) and the light border 1.50:1 before #822.
    it.each([
      // Segmented control: the outline against its track.
      [
        'selectedOutline on backgroundElement (segmented track)',
        c.selectedOutline,
        c.backgroundElement,
      ],
      // Option pickers and chips: the outline against the card and the ground.
      ['selectedOutline on surface', c.selectedOutline, c.surface],
      ['selectedOutline on background', c.selectedOutline, c.background],
      // The outline against the fill it encloses, so the edge reads too.
      ['selectedOutline on selected', c.selectedOutline, c.selected],
      // Inputs, unselected chips, light cards.
      ['border on background', c.border, c.background],
      ['border on surface', c.border, c.surface],
      ['border on backgroundElement', c.border, c.backgroundElement],
      // Focus ring of a text field.
      ['primary on backgroundElement', c.primary, c.backgroundElement],
    ])('clears 3:1 for %s', (_label, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
    });
  });

  // Chart marks are non-text graphics (1.4.11): each must read against the
  // ground and the card a chart sits on, in its own theme.
  describe.each(['light', 'dark'] as const)('%s chart colours', (name) => {
    const c = Colors[name];
    const marks = [
      ...DataViz[name].categorical.map((v, i) => [`categorical[${i}]`, v] as const),
      ...DataViz[name].rings.map((v, i) => [`rings[${i}]`, v] as const),
    ];
    it.each(
      marks.flatMap(([label, v]) => [
        [`${label} on background`, v, c.background],
        [`${label} on backgroundElement`, v, c.backgroundElement],
        [`${label} on surface`, v, c.surface],
      ]),
    )('clears 3:1 for %s', (_label, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
    });

    it('has four distinct categorical colours and five ring steps', () => {
      expect(new Set(DataViz[name].categorical).size).toBe(4);
      expect(new Set(DataViz[name].rings).size).toBe(5);
    });

    it('never uses the accent or a status colour as a chart colour', () => {
      const reserved = [c.primary, c.danger, c.success, c.warning, c.celebration];
      for (const v of [...DataViz[name].categorical, ...DataViz[name].rings]) {
        expect(reserved).not.toContain(v);
      }
    });
  });

  // The ring ramp is sequential: the strongest ring stands out most from the
  // ground, so contrast against the background rises step by step.
  it.each(['light', 'dark'] as const)('orders the %s ring ramp weakest first', (name) => {
    const steps = DataViz[name].rings.map((v) => contrast(v, Colors[name].background));
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
  });
});

describe('scales', () => {
  it('keeps the seven-step spacing and four-step radius scales', () => {
    expect(Object.values(Spacing)).toEqual([2, 4, 8, 16, 24, 32, 64]);
    expect(Object.values(Radius)).toEqual([8, 12, 20, 999]);
  });
});
