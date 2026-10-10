// What a fält station may hold when it is entered, and how the entry
// controls keep it possible (docs/specs/web-falt-entry-spec.md §3.1). Moved
// from the phone's station screen and addStation, so the web enters stations
// by the same rules.
import { SHOTS_PER_STATION } from './falt';

export interface EnterableStation {
  /** 1-based; names the station in a problem. */
  position: number;
  hits: number;
  figuresHit: number;
  figureCount?: number | null;
  points?: number | null;
  pointsMax?: number | null;
  isScratched?: boolean;
}

/**
 * Why no station could have produced these numbers, or null. Only a station
 * that still scores is checked: a scratched one records what went wrong, and
 * forcing it to be possible would lose the evidence it exists to keep.
 */
export function stationProblem(station: EnterableStation): string | null {
  if (station.isScratched) return null;
  const where = `station ${station.position}`;
  const { hits, figuresHit, figureCount, points, pointsMax } = station;
  if (!Number.isInteger(hits) || hits < 0 || hits > SHOTS_PER_STATION) {
    return `${where}: hits must be an integer 0-${SHOTS_PER_STATION}, got ${hits}`;
  }
  if (!Number.isInteger(figuresHit) || figuresHit < 0 || figuresHit > hits) {
    return `${where}: figuresHit must be an integer 0-${hits}, got ${figuresHit}`;
  }
  if (hits > 0 && figuresHit === 0) {
    return `${where}: ${hits} hits cannot be spread over 0 figures`;
  }
  if (
    figureCount != null &&
    (!Number.isInteger(figureCount) || figureCount < 1 || figureCount > SHOTS_PER_STATION)
  ) {
    return `${where}: figureCount must be an integer 1-${SHOTS_PER_STATION} or null, got ${figureCount}`;
  }
  if (figureCount != null && figuresHit > figureCount) {
    return `${where}: ${figuresHit} figures hit of ${figureCount}`;
  }
  if (points != null && (!Number.isInteger(points) || points < 0)) {
    return `${where}: points must be a non-negative integer or null, got ${points}`;
  }
  if (pointsMax != null && points != null && points > pointsMax) {
    return `${where}: ${points} points on a poängmål worth ${pointsMax}`;
  }
  return null;
}

/** The Figures Hit values on offer: never more than the hits or the figures, never 0 with hits. */
export function figuresHitRange(
  hits: number,
  figureCount: number | null,
): { min: number; max: number } {
  return { min: hits > 0 ? 1 : 0, max: Math.min(hits, figureCount ?? SHOTS_PER_STATION) };
}

/** Figures Hit after Hits or Figures changed, kept inside `figuresHitRange`. */
export function clampFiguresHit(current: number, hits: number, figureCount: number | null): number {
  const { min, max } = figuresHitRange(hits, figureCount);
  return Math.max(min, Math.min(current, max));
}

export type StationPoints =
  { ok: true; points: number | null; pointsMax: number | null } | { ok: false };

/** A whole number from a text field, or null when it is empty or not one. */
function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** The two points fields; the max is dropped when no points were entered. */
export function stationPoints(pointsText: string, pointsMaxText: string): StationPoints {
  const points = parseCount(pointsText);
  const pointsMax = parseCount(pointsMaxText);
  // Points without a max are fine (the max is optional); more than the max is not.
  const invalid =
    (pointsText.trim() !== '' && points === null) ||
    (pointsMaxText.trim() !== '' && pointsMax === null) ||
    (points !== null && pointsMax !== null && points > pointsMax);
  if (invalid) return { ok: false };
  return { ok: true, points, pointsMax: points === null ? null : pointsMax };
}

/** Nothing entered: saving it would create an empty station. */
export function isBlankStation(station: {
  hits: number;
  figureCount: number | null;
  points: number | null;
  isScratched: boolean;
  isShootOff: boolean;
}): boolean {
  return (
    station.hits === 0 &&
    station.figureCount === null &&
    station.points === null &&
    !station.isScratched &&
    !station.isShootOff
  );
}
