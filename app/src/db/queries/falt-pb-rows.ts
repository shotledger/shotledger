// Records' fält rows: one best result per group, read the same way Home and
// the session list read a fält session (#670).
import {
  faltPersonalBests,
  parseFaltPbGroupKey,
  poangfaltPoints,
  type FaltAnalyticsSession,
  type FaltResultMode,
} from '@shotledger/shared';

import { faltSessionResult } from './falt';
import { listSessions } from './sessions';
import type { Database } from '../types';

export interface FaltPbRow {
  groupKey: string;
  disciplineId: string;
  weaponGroupId: string | null;
  mode: FaltResultMode;
  stationCount: number;
  sessionId: string;
  sessionName: string;
  startedAt: string;
  hits: number;
  hitsPossible: number;
  figuresHit: number;
  /** Null unless every scoring station of the best session recorded one (#607). */
  figureCount: number | null;
  /** The poängfält sum — what a poängfält row shows. */
  points: number;
}

export function faltPbRows(db: Database, faltSessions: FaltAnalyticsSession[]): FaltPbRow[] {
  const nameById = new Map(listSessions(db).map((session) => [session.id, session.name] as const));
  return [...faltPersonalBests(faltSessions)]
    .map(([groupKey, pb]) => {
      const { hitsPossible, figureCount } = faltSessionResult(db, pb.sessionId);
      return {
        groupKey,
        ...parseFaltPbGroupKey(groupKey),
        sessionId: pb.sessionId,
        sessionName: nameById.get(pb.sessionId) ?? pb.sessionId,
        startedAt: pb.startedAt,
        hits: pb.result.hits,
        hitsPossible,
        figuresHit: pb.result.figuresHit,
        figureCount,
        points: poangfaltPoints(pb.result),
      };
    })
    .sort((a, b) => a.groupKey.localeCompare(b.groupKey));
}
