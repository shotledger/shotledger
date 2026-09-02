import { and, eq, isNull, sql } from 'drizzle-orm';

import { series, sessions, shots } from '../schema';
import type { Database } from '../types';

export interface AmmoLotUsage {
  sessionCount: number;
  shotCount: number;
}

/**
 * Usage of an ammo lot (§4 M4): distinct firearm-session count and total
 * shots fired with it (all shots, including sighters — a volume metric like
 * the round counter, §6.3).
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

  return {
    sessionCount: sessionRow?.count ?? 0,
    shotCount: shotRow?.count ?? 0,
  };
}
