import { Colors, PURPLE_RAIN_GOLD_ACCENT_REJECTED, PURPLE_RAIN_LAVENDER_ACCENT } from './tokens';

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
});
