// The chart kit's token mapping and axis helpers.
import { chartColors, formatTick, linearAxis, seriesColor } from '@/components/chart-kit/chart-kit';
import { Colors, DataViz } from '@/theme/tokens';

describe('chartColors', () => {
  it.each(['light', 'dark'] as const)('takes every %s colour from the tokens', (theme) => {
    expect(chartColors(theme)).toEqual({
      categorical: DataViz[theme].categorical,
      rings: DataViz[theme].rings,
      grid: Colors[theme].border,
      tick: Colors[theme].textSecondary,
      value: Colors[theme].text,
    });
  });

  it('never puts the accent in a series slot', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(chartColors(theme).categorical).not.toContain(Colors[theme].primary);
    }
  });
});

describe('seriesColor', () => {
  const colors = chartColors('dark');

  it('hands out slots in order', () => {
    expect(seriesColor(colors, 0)).toBe(DataViz.dark.categorical[0]);
    expect(seriesColor(colors, 7)).toBe(DataViz.dark.categorical[7]);
  });

  it.each([8, 9, -1, 1.5])('never cycles or invents a slot (%p)', (index) => {
    expect(seriesColor(colors, index)).toBeNull();
  });
});

describe('formatTick', () => {
  it('shows the step decimals in the UI language', () => {
    expect(formatTick(9.5, 1, 'en')).toBe('9.5');
    expect(formatTick(9.5, 1, 'sv')).toBe('9,5');
    expect(formatTick(10, 1, 'en')).toBe('10.0');
    expect(formatTick(40, 0, 'en')).toBe('40');
  });
});

describe('linearAxis', () => {
  it('maps the nice range onto the length', () => {
    const axis = linearAxis(41, 98, 120);
    expect(axis.ticks).toEqual([40, 60, 80, 100]);
    expect(axis.scale(40)).toBe(0);
    expect(axis.scale(100)).toBe(120);
    expect(axis.scale(70)).toBe(60);
  });

  it('inverts for a top-down y axis', () => {
    const axis = linearAxis(41, 98, 120, { invert: true });
    expect(axis.scale(40)).toBe(120);
    expect(axis.scale(100)).toBe(0);
  });

  it('passes the tick budget through', () => {
    expect(linearAxis(0, 1000, 100, { maxTicks: 3 }).ticks.length).toBeLessThanOrEqual(3);
  });
});
