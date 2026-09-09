import { describe, expect, it } from 'vitest';

import { CALIBER_KEY_TO_NAME, caliberKey, canonicalCaliber, isCaliberPreset } from './normalize';
import { CALIBER_PRESETS, CALIBER_PRESET_NAMES } from './presets';

describe('caliberKey', () => {
  it('folds case, spacing, × vs x, decimal comma and the leading dot', () => {
    const keys = ['.22 LR', '22 lr', '.22lr', '  .22  LR  '].map(caliberKey);
    expect(new Set(keys).size).toBe(1);
    expect(caliberKey('9×19 mm')).toBe(caliberKey('9x19 MM'));
    expect(caliberKey('6,5×55 mm')).toBe(caliberKey('6.5x55mm'));
  });

  it('keeps internal dots, so 4.5 mm never collides with .45', () => {
    expect(caliberKey('4,5 mm')).toBe('4.5mm');
    expect(caliberKey('.45 ACP')).toBe('45acp');
    expect(caliberKey('4.5 mm')).not.toBe(caliberKey('.45'));
  });
});

describe('preset vocabulary', () => {
  it('has no duplicate canonical names', () => {
    expect(new Set(CALIBER_PRESET_NAMES).size).toBe(CALIBER_PRESET_NAMES.length);
  });

  it('never lets two presets claim the same key', () => {
    const owners = new Map<string, string>();
    for (const preset of CALIBER_PRESETS) {
      for (const alias of preset.aliases ?? []) {
        const clash = owners.get(alias);
        expect(clash === undefined || clash === preset.name).toBe(true);
        owners.set(alias, preset.name);
      }
    }
    for (const [key, name] of CALIBER_KEY_TO_NAME) {
      expect(CALIBER_PRESET_NAMES).toContain(name);
      expect(key).toBe(caliberKey(key));
    }
  });

  it('resolves every canonical name to itself', () => {
    for (const name of CALIBER_PRESET_NAMES) {
      expect(canonicalCaliber(name)).toBe(name);
      expect(isCaliberPreset(name)).toBe(true);
    }
  });

  it('spells aliases as already-normalised keys, and each resolves to its own preset', () => {
    for (const preset of CALIBER_PRESETS) {
      for (const alias of preset.aliases ?? []) {
        expect(caliberKey(alias)).toBe(alias);
        expect(canonicalCaliber(alias)).toBe(preset.name);
      }
    }
  });
});

describe('canonicalCaliber', () => {
  it.each([
    ['9mm', '9×19 mm'],
    ['9 mm Luger', '9×19 mm'],
    ['9X19MM', '9×19 mm'],
    ['9x19', '9×19 mm'],
    ['9×19 Parabellum', '9×19 mm'],
    ['.22 lr', '.22 LR'],
    ['22 Long Rifle', '.22 LR'],
    ['.177', '4.5 mm'],
    ['4,5mm', '4.5 mm'],
    ['6,5x55', '6.5×55 mm'],
    ['.308 Win', '.308 Winchester'],
    ['7.62x51 NATO', '7.62×51 mm'],
    ['8x57 JS', '8×57 mm IS'],
    ['30-06', '.30-06 Springfield'],
    ['.38 SPL', '.38 Special'],
    ['7,65 Browning', '.32 ACP'],
  ])('maps %s to %s', (raw, expected) => {
    expect(canonicalCaliber(raw)).toBe(expected);
  });

  it('returns null for nothing, blanks and unknown chamberings', () => {
    expect(canonicalCaliber(null)).toBeNull();
    expect(canonicalCaliber(undefined)).toBeNull();
    expect(canonicalCaliber('   ')).toBeNull();
    expect(canonicalCaliber('.264 Wildcat')).toBeNull();
  });

  it('refuses to guess a genuinely ambiguous bare designation', () => {
    for (const ambiguous of ['.22', '22', '.45', '.38', '.32', '.30', '7.62']) {
      expect(canonicalCaliber(ambiguous)).toBeNull();
    }
  });

  it('is idempotent — a canonical value maps to itself', () => {
    for (const name of CALIBER_PRESET_NAMES) {
      expect(canonicalCaliber(canonicalCaliber(name))).toBe(name);
    }
  });
});
