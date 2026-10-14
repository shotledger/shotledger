import { and, desc, eq, isNull, max } from 'drizzle-orm';

import { maintenanceEvents } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';
import { roundsSinceMaintenance } from '@shotledger/shared';

import { getFirearm, updateFirearm } from './firearms';
import { reportMaintenanceCounterMove } from './maintenance-due';
import { listCounterEvents } from './maintenance-counter';
import { adjustmentNote } from '../../features/firearms/round-adjustment';

export interface LogMaintenanceEventInput {
  firearmId: string;
  performedAt: string;
  kind: string; // free text v1, e.g. 'rengoring', 'service'
  notes?: string | null;
}

/**
 * Logs a maintenance event (§3/§4 M4): auto-captures the firearm's current
 * round count, which the derived "rounds since maintenance" counts from
 * (#727 M3). The firearm row is not written.
 */
export function logMaintenanceEvent(db: Database, input: LogMaintenanceEventInput) {
  const firearm = getFirearm(db, input.firearmId);
  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    firearmId: input.firearmId,
    performedAt: input.performedAt,
    kind: input.kind,
    roundCountAt: firearm?.roundCount ?? 0,
    notes: input.notes ?? null,
    isAdjustment: 0,
  };
  db.insert(maintenanceEvents).values(row).run();
  return row;
}

export function listMaintenanceEvents(db: Database, firearmId: string) {
  return (
    db
      .select()
      .from(maintenanceEvents)
      .where(and(eq(maintenanceEvents.firearmId, firearmId), isNull(maintenanceEvents.deletedAt)))
      // UUIDv7 ids are time-ordered — see licenses.ts for the same convention.
      .orderBy(desc(maintenanceEvents.id))
      .all()
  );
}

/**
 * When each firearm was last maintained (#800): the latest `performed_at` of
 * its live maintenance events, keyed by firearm id. A round-count adjustment
 * is not maintenance, so it does not restart the time interval. A firearm
 * never maintained is absent.
 */
export function lastMaintenanceAtByFirearm(db: Database): Map<string, string> {
  const rows = db
    .select({
      firearmId: maintenanceEvents.firearmId,
      performedAt: max(maintenanceEvents.performedAt),
    })
    .from(maintenanceEvents)
    .where(and(isNull(maintenanceEvents.deletedAt), eq(maintenanceEvents.isAdjustment, 0)))
    .groupBy(maintenanceEvents.firearmId)
    .all();
  return new Map(
    rows.flatMap((row) => (row.performedAt === null ? [] : [[row.firearmId, row.performedAt]])),
  );
}

export function softDeleteMaintenanceEvent(db: Database, id: string) {
  const now = nowIso();
  db.update(maintenanceEvents)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(maintenanceEvents.id, id))
    .run();
}

/**
 * Manual round-count adjustment with a reason (§4 M4). Recorded as a
 * maintenance_events row with is_adjustment = 1 and an empty `kind` (the
 * user's free text, so a reserved value could collide with what they type;
 * #727), rather than a separate table for one narrow case. It moves only
 * round_count; the derived rounds since maintenance moves with it, and an
 * adjustment is never the event that figure counts from.
 * The note leads with the amount the counter actually moved (`adjustmentNote`).
 */
export function adjustFirearmRoundCount(
  db: Database,
  firearmId: string,
  delta: number,
  reason: string,
) {
  const firearm = getFirearm(db, firearmId);
  if (!firearm) return undefined;
  const roundCount = Math.max(0, firearm.roundCount + delta);
  updateFirearm(db, firearmId, { roundCount });
  const events = listCounterEvents(db, firearmId);
  reportMaintenanceCounterMove(
    firearm,
    roundsSinceMaintenance(firearm.roundCount, events),
    roundsSinceMaintenance(roundCount, events),
  );

  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    firearmId,
    performedAt: now,
    kind: '',
    roundCountAt: roundCount,
    notes: adjustmentNote(roundCount - firearm.roundCount, reason),
    isAdjustment: 1,
  };
  db.insert(maintenanceEvents).values(row).run();
  return getFirearm(db, firearmId);
}
