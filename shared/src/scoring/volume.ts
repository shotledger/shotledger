// The one volume rule (#512): every rounds-fired figure in the app is a sum
// of `sessionVolume`. docs/specs/one-volume-figure-spec.md.
import { SHOTS_PER_STATION } from './falt';

/** A series as volume sees it. */
export interface VolumeSeries {
  /** Live shot rows; a total-only series has none. */
  shotCount: number;
  /** A total-only series' stored shot count; null otherwise, or when unknown (ShotLog). */
  overrideShotCount: number | null;
}

export interface VolumeSession {
  /** Live series, sighters included. */
  series: readonly VolumeSeries[];
  extraRounds: number | null;
  /** Live fält stations, scratched and särskjutning included. */
  stationCount: number;
}

function count(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
  return value;
}

/**
 * Rounds fired in one series: a total-only series' stored count, else its
 * shot rows. A total-only series with no stored count (ShotLog) is 0 — the
 * app does not know it, and does not guess.
 *
 * @Requirements SCORE_003, SCORE_010
 */
export function seriesVolume(series: VolumeSeries): number {
  return series.overrideShotCount === null
    ? count('shotCount', series.shotCount)
    : count('overrideShotCount', series.overrideShotCount);
}

/**
 * Rounds fired in one session: every series (sighters included), the
 * unscored extra rounds and six per fält station.
 *
 * @Requirements SCORE_003, SCORE_006, SCORE_010
 */
export function sessionVolume(session: VolumeSession): number {
  return (
    session.series.reduce((sum, series) => sum + seriesVolume(series), 0) +
    count('extraRounds', session.extraRounds ?? 0) +
    count('stationCount', session.stationCount) * SHOTS_PER_STATION
  );
}

/** A series in the scoring modules' shape (shot rows plus an optional override). */
export interface SeriesWithShots {
  shots: { length: number };
  totalOverride?: { shotCount: number } | null;
}

export function toVolumeSeries(series: SeriesWithShots): VolumeSeries {
  return {
    shotCount: series.shots.length,
    overrideShotCount: series.totalOverride?.shotCount ?? null,
  };
}

/** `seriesVolume` for a series in the scoring modules' shape. */
export function volumeOfSeries(series: SeriesWithShots): number {
  return seriesVolume(toVolumeSeries(series));
}
