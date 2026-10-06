// The Statistics loaders: live rows from SQLite, joined by the shared
// builders (shared/src/analytics-rows) that the web app also feeds.
import { isNull } from 'drizzle-orm';
import {
  buildAnalyticsSeries,
  buildAnalyticsSessions,
  buildFaltAnalyticsSessions,
  type AnalyticsSeries,
  type AnalyticsSession,
  type FaltAnalyticsSession,
  type StatsSeries,
} from '@shotledger/shared';

import { faltStations, series, sessions, shots } from '../schema';
import type { Database } from '../types';
import { listLiveSessionTags } from './tags';

const liveSessions = (db: Database) =>
  db.select().from(sessions).where(isNull(sessions.deletedAt)).all();
const liveStations = (db: Database) =>
  db.select().from(faltStations).where(isNull(faltStations.deletedAt)).all();

function loadAnalyticsSeries(db: Database): AnalyticsSeries[] {
  return buildAnalyticsSeries({
    sessions: liveSessions(db),
    series: db.select().from(series).where(isNull(series.deletedAt)).all(),
    shots: db.select().from(shots).where(isNull(shots.deletedAt)).all(),
    sessionTags: listLiveSessionTags(db),
  });
}

export function listAllStatsSeries(db: Database): StatsSeries[] {
  return loadAnalyticsSeries(db);
}

/** `listAllStatsSeries` plus the session type and tag ids the report filters on. */
export function listAllAnalyticsSeries(db: Database): AnalyticsSeries[] {
  return loadAnalyticsSeries(db);
}

/** Every live session as the report sees it, including those with no series (#349). */
export function listAnalyticsSessions(db: Database): AnalyticsSession[] {
  return buildAnalyticsSessions({
    sessions: liveSessions(db),
    faltStations: liveStations(db),
    sessionTags: listLiveSessionTags(db),
  });
}

/** Every live session of a hits discipline, with its live stations in order. */
export function listFaltAnalyticsSessions(db: Database): FaltAnalyticsSession[] {
  return buildFaltAnalyticsSessions({
    sessions: liveSessions(db),
    faltStations: liveStations(db),
    sessionTags: listLiveSessionTags(db),
  });
}
