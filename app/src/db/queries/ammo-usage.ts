import { and, eq, isNull, sql } from 'drizzle-orm';

import { sessions } from '../schema';
import type { Database } from '../types';
import { totalVolumeRounds } from './volume';

export interface AmmoLotUsage {
  sessionCount: number;
  shotCount: number;
}

/**
 * Usage of an ammo lot (§4 M4): distinct session count and the rounds fired
 * with it — the sum of its sessions' volume (`sessionVolume`, #512).
 */
export function getAmmoLotUsage(db: Database, ammoLotId: string): AmmoLotUsage {
  const sessionRow = db
    .select({ count: sql<number>`count(distinct ${sessions.id})` })
    .from(sessions)
    .where(and(eq(sessions.ammoLotId, ammoLotId), isNull(sessions.deletedAt)))
    .get();

  return {
    sessionCount: sessionRow?.count ?? 0,
    shotCount: totalVolumeRounds(db, eq(sessions.ammoLotId, ammoLotId)),
  };
}
