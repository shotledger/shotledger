// Pulled wire rows (snake_case SQLite columns) to the shared Statistics
// inputs — the web counterpart of app/src/db/queries/stats.ts.
import {
  buildAnalyticsSeries,
  buildAnalyticsSessions,
  buildFaltAnalyticsSessions,
  type FaltStationRow,
  type SeriesRow,
  type SessionRow,
  type ShotRow,
  type TagOption,
} from '@shotledger/shared/src/analytics-rows';
import type { AnalyticsSeries, AnalyticsSession } from '@shotledger/shared/src/scoring/analytics';
import type { FaltAnalyticsSession } from '@shotledger/shared/src/scoring/falt-analytics';

import type { PulledTables } from './pull';

const camel = (key: string) => key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

function camelize<T>(payload: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(payload).map(([k, v]) => [camel(k), v])) as T;
}

/** A row soft-deleted on the phone that reached the server as an update. */
const live = (payload: Record<string, unknown>) =>
  payload.deleted_at === null || payload.deleted_at === undefined;

function rowsOf<T>(table: Map<string, Record<string, unknown>>): T[] {
  return [...table.values()].filter(live).map((payload) => camelize<T>(payload));
}

export interface StatsInputs {
  series: AnalyticsSeries[];
  sessions: AnalyticsSession[];
  falt: FaltAnalyticsSession[];
  tags: TagOption[];
  sessionNames: Map<string, string>;
}

/**
 * Session tags are not synced (docs/specs/sync-protocol-spec.md §1), so no
 * session carries a tag here and the web report offers no tag filter.
 */
export function statsInputs(tables: PulledTables): StatsInputs {
  const sessions = rowsOf<SessionRow & { name: string }>(tables.sessions);
  const series = rowsOf<SeriesRow>(tables.series);
  const shots = rowsOf<ShotRow>(tables.shots);
  const faltStations = rowsOf<FaltStationRow>(tables.falt_stations);
  const sessionTags: never[] = [];
  return {
    series: buildAnalyticsSeries({ sessions, series, shots, sessionTags }),
    sessions: buildAnalyticsSessions({ sessions, faltStations, sessionTags }),
    falt: buildFaltAnalyticsSessions({ sessions, faltStations, sessionTags }),
    tags: rowsOf<TagOption>(tables.tags).map(({ id, name }) => ({ id, name })),
    sessionNames: new Map(sessions.map((session) => [session.id, session.name])),
  };
}
