// A session's rounds fired from pulled wire rows, by the one volume rule
// (`sessionVolume`), as the phone's sessionVolumes reads them from its tables.
// Shared by the web's bulk edit and session edit (web-session-edit-spec §3.1).
import { disciplineSeriesLength } from '../disciplines';
import { sessionVolume, type VolumeSeries } from '../scoring/volume';
import type { Payload } from './rows';

/** Present in the pull (server tombstones are dropped) and not soft-deleted. */
export const isLiveRow = (row: Payload | undefined): row is Payload =>
  row !== undefined && (row.deleted_at === null || row.deleted_at === undefined);

export const liveRowsIn = (rows: ReadonlyMap<string, Payload>): Payload[] =>
  [...rows.values()].filter(isLiveRow);

export interface VolumeTables {
  series: ReadonlyMap<string, Payload>;
  shots: ReadonlyMap<string, Payload>;
  faltStations: ReadonlyMap<string, Payload>;
}

const countBy = (rows: Payload[], key: string): Map<unknown, number> => {
  const counts = new Map<unknown, number>();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return counts;
};

/** A series row as volume sees it, given its live shot rows. */
export function volumeSeriesOf(series: Payload, shotCount: number): VolumeSeries {
  return {
    shotCount,
    totalOnly: series.is_total_override === 1,
    overrideShotCount: (series.total_override_shot_count as number | null | undefined) ?? null,
  };
}

/** One session's rounds over the given series (live, with their live shot counts). */
export function sessionRoundsOf(
  session: Payload,
  series: readonly VolumeSeries[],
  stationCount: number,
): number {
  return sessionVolume({
    series,
    extraRounds: (session.extra_rounds as number | null | undefined) ?? null,
    stationCount,
    seriesLength: disciplineSeriesLength(session.discipline_id as string),
  });
}

/**
 * Each session's rounds by the one volume rule, as the phone's
 * sessionVolumeRounds. The tables are indexed once, so a season of sessions
 * stays linear in its shots.
 */
export function volumeIndex(tables: VolumeTables): (session: Payload) => number {
  const shotsBySeries = countBy(liveRowsIn(tables.shots), 'series_id');
  const stationsBySession = countBy(liveRowsIn(tables.faltStations), 'session_id');
  const seriesBySession = new Map<unknown, VolumeSeries[]>();
  for (const s of liveRowsIn(tables.series)) {
    const bucket = seriesBySession.get(s.session_id) ?? [];
    bucket.push(volumeSeriesOf(s, shotsBySeries.get(s.id) ?? 0));
    seriesBySession.set(s.session_id, bucket);
  }
  return (session) =>
    sessionRoundsOf(
      session,
      seriesBySession.get(session.id) ?? [],
      stationsBySession.get(session.id) ?? 0,
    );
}
