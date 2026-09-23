import { and, eq, isNull, sql } from 'drizzle-orm';

import { SHOTS_PER_STATION } from '@shotledger/shared';

import { faltStations, series, sessions, shots } from '../schema';
import type { Database } from '../types';

export interface AmmoLotUsage {
  sessionCount: number;
  shotCount: number;
}

/**
 * Usage of an ammo lot (§4 M4): distinct session count and total rounds fired
 * with it — all shots including sighters, six rounds for every fält station
 * including the scratched ones (a station stores no shot rows), plus each
 * session's unscored `extra_rounds` (a volume metric like the round counter;
 * §6.3, A1 §A1.3 A-X2).
 */
export function getAmmoLotUsage(db: Database, ammoLotId: string): AmmoLotUsage {
  const sessionRow = db
    .select({ count: sql<number>`count(distinct ${sessions.id})` })
    .from(sessions)
    .where(and(eq(sessions.ammoLotId, ammoLotId), isNull(sessions.deletedAt)))
    .get();

  const shotRow = db
    .select({ count: sql<number>`count(*)` })
    .from(shots)
    .innerJoin(series, eq(shots.seriesId, series.id))
    .innerJoin(sessions, eq(series.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.ammoLotId, ammoLotId),
        isNull(shots.deletedAt),
        isNull(series.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .get();

  const stationRow = db
    .select({ count: sql<number>`count(*)` })
    .from(faltStations)
    .innerJoin(sessions, eq(faltStations.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.ammoLotId, ammoLotId),
        isNull(faltStations.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .get();

  const extraRow = db
    .select({ total: sql<number | null>`sum(coalesce(${sessions.extraRounds}, 0))` })
    .from(sessions)
    .where(and(eq(sessions.ammoLotId, ammoLotId), isNull(sessions.deletedAt)))
    .get();

  return {
    sessionCount: sessionRow?.count ?? 0,
    shotCount:
      (shotRow?.count ?? 0) + (stationRow?.count ?? 0) * SHOTS_PER_STATION + (extraRow?.total ?? 0),
  };
}
