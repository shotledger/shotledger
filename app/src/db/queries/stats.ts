// M5: the single query that feeds shared/src/scoring/stats.ts. Loads every
// non-deleted session/series/shot once and joins in JS (three flat scans
// instead of an N+1 per-series query), matching StatsSeries exactly.
import { isNull } from 'drizzle-orm';
import {
  getDiscipline,
  seriesStage,
  SHOTS_PER_STATION,
  type AnalyticsSeries,
  type AnalyticsSession,
  type FaltAnalyticsSession,
  type FaltStationEntry,
  type StatsSeries,
  type StatsShot,
} from '@shotledger/shared';

import { faltStations, series, sessionTags, sessions, shots } from '../schema';
import type { Database } from '../types';

function loadAnalyticsSeries(db: Database): AnalyticsSeries[] {
  const sessionRows = db.select().from(sessions).where(isNull(sessions.deletedAt)).all();
  const seriesRows = db.select().from(series).where(isNull(series.deletedAt)).all();
  const shotRows = db.select().from(shots).where(isNull(shots.deletedAt)).all();
  const sessionTagRows = db.select().from(sessionTags).all();

  const sessionById = new Map(sessionRows.map((row) => [row.id, row]));
  const shotsBySeries = new Map<string, StatsShot[]>();
  for (const shot of shotRows) {
    const bucket = shotsBySeries.get(shot.seriesId) ?? [];
    bucket.push({ valueTenths: shot.valueTenths, isInnerTen: shot.isInnerTen === 1 });
    shotsBySeries.set(shot.seriesId, bucket);
  }
  const tagIdsBySession = new Map<string, string[]>();
  for (const row of sessionTagRows) {
    const bucket = tagIdsBySession.get(row.sessionId) ?? [];
    bucket.push(row.tagId);
    tagIdsBySession.set(row.sessionId, bucket);
  }

  const result: AnalyticsSeries[] = [];
  for (const row of seriesRows) {
    const session = sessionById.get(row.sessionId);
    if (!session) continue; // orphaned series (soft-deleted session) — never surfaced
    result.push({
      id: row.id,
      sessionId: row.sessionId,
      startedAt: session.startedAt,
      disciplineId: session.disciplineId,
      weaponGroup: session.weaponGroup,
      shooterClass: session.shooterClass,
      firearmId: session.firearmId,
      ammoLotId: session.ammoLotId,
      isSighter: row.isSighter === 1,
      isFinal: row.isFinal === 1,
      shots: shotsBySeries.get(row.id) ?? [],
      // WS1 (docs/specs/webshooter-app-spec.md): an imported Webshooter
      // series has no shot rows, only a stored total/shot-count.
      totalOverride:
        row.isTotalOverride === 1 &&
        row.totalOverrideTenths !== null &&
        row.totalOverrideShotCount !== null
          ? { tenths: row.totalOverrideTenths, shotCount: row.totalOverrideShotCount }
          : null,
      sessionType: session.type,
      tagIds: tagIdsBySession.get(row.sessionId) ?? [],
      stage: seriesStage(session.programId, row.position),
    });
  }
  return result;
}

export function listAllStatsSeries(db: Database): StatsSeries[] {
  return loadAnalyticsSeries(db);
}

/**
 * `listAllStatsSeries` plus the two session-level fields the analytics
 * report filters on (type and tag ids) — one extra scan of the tiny
 * `session_tags` join table, same three scans otherwise.
 */
export function listAllAnalyticsSeries(db: Database): AnalyticsSeries[] {
  return loadAnalyticsSeries(db);
}

/**
 * Every non-deleted session as the report sees it — including the ones with no
 * series, which is the whole point: the series scan above cannot see them, so
 * the report counted 266 where Home counted 267 (#349).
 */
export function listAnalyticsSessions(db: Database): AnalyticsSession[] {
  const sessionRows = db.select().from(sessions).where(isNull(sessions.deletedAt)).all();
  const sessionTagRows = db.select().from(sessionTags).all();
  const stationRows = db
    .select({ sessionId: faltStations.sessionId })
    .from(faltStations)
    .where(isNull(faltStations.deletedAt))
    .all();
  const stationCountBySession = new Map<string, number>();
  for (const row of stationRows) {
    stationCountBySession.set(row.sessionId, (stationCountBySession.get(row.sessionId) ?? 0) + 1);
  }

  const tagIdsBySession = new Map<string, string[]>();
  for (const row of sessionTagRows) {
    const bucket = tagIdsBySession.get(row.sessionId) ?? [];
    bucket.push(row.tagId);
    tagIdsBySession.set(row.sessionId, bucket);
  }

  return sessionRows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    sessionType: row.type,
    disciplineId: row.disciplineId,
    tagIds: tagIdsBySession.get(row.id) ?? [],
    extraRounds: row.extraRounds ?? 0,
    stationRounds: (stationCountBySession.get(row.id) ?? 0) * SHOTS_PER_STATION,
    scoresHits: getDiscipline(row.disciplineId)?.scoring === 'hits',
  }));
}

/**
 * Every live session of a hits discipline, with its live stations in order —
 * the input to `shared/src/scoring/falt-analytics.ts`. Two flat scans plus the
 * tag join, like the loaders above.
 */
export function listFaltAnalyticsSessions(db: Database): FaltAnalyticsSession[] {
  const sessionRows = db
    .select()
    .from(sessions)
    .where(isNull(sessions.deletedAt))
    .all()
    .filter((row) => getDiscipline(row.disciplineId)?.scoring === 'hits');
  if (sessionRows.length === 0) return [];

  const stationRows = db
    .select()
    .from(faltStations)
    .where(isNull(faltStations.deletedAt))
    .orderBy(faltStations.position)
    .all();
  const stationsBySession = new Map<string, FaltStationEntry[]>();
  for (const row of stationRows) {
    const bucket = stationsBySession.get(row.sessionId) ?? [];
    bucket.push({
      hits: row.hits,
      figuresHit: row.figuresHit,
      points: row.points,
      isScratched: row.isScratched === 1,
      isShootOff: row.isShootOff === 1,
    });
    stationsBySession.set(row.sessionId, bucket);
  }

  const tagIdsBySession = new Map<string, string[]>();
  for (const row of db.select().from(sessionTags).all()) {
    const bucket = tagIdsBySession.get(row.sessionId) ?? [];
    bucket.push(row.tagId);
    tagIdsBySession.set(row.sessionId, bucket);
  }

  return sessionRows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    sessionType: row.type,
    disciplineId: row.disciplineId,
    weaponGroup: row.weaponGroup ?? null,
    resultMode: row.faltResultMode ?? null,
    tagIds: tagIdsBySession.get(row.id) ?? [],
    stations: stationsBySession.get(row.id) ?? [],
  }));
}
