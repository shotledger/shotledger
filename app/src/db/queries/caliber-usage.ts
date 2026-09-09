// Caliber picker options, most-used first.
//
// No column and no table records "how often": the counts are derived from the
// user's own `firearms` and `ammo_lots` rows on every read. This module only
// supplies the counts — the ordering (and the folding of spelling variants)
// is `orderCalibersByUsage` in `shared/src/calibers`, which is pure and tested
// on its own.
import {
  orderCalibersByUsage,
  type CaliberUsageCount,
  type OrderedCaliber,
} from '@shotledger/shared';
import { and, isNotNull, isNull, sql } from 'drizzle-orm';

import { ammoLots, firearms } from '../schema';
import type { Database } from '../types';

export type { CaliberUsageCount, OrderedCaliber };

export function caliberUsageCounts(db: Database): CaliberUsageCount[] {
  const fromFirearms = db
    .select({ caliber: firearms.caliber, count: sql<number>`count(*)` })
    .from(firearms)
    .where(and(isNull(firearms.deletedAt), isNotNull(firearms.caliber)))
    .groupBy(firearms.caliber)
    .all();

  const fromAmmoLots = db
    .select({ caliber: ammoLots.caliber, count: sql<number>`count(*)` })
    .from(ammoLots)
    .where(and(isNull(ammoLots.deletedAt), isNotNull(ammoLots.caliber)))
    .groupBy(ammoLots.caliber)
    .all();

  return [...fromFirearms, ...fromAmmoLots];
}

/**
 * The full caliber vocabulary in picker order, plus any legacy value still
 * stored on one of the user's rows.
 */
export function listCaliberOptions(db: Database): OrderedCaliber[] {
  return orderCalibersByUsage(caliberUsageCounts(db));
}
