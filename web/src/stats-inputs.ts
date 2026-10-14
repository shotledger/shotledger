// Pulled wire rows (snake_case SQLite columns) to the shared Statistics
// inputs — the web counterpart of app/src/db/queries/stats.ts.
import {
  buildAnalyticsSeries,
  buildAnalyticsSessions,
  buildFaltAnalyticsSessions,
  composeAnalyticsReport,
  previousPeriodRange,
  type AnalyticsFilterState,
  type AnalyticsReportData,
  type FaltStationRow,
  type SeriesRow,
  type SessionRow,
  type ShotRow,
  type TagOption,
} from '@shotledger/shared/src/analytics-rows';
import type { AnalyticsSeries, AnalyticsSession } from '@shotledger/shared/src/scoring/analytics';
import type { FaltAnalyticsSession } from '@shotledger/shared/src/scoring/falt-analytics';
import {
  canonicalTags,
  liveSessionTags,
  type SessionTagRecord,
  type TagRecord,
} from '@shotledger/shared/src/tags/canonical';

import type { PulledTables } from './pull';

const camel = (key: string) => key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

function camelize<T>(payload: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(payload).map(([k, v]) => [camel(k), v])) as T;
}

/** A row soft-deleted on the phone that reached the server as an update. */
const live = (payload: Record<string, unknown>) =>
  payload.deleted_at === null || payload.deleted_at === undefined;

/** A table's live rows, camelCased as the shared builders take them. */
export function liveRows<T>(table: Map<string, Record<string, unknown>>): T[] {
  return [...table.values()].filter(live).map((payload) => camelize<T>(payload));
}

export interface StatsInputs {
  series: AnalyticsSeries[];
  sessions: AnalyticsSession[];
  falt: FaltAnalyticsSession[];
  tags: TagOption[];
  sessionNames: Map<string, string>;
  birthYear: number | null;
}

/** Tags and links as the shared resolver takes them (deleted ones included). */
export function tagRecords(tables: PulledTables): {
  tags: TagRecord[];
  links: SessionTagRecord[];
} {
  return {
    tags: [...tables.tags.values()].map((row) => ({
      id: row.id as string,
      name: row.name as string,
      deletedAt: (row.deleted_at as string | null | undefined) ?? null,
    })),
    links: [...tables.session_tags.values()].map((row) => ({
      sessionId: row.session_id as string,
      tagId: row.tag_id as string,
      deletedAt: (row.deleted_at as string | null | undefined) ?? null,
    })),
  };
}

/** The synced birth year (a JSON number in its settings row), else null. */
function birthYearOf(tables: PulledTables): number | null {
  const row = tables.settings.get('birthYear');
  if (!row || !live(row)) return null;
  try {
    const value: unknown = JSON.parse(row.value as string);
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

export function statsInputs(tables: PulledTables): StatsInputs {
  const sessions = liveRows<SessionRow & { name: string }>(tables.sessions);
  const series = liveRows<SeriesRow>(tables.series);
  const shots = liveRows<ShotRow>(tables.shots);
  const faltStations = liveRows<FaltStationRow>(tables.falt_stations);
  const { tags, links } = tagRecords(tables);
  const sessionTags = liveSessionTags(tags, links);
  return {
    series: buildAnalyticsSeries({ sessions, series, shots, sessionTags }),
    sessions: buildAnalyticsSessions({ sessions, faltStations, sessionTags }),
    falt: buildFaltAnalyticsSessions({ sessions, faltStations, sessionTags }),
    tags: canonicalTags(tags),
    sessionNames: new Map(sessions.map((session) => [session.id, session.name])),
    birthYear: birthYearOf(tables),
  };
}

/**
 * The report for `filter`, and the same report over the period of equal
 * length before it (`null` for all time), which the headline's trend compares
 * with. The phone's `loadReport` (app/src/features/stats/use-stats-data.ts).
 */
export function statsReport(
  filter: AnalyticsFilterState,
  inputs: ReturnType<typeof statsInputs>,
  nowMs: number = Date.now(),
): { data: AnalyticsReportData; previous: AnalyticsReportData | null } {
  const range = previousPeriodRange(filter, nowMs);
  return {
    data: composeAnalyticsReport(filter, inputs, nowMs),
    previous: range === null ? null : composeAnalyticsReport(filter, inputs, nowMs, range),
  };
}
