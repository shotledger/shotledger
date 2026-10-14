// Rounds since maintenance, derived from the maintenance log (#727 PR B).
// On its own, like firearm-counters.ts, so the writers that move the round
// count and the maintenance log can both import it without a cycle.
import { and, eq, isNull } from 'drizzle-orm';
import { roundsSinceMaintenance } from '@shotledger/shared';

import { maintenanceEvents } from '../schema';
import type { Database } from '../types';

/** The firearm's live maintenance events, with the fields the figure needs. */
export function listCounterEvents(db: Database, firearmId: string) {
  return db
    .select({
      id: maintenanceEvents.id,
      performedAt: maintenanceEvents.performedAt,
      roundCountAt: maintenanceEvents.roundCountAt,
      isAdjustment: maintenanceEvents.isAdjustment,
    })
    .from(maintenanceEvents)
    .where(and(eq(maintenanceEvents.firearmId, firearmId), isNull(maintenanceEvents.deletedAt)))
    .all();
}

/** Rounds fired since the firearm's last maintenance event (spec M2). */
export function getRoundsSinceMaintenance(
  db: Database,
  firearm: { id: string; roundCount: number },
): number {
  return roundsSinceMaintenance(firearm.roundCount, listCounterEvents(db, firearm.id));
}
