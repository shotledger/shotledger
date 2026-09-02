import { and, desc, eq, isNull } from 'drizzle-orm';

import { maintenanceEvents } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';
import { getFirearm, updateFirearm } from './firearms';

export interface LogMaintenanceEventInput {
  firearmId: string;
  performedAt: string;
  kind: string; // free text v1, e.g. 'rengoring', 'service'
  notes?: string | null;
}

/**
 * Logs a maintenance event (§3/§4 M4): auto-captures the firearm's current
 * round count and resets rounds_since_maintenance to 0, since performing
 * maintenance is what the "rounds since" indicator counts from.
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
  };
  db.insert(maintenanceEvents).values(row).run();
  if (firearm) {
    updateFirearm(db, input.firearmId, { roundsSinceMaintenance: 0 });
  }
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

export function softDeleteMaintenanceEvent(db: Database, id: string) {
  const now = nowIso();
  db.update(maintenanceEvents)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(maintenanceEvents.id, id))
    .run();
}

/**
 * Manual round-count adjustment with a reason (§4 M4). Recorded as a
 * maintenance_events row of kind 'adjustment' — `kind` is free text v1
 * (§3), so this stays consistent with logMaintenanceEvent rather than
 * adding a separate table for one narrow case. Unlike logMaintenanceEvent,
 * it does NOT reset rounds_since_maintenance (no maintenance was performed).
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
  const roundsSinceMaintenance = Math.max(0, firearm.roundsSinceMaintenance + delta);
  updateFirearm(db, firearmId, { roundCount, roundsSinceMaintenance });

  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    firearmId,
    performedAt: now,
    kind: 'adjustment',
    roundCountAt: roundCount,
    notes: reason,
  };
  db.insert(maintenanceEvents).values(row).run();
  return getFirearm(db, firearmId);
}
