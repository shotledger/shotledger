// Chart kit, the React-free half (#822, DESIGN.md "Chart Kit"): the colours
// a chart takes from the design tokens, and the tick and label helpers every
// axis shares. The drawing pieces are in `axis.tsx`.
import { niceTicks, type NiceTicks } from '@shotledger/shared';

import { Colors, DataViz, type ThemeName } from '@/theme/tokens';

export interface ChartColors {
  /** One colour per series, in slot order (`DataViz.<theme>.categorical`). */
  categorical: readonly string[];
  /** Ring values, weakest first (`DataViz.<theme>.rings`). */
  rings: readonly string[];
  /** Gridlines and the axis rule: `border`, 3:1 on ground and card. */
  grid: string;
  /** Tick labels and axis captions: `textSecondary`. */
  tick: string;
  /** Values printed on the plot itself: `text`. */
  value: string;
}

export function chartColors(theme: ThemeName): ChartColors {
  return {
    categorical: DataViz[theme].categorical,
    rings: DataViz[theme].rings,
    grid: Colors[theme].border,
    tick: Colors[theme].textSecondary,
    value: Colors[theme].text,
  };
}

/**
 * The colour of series `index`, or `null` past the last slot. Never cycles:
 * a repeated colour would say two series are the same thing, so a chart
 * with more series draws the first ones and says how many it left out.
 */
export function seriesColor(colors: ChartColors, index: number): string | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return colors.categorical[index] ?? null;
}

/** A tick label: the step's decimals, in the UI language's number format. */
export function formatTick(value: number, decimals: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export interface LinearAxis extends NiceTicks {
  /** Maps a data value to a pixel offset along the axis (0 at `min`). */
  scale: (value: number) => number;
}

/**
 * A value axis of `length` pixels over [`dataMin`, `dataMax`], rounded out
 * to nice ticks. `invert` puts `min` at the far end, as a y axis drawn
 * top-down needs.
 */
export function linearAxis(
  dataMin: number,
  dataMax: number,
  length: number,
  { maxTicks = 5, invert = false }: { maxTicks?: number; invert?: boolean } = {},
): LinearAxis {
  const ticks = niceTicks(dataMin, dataMax, maxTicks);
  const span = ticks.max - ticks.min;
  const scale = (value: number) => {
    const t = (value - ticks.min) / span;
    return (invert ? 1 - t : t) * length;
  };
  return { ...ticks, scale };
}
