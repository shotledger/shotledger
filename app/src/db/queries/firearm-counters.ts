// The firearm round counters, on their own so that both things that move them
// — a series' shots (round-count.ts) and a fält station's six rounds
// (falt.ts) — can import it without the two forming an import cycle.
import type { Database } from '../types';
import { getFirearm, updateFirearm } from './firearms';
import { reportMaintenanceCounterMove } from './maintenance-due';

/** Adds `delta` rounds to a firearm's lifetime and since-maintenance counters (never below zero). */
export function applyRoundCountDelta(db: Database, firearmId: string, delta: number) {
  const firearm = getFirearm(db, firearmId);
  if (!firearm) return undefined;
  const roundsSinceMaintenance = Math.max(0, firearm.roundsSinceMaintenance + delta);
  const updated = updateFirearm(db, firearmId, {
    roundCount: Math.max(0, firearm.roundCount + delta),
    roundsSinceMaintenance,
  });
  reportMaintenanceCounterMove(firearm, firearm.roundsSinceMaintenance, roundsSinceMaintenance);
  return updated;
}
