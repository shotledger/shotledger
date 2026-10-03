// Fält in the statistics report and the records. Spec:
// docs/specs/falt-consumers-spec.md, Layer B (R1–R5, PB1–PB4).
import {
  filterAnalyticsSessions,
  type AnalyticsFilter,
  type AnalyticsSessionType,
} from './analytics';
import {
  compareFaltResults,
  faltResult,
  scoringStations,
  SHOTS_PER_STATION,
  type FaltResultMode,
  type FaltRoundResult,
  type FaltStation,
  type FaltStationEntry,
} from './falt';

/** A fält session as the report and the records see it. */
export interface FaltAnalyticsSession {
  id: string;
  startedAt: string;
  sessionType: AnalyticsSessionType;
  disciplineId: string;
  weaponGroup: string | null;
  /** `null` reads as vanlig fält, the mode a session gets when none was chosen. */
  resultMode: FaltResultMode | null;
  tagIds: readonly string[];
  /** In station order. */
  stations: readonly FaltStationEntry[];
}

export interface FaltReportTotals {
  sessionCount: number;
  /** Scoring stations only — scratched and särskjutning stations are not results. */
  stationCount: number;
  hits: number;
  figuresHit: number;
  /** hits / (6 × stationCount); null with no scoring station. */
  hitRate: number | null;
}

/**
 * The fält sessions a report covers. A shots-per-series filter asks about ring
 * series, which a fält round does not have, so it takes every fält session
 * out — unlike a rounds-only session, which #349 keeps.
 */
export function filterFaltSessions(
  sessions: readonly FaltAnalyticsSession[],
  filter: AnalyticsFilter,
): FaltAnalyticsSession[] {
  if (filter.shotsPerSeries !== null) return [];
  const kept = new Set(
    filterAnalyticsSessions(
      sessions.map((session) => ({
        ...session,
        extraRounds: 0,
        stationRounds: 0,
        scoresHits: true,
      })),
      filter,
    ).map((session) => session.id),
  );
  return sessions.filter((session) => kept.has(session.id));
}

export function faltReportTotals(sessions: readonly FaltAnalyticsSession[]): FaltReportTotals {
  let stationCount = 0;
  let hits = 0;
  let figuresHit = 0;
  for (const session of sessions) {
    const result = faltResult(scoringStations(session.stations));
    stationCount += result.stationCount;
    hits += result.hits;
    figuresHit += result.figuresHit;
  }
  return {
    sessionCount: sessions.length,
    stationCount,
    hits,
    figuresHit,
    hitRate: stationCount === 0 ? null : hits / (stationCount * SHOTS_PER_STATION),
  };
}

function byDateThenId(a: FaltAnalyticsSession, b: FaltAnalyticsSession): number {
  return a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id);
}

export interface FaltSessionPoint {
  sessionId: string;
  startedAt: string;
  disciplineId: string;
  hitsPerStation: number;
}

export function faltSessionPoints(sessions: readonly FaltAnalyticsSession[]): FaltSessionPoint[] {
  const points: FaltSessionPoint[] = [];
  for (const session of [...sessions].sort(byDateThenId)) {
    const result = faltResult(scoringStations(session.stations));
    if (result.stationCount === 0) continue;
    points.push({
      sessionId: session.id,
      startedAt: session.startedAt,
      disciplineId: session.disciplineId,
      hitsPerStation: result.hits / result.stationCount,
    });
  }
  return points;
}

export interface FaltPbGroup {
  disciplineId: string;
  weaponGroupId: string | null;
  mode: FaltResultMode;
  /** Scoring stations — a 10-station round with two scratched is an 8-station result. */
  stationCount: number;
}

export interface FaltPersonalBest {
  sessionId: string;
  startedAt: string;
  result: FaltRoundResult;
}

// `|`, not `:` — a vapengrupp id already contains a colon (`spsf:C`).
export function faltPbGroupKey(group: FaltPbGroup): string {
  return [group.disciplineId, group.weaponGroupId ?? '', group.mode, group.stationCount].join('|');
}

export function parseFaltPbGroupKey(key: string): FaltPbGroup {
  const [disciplineId = '', weaponGroupId = '', mode, stationCount = ''] = key.split('|');
  return {
    disciplineId,
    weaponGroupId: weaponGroupId === '' ? null : weaponGroupId,
    mode: mode === 'poangfalt' ? 'poangfalt' : 'falt',
    stationCount: Number(stationCount),
  };
}

/**
 * The best round per group (discipline, vapengrupp, result mode, scoring
 * station count), by SHB's särskiljning order in that mode. Sessions are
 * visited oldest first and only a strictly better round replaces the holder,
 * so of two SHB cannot separate the earlier stands.
 *
 * @Requirements SCORE_007
 */
export function faltPersonalBests(
  sessions: readonly FaltAnalyticsSession[],
): Map<string, FaltPersonalBest> {
  const best = new Map<string, FaltPersonalBest & { stations: readonly FaltStation[] }>();
  for (const session of [...sessions].sort(byDateThenId)) {
    const stations = scoringStations(session.stations);
    if (stations.length === 0) continue;
    const mode = session.resultMode ?? 'falt';
    const key = faltPbGroupKey({
      disciplineId: session.disciplineId,
      weaponGroupId: session.weaponGroup,
      mode,
      stationCount: stations.length,
    });
    const holder = best.get(key);
    if (holder && compareFaltResults(stations, holder.stations, mode) >= 0) continue;
    best.set(key, {
      sessionId: session.id,
      startedAt: session.startedAt,
      result: faltResult(stations),
      stations,
    });
  }
  return new Map(
    [...best].map(([key, { sessionId, startedAt, result }]) => [
      key,
      { sessionId, startedAt, result },
    ]),
  );
}
