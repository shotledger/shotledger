// Which two series a "move up"/"move down" press swaps.
//
// Kept pure so the rule is testable without a database. The rule is narrower
// than "swap with the row above": a session is two ordered sections (main and
// final, §6.3), and a series must not cross that boundary — a main series
// dragged into the final would silently change what it counts towards.
//
// `position` is not just a label. For a fixed-format programme it indexes the
// per-series time limits, so swapping positions is exactly right for the case
// this exists for (maintainer: a series entered late, moved up into the place
// it was actually shot) — the series lands in the slot it belongs to and
// takes that slot's time limit with it.

export interface MovableSeries {
  id: string;
  position: number;
  isFinal: boolean;
}

/**
 * The neighbour to swap with, or `null` when the press is a no-op — the
 * series is already at the end of its section, or is not in the list.
 */
export function seriesSwapTarget(
  rows: readonly MovableSeries[],
  id: string,
  direction: 'up' | 'down',
): MovableSeries | null {
  const series = rows.find((row) => row.id === id);
  if (!series) return null;

  const section = rows
    .filter((row) => row.isFinal === series.isFinal)
    .sort((a, b) => a.position - b.position);

  const index = section.findIndex((row) => row.id === id);
  const neighbour = section[direction === 'up' ? index - 1 : index + 1];
  return neighbour ?? null;
}

/** True when the button should be enabled — i.e. the press would do something. */
export function canMoveSeries(
  rows: readonly MovableSeries[],
  id: string,
  direction: 'up' | 'down',
): boolean {
  return seriesSwapTarget(rows, id, direction) !== null;
}

/** One row's new home after a drop. */
export interface SeriesPosition {
  id: string;
  position: number;
}

/**
 * Where every series in a section lands when `id` is dropped at `toIndex`
 * within that section. Returns only the rows whose position actually changes,
 * so a drop that lands where it started writes nothing.
 *
 * The section keeps its own set of position values and merely redistributes
 * them in the new order — same reasoning as `seriesSwapTarget`: for a
 * fixed-format programme those values index the per-series time limits, so a
 * series must take its new slot's limit rather than carry its old one along.
 *
 * `toIndex` is clamped, so a drag past either end parks at that end rather
 * than being refused — a finger that overshoots still means "put it last".
 */
export function seriesDropPlan(
  rows: readonly MovableSeries[],
  id: string,
  toIndex: number,
): SeriesPosition[] {
  const series = rows.find((row) => row.id === id);
  if (!series) return [];

  const section = rows
    .filter((row) => row.isFinal === series.isFinal)
    .sort((a, b) => a.position - b.position);

  const fromIndex = section.findIndex((row) => row.id === id);
  if (fromIndex === -1) return [];

  const target = Math.min(section.length - 1, Math.max(0, Math.trunc(toIndex)));
  if (target === fromIndex) return [];

  const slots = section.map((row) => row.position);
  const reordered = [...section];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(target, 0, moved as MovableSeries);

  return reordered
    .map((row, index) => ({ id: row.id, position: slots[index] as number }))
    .filter((next) => {
      const before = section.find((row) => row.id === next.id);
      return before !== undefined && before.position !== next.position;
    });
}
