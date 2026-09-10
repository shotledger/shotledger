import { describe, expect, it } from 'vitest';

import { orderCalibersByUsage } from './order';
import { CALIBER_PRESET_NAMES } from './presets';

const PRESETS = ['.22 LR', '9×19 mm', '.38 Special', '4.5 mm'] as const;

function names(usage: Parameters<typeof orderCalibersByUsage>[0]) {
  return orderCalibersByUsage(usage, PRESETS).map((option) => option.name);
}

describe('orderCalibersByUsage', () => {
  it('falls back to the curated order when nothing has been used', () => {
    expect(names([])).toEqual([...PRESETS]);
    expect(orderCalibersByUsage([], PRESETS).every((option) => option.count === 0)).toBe(true);
  });

  it('puts the most-used first and keeps the rest in curated order', () => {
    expect(
      names([
        { caliber: '.38 Special', count: 1 },
        { caliber: '9×19 mm', count: 5 },
      ]),
    ).toEqual(['9×19 mm', '.38 Special', '.22 LR', '4.5 mm']);
  });

  it('sums a caliber counted once per table', () => {
    const ordered = orderCalibersByUsage(
      [
        { caliber: '.22 LR', count: 2 },
        { caliber: '.22 LR', count: 3 },
      ],
      PRESETS,
    );
    expect(ordered[0]).toEqual({ name: '.22 LR', count: 5, isPreset: true });
  });

  it('folds spelling variants into one canonical count', () => {
    const ordered = orderCalibersByUsage(
      [
        { caliber: '9mm Luger', count: 1 },
        { caliber: '9X19MM', count: 1 },
        { caliber: '9x19', count: 1 },
      ],
      PRESETS,
    );
    expect(ordered[0]).toEqual({ name: '9×19 mm', count: 3, isPreset: true });
    expect(ordered.filter((option) => option.count > 0)).toHaveLength(1);
  });

  it('breaks a tie on the curated order, not on row order', () => {
    const usage = [
      { caliber: '4.5 mm', count: 2 },
      { caliber: '.22 LR', count: 2 },
    ];
    expect(names(usage)).toEqual(['.22 LR', '4.5 mm', '9×19 mm', '.38 Special']);
    expect(names([...usage].reverse())).toEqual(names(usage));
  });

  it('keeps a legacy value the presets do not cover, ranked but marked', () => {
    const ordered = orderCalibersByUsage(
      [
        { caliber: '.264 Wildcat', count: 3 },
        { caliber: '.22 LR', count: 1 },
      ],
      PRESETS,
    );
    expect(ordered[0]).toEqual({ name: '.264 Wildcat', count: 3, isPreset: false });
    expect(ordered.map((option) => option.name)).toEqual([
      '.264 Wildcat',
      '.22 LR',
      '9×19 mm',
      '.38 Special',
      '4.5 mm',
    ]);
  });

  it('sorts a tied legacy value after every tied preset', () => {
    expect(
      names([
        { caliber: 'Zulu Special', count: 1 },
        { caliber: 'Alpha Special', count: 1 },
        { caliber: '.38 Special', count: 1 },
      ]),
    ).toEqual(['.38 Special', 'Alpha Special', 'Zulu Special', '.22 LR', '9×19 mm', '4.5 mm']);
  });

  it('ignores blank, whitespace-only, null and non-positive counts', () => {
    expect(
      names([
        { caliber: null, count: 9 },
        { caliber: '   ', count: 9 },
        { caliber: '.22 LR', count: 0 },
        { caliber: '9×19 mm', count: -1 },
      ]),
    ).toEqual([...PRESETS]);
  });

  it('defaults to the full shipped vocabulary', () => {
    const ordered = orderCalibersByUsage([{ caliber: '9 mm Luger', count: 1 }]);
    expect(ordered).toHaveLength(CALIBER_PRESET_NAMES.length);
    expect(ordered[0]?.name).toBe('9×19 mm');
  });
});
