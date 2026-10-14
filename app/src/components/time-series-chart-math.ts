// Geometry and grouping for the analytics time charts, kept out of the SVG so
// it can be unit-tested. Spec: docs/specs/analytics-charts-spec.md (#349).
//
// The three faults this exists to fix, all found on a real 267-session
// dataset and none visible on demo data:
//
//   - x came from the ARRAY INDEX, so 111 sessions sharing one imported
//     timestamp spread evenly across the left third as if they were 111
//     separate dates;
//   - the axis labels carried no year across a three-year range;
//   - one line mixed disciplines whose maxima differ (precision 350,
//     milsnabb 600), making its shape meaningless.

import { DataViz } from '@shotledger/shared/src/design-tokens';

export interface TimeSeriesPoint {
  /** Chart-space key, e.g. the session id. */
  key: string;
  startedAt: string;
  value: number;
}

export interface TimeSeriesLine {
  /** Stable identity — the discipline id. Drives the colour. */
  key: string;
  label: string;
  color: string;
  points: TimeSeriesPoint[];
}

/**
 * Categorical slots, in fixed order, never cycled: the design tokens'
 * `DataViz.<theme>.categorical` (#822). Each clears 3:1 against the ground and
 * the card surface in its theme, and every pair stays apart under colour-vision
 * deficiency (`shared/src/design-tokens/tokens.test.ts` and the `dataviz`
 * skill's checker). The legend, drawn for two or more lines, names each
 * discipline in text ink, so identity is never colour alone.
 */
export const CHART_LINE_COLORS = {
  light: DataViz.light.categorical,
  dark: DataViz.dark.categorical,
} as const;

/**
 * Past this many lines the palette would have to repeat a hue, which would
 * say two disciplines are the same thing. The chart draws the busiest slots
 * and says how many it left out instead.
 */
export const MAX_LINES = CHART_LINE_COLORS.light.length;

/** Per-point markers are dropped past this, or a dense line becomes a band. */
export const MAX_DOTS = 60;

export interface TimeExtent {
  minMs: number;
  maxMs: number;
}

export function timeExtent(points: readonly TimeSeriesPoint[]): TimeExtent {
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const ms = new Date(point.startedAt).getTime();
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }
  return { minMs, maxMs };
}

/**
 * The x coordinate for a timestamp — by time, not by position.
 *
 * A degenerate extent (one point, or every point sharing a timestamp) puts
 * everything mid-plot rather than dividing by zero. That is also the honest
 * picture: those sessions really do share one instant.
 */
export function timeScale(
  iso: string,
  extent: TimeExtent,
  plotLeft: number,
  plotWidth: number,
): number {
  const span = extent.maxMs - extent.minMs;
  if (!Number.isFinite(span) || span <= 0) return plotLeft + plotWidth / 2;
  const ms = new Date(iso).getTime();
  return plotLeft + ((ms - extent.minMs) / span) * plotWidth;
}

/** Whether the axis labels have to name the year — the phone's local year, as the labels show. */
export function axisNeedsYear(points: readonly TimeSeriesPoint[]): boolean {
  if (points.length < 2) return false;
  const { minMs, maxMs } = timeExtent(points);
  return new Date(minMs).getFullYear() !== new Date(maxMs).getFullYear();
}

export interface DisciplinePoint {
  sessionId: string;
  startedAt: string;
  disciplineId: string;
}

export interface GroupedLines {
  lines: TimeSeriesLine[];
  /** Disciplines left undrawn because the palette ran out. */
  omittedCount: number;
}

/**
 * One line per discipline, ordered by discipline id so a discipline keeps its
 * colour between renders of the same data — colour follows the entity, never
 * its rank, so changing the filter must not repaint the survivors.
 *
 * Which disciplines survive a `MAX_LINES` overflow IS by size, because
 * something has to give; the count of what was dropped is returned so the
 * screen can say so rather than silently showing part of the picture.
 */
export function groupByDiscipline<P extends DisciplinePoint>(
  points: readonly P[],
  pick: (point: P) => number | null,
  label: (disciplineId: string) => string,
  colors: readonly string[],
): GroupedLines {
  const byDiscipline = new Map<string, TimeSeriesPoint[]>();
  for (const point of points) {
    const value = pick(point);
    if (value === null) continue;
    const bucket = byDiscipline.get(point.disciplineId) ?? [];
    bucket.push({ key: point.sessionId, startedAt: point.startedAt, value });
    byDiscipline.set(point.disciplineId, bucket);
  }

  const ids = [...byDiscipline.keys()];
  const kept =
    ids.length <= MAX_LINES
      ? ids
      : [...ids]
          .sort((a, b) => byDiscipline.get(b)!.length - byDiscipline.get(a)!.length)
          .slice(0, MAX_LINES);

  const lines = kept
    .sort((a, b) => a.localeCompare(b))
    .map((disciplineId, index) => ({
      key: disciplineId,
      label: label(disciplineId),
      color: colors[index % colors.length]!,
      points: byDiscipline
        .get(disciplineId)!
        .slice()
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    }));

  return { lines, omittedCount: ids.length - kept.length };
}
