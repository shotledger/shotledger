// The one volume rule (#512): every rounds-fired figure in the app is a sum
// of `sessionVolume`. docs/specs/one-volume-figure-spec.md.
import { SHOTS_PER_STATION } from './falt';

/** A series as volume sees it. */
export interface VolumeSeries {
  /** Live shot rows; a total-only series has none. */
  shotCount: number;
  /** A total-only series: saved as a total, with no shot rows. */
  totalOnly: boolean;
  /** A total-only series' stored shot count; null when none was stored (ShotLog). */
  overrideShotCount: number | null;
}

export interface VolumeSession {
  /** Live series, sighters included. */
  series: readonly VolumeSeries[];
  extraRounds: number | null;
  /** Live fält stations, scratched and särskjutning included. */
  stationCount: number;
  /** The discipline's `defaultSeriesLength`. */
  seriesLength: number;
}

function count(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
  return value;
}

/**
 * Shots in a total-only series: its stored count, else its discipline's
 * series length (maintainer, 2026-10-04).
 *
 * @Requirements SCORE_010
 */
export function totalOnlyShotCount(storedShotCount: number | null, seriesLength: number): number {
  if (storedShotCount !== null) return count('overrideShotCount', storedShotCount);
  if (count('seriesLength', seriesLength) === 0) {
    throw new RangeError('seriesLength must be positive, got 0');
  }
  return seriesLength;
}

/**
 * Rounds fired in one series: a total-only series' shot count
 * (`totalOnlyShotCount`), else its shot rows.
 *
 * @Requirements SCORE_003, SCORE_010
 */
export function seriesVolume(series: VolumeSeries, seriesLength: number): number {
  return series.totalOnly
    ? totalOnlyShotCount(series.overrideShotCount, seriesLength)
    : count('shotCount', series.shotCount);
}

/**
 * Rounds fired in one session: every series (sighters included), the
 * unscored extra rounds and six per fält station.
 *
 * @Requirements SCORE_003, SCORE_006, SCORE_010
 */
export function sessionVolume(session: VolumeSession): number {
  return (
    session.series.reduce((sum, series) => sum + seriesVolume(series, session.seriesLength), 0) +
    count('extraRounds', session.extraRounds ?? 0) +
    count('stationCount', session.stationCount) * SHOTS_PER_STATION
  );
}

/**
 * A series in the scoring modules' shape: shot rows plus an optional
 * override. Its counts are already resolved by `totalOnlyShotCount`, so no
 * series length is needed here.
 */
export interface SeriesWithShots {
  shots: { length: number };
  totalOverride?: { shotCount: number } | null;
  /**
   * A total-only series the score statistics leave out because it stored no
   * shot count (a ShotLog import, so no `totalOverride`): its resolved count.
   */
  volumeOnlyShotCount?: number | null;
}

function resolvedShotCount(series: SeriesWithShots): number | null {
  return series.totalOverride?.shotCount ?? series.volumeOnlyShotCount ?? null;
}

export function toVolumeSeries(series: SeriesWithShots): VolumeSeries {
  const resolved = resolvedShotCount(series);
  return {
    shotCount: series.shots.length,
    totalOnly: resolved !== null,
    overrideShotCount: resolved,
  };
}

/** `seriesVolume` for a series in the scoring modules' shape. */
export function volumeOfSeries(series: SeriesWithShots): number {
  const resolved = resolvedShotCount(series);
  return resolved === null
    ? count('shotCount', series.shots.length)
    : count('overrideShotCount', resolved);
}
