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
