// Pulled wire rows to the shooting log's input — the web counterpart of the
// queries app/src/features/export/use-pdf-export.ts reads.
import { disciplineSeriesLength } from '@shotledger/shared/src/disciplines';
import { sessionVolume, type VolumeSeries } from '@shotledger/shared/src/scoring/volume';

import type {
  ShootingLogFirearm,
  ShootingLogSession,
} from '../../app/src/features/export/shooting-log';
import type { PulledTables } from './pull';
import { liveRows } from './stats-inputs';

export interface LogSession extends ShootingLogSession {
  extraRounds: number | null;
}

export interface LogInputs {
  sessions: LogSession[];
  firearms: Map<string, ShootingLogFirearm>;
  /** Rounds fired per live session, by the one shared volume rule (#512). */
  volumes: Map<string, number>;
}

interface SeriesWire {
  id: string;
  sessionId: string;
  isTotalOverride: number;
  totalOverrideShotCount: number | null;
}

export function logInputs(tables: PulledTables): LogInputs {
  const sessions = liveRows<LogSession>(tables.sessions);
  const series = liveRows<SeriesWire>(tables.series);
  const shots = liveRows<{ seriesId: string }>(tables.shots);
  const stations = liveRows<{ sessionId: string }>(tables.falt_stations);
  const firearms = liveRows<ShootingLogFirearm & { id: string }>(tables.firearms);

  const shotsBySeries = new Map<string, number>();
  for (const shot of shots) {
    shotsBySeries.set(shot.seriesId, (shotsBySeries.get(shot.seriesId) ?? 0) + 1);
  }
  const seriesBySession = new Map<string, VolumeSeries[]>();
  for (const row of series) {
    const bucket = seriesBySession.get(row.sessionId) ?? [];
    bucket.push({
      shotCount: shotsBySeries.get(row.id) ?? 0,
      totalOnly: row.isTotalOverride === 1,
      overrideShotCount: row.totalOverrideShotCount ?? null,
    });
    seriesBySession.set(row.sessionId, bucket);
  }
  const stationsBySession = new Map<string, number>();
  for (const station of stations) {
    stationsBySession.set(station.sessionId, (stationsBySession.get(station.sessionId) ?? 0) + 1);
  }

  return {
    sessions,
    firearms: new Map(firearms.map(({ id, make, model }) => [id, { make, model }])),
    volumes: new Map(
      sessions.map((session) => [
        session.id,
        sessionVolume({
          series: seriesBySession.get(session.id) ?? [],
          extraRounds: session.extraRounds ?? null,
          stationCount: stationsBySession.get(session.id) ?? 0,
          seriesLength: disciplineSeriesLength(session.disciplineId),
        }),
      ]),
    ),
  };
}
