// The Statistics inputs built from plain table rows, so the phone (SQLite)
// and the web app (`/sync/pull`, ADR 0013) feed the report from one join.
// Rows are the column set the joins read, camelCase as Drizzle returns them,
// SQLite booleans as 0/1. Callers pass live rows only.
import { disciplineSeriesLength, getDiscipline, seriesStage } from '../disciplines';
import { totalOnlyShotCount } from '../scoring/volume';
import type { AnalyticsSeries, AnalyticsSession } from '../scoring/analytics';
import type { FaltAnalyticsSession } from '../scoring/falt-analytics';
import type { FaltStationEntry } from '../scoring/falt';
import type { StatsShot } from '../scoring/stats';

export interface SessionRow {
  readonly id: string;
  readonly type: AnalyticsSeries['sessionType'];
  readonly disciplineId: string;
  readonly programId: string | null;
  readonly startedAt: string;
  readonly weaponGroup: string | null;
  readonly shooterClass: string | null;
  readonly firearmId: string | null;
  readonly ammoLotId: string | null;
  readonly extraRounds: number | null;
  readonly faltResultMode: FaltAnalyticsSession['resultMode'] | undefined;
}

export interface SeriesRow {
  readonly id: string;
  readonly sessionId: string;
  readonly position: number;
  readonly isSighter: number;
  readonly isFinal: number;
  readonly isTotalOverride: number;
  readonly totalOverrideTenths: number | null;
  readonly totalOverrideShotCount: number | null;
}

export interface ShotRow {
  readonly seriesId: string;
  readonly valueTenths: number;
  readonly isInnerTen: number;
}

export interface FaltStationRow {
  readonly sessionId: string;
  readonly position: number;
  readonly hits: number;
  readonly figuresHit: number;
  readonly points: number | null;
  readonly isScratched: number;
  readonly isShootOff: number;
}

export interface SessionTagRow {
  readonly sessionId: string;
  readonly tagId: string;
}

function tagIdsBySession(rows: readonly SessionTagRow[]): Map<string, string[]> {
  const bySession = new Map<string, string[]>();
  for (const row of rows) {
    const bucket = bySession.get(row.sessionId) ?? [];
    bucket.push(row.tagId);
    bySession.set(row.sessionId, bucket);
  }
  return bySession;
}

/** Every series with its session's fields and its shots; orphans are dropped. */
export function buildAnalyticsSeries(rows: {
  sessions: readonly SessionRow[];
  series: readonly SeriesRow[];
  shots: readonly ShotRow[];
  sessionTags: readonly SessionTagRow[];
}): AnalyticsSeries[] {
  const sessionById = new Map(rows.sessions.map((row) => [row.id, row]));
  const shotsBySeries = new Map<string, StatsShot[]>();
  for (const shot of rows.shots) {
    const bucket = shotsBySeries.get(shot.seriesId) ?? [];
    bucket.push({ valueTenths: shot.valueTenths, isInnerTen: shot.isInnerTen === 1 });
    shotsBySeries.set(shot.seriesId, bucket);
  }
  const tagIds = tagIdsBySession(rows.sessionTags);

  const result: AnalyticsSeries[] = [];
  for (const row of rows.series) {
    const session = sessionById.get(row.sessionId);
    if (!session) continue; // orphaned series (soft-deleted session) — never surfaced
    // An imported Webshooter series has no shot rows, only a stored
    // total/shot-count (docs/specs/webshooter-app-spec.md, WS1).
    const totalOverride =
      row.isTotalOverride === 1 &&
      row.totalOverrideTenths !== null &&
      row.totalOverrideShotCount !== null
        ? { tenths: row.totalOverrideTenths, shotCount: row.totalOverrideShotCount }
        : null;
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
      totalOverride,
      volumeOnlyShotCount:
        row.isTotalOverride === 1 && totalOverride === null
          ? totalOnlyShotCount(
              row.totalOverrideShotCount,
              disciplineSeriesLength(session.disciplineId),
            )
          : null,
      sessionType: session.type,
      tagIds: tagIds.get(row.sessionId) ?? [],
      stage: seriesStage(session.programId, row.position),
    });
  }
  return result;
}

/**
 * Every session as the report sees it, including the ones with no series:
 * the series join cannot see them, which made the report count one fewer
 * than Home (#349).
 */
export function buildAnalyticsSessions(rows: {
  sessions: readonly SessionRow[];
  faltStations: readonly Pick<FaltStationRow, 'sessionId'>[];
  sessionTags: readonly SessionTagRow[];
}): AnalyticsSession[] {
  const stationCount = new Map<string, number>();
  for (const row of rows.faltStations) {
    stationCount.set(row.sessionId, (stationCount.get(row.sessionId) ?? 0) + 1);
  }
  const tagIds = tagIdsBySession(rows.sessionTags);
  return rows.sessions.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    sessionType: row.type,
    disciplineId: row.disciplineId,
    tagIds: tagIds.get(row.id) ?? [],
    extraRounds: row.extraRounds ?? 0,
    stationCount: stationCount.get(row.id) ?? 0,
    seriesLength: disciplineSeriesLength(row.disciplineId),
    scoresHits: getDiscipline(row.disciplineId)?.scoring === 'hits',
  }));
}

/** Every session of a hits discipline with its stations in position order. */
export function buildFaltAnalyticsSessions(rows: {
  sessions: readonly SessionRow[];
  faltStations: readonly FaltStationRow[];
  sessionTags: readonly SessionTagRow[];
}): FaltAnalyticsSession[] {
  const hitsSessions = rows.sessions.filter(
    (row) => getDiscipline(row.disciplineId)?.scoring === 'hits',
  );
  if (hitsSessions.length === 0) return [];

  const stationsBySession = new Map<string, FaltStationEntry[]>();
  for (const row of [...rows.faltStations].sort((a, b) => a.position - b.position)) {
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
  const tagIds = tagIdsBySession(rows.sessionTags);

  return hitsSessions.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    sessionType: row.type,
    disciplineId: row.disciplineId,
    weaponGroup: row.weaponGroup ?? null,
    resultMode: row.faltResultMode ?? null,
    tagIds: tagIds.get(row.id) ?? [],
    stations: stationsBySession.get(row.id) ?? [],
  }));
}
