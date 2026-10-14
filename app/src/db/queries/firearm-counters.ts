// The firearm round counters, on their own so that both things that move them
// — a series' shots (round-count.ts) and a fält station's six rounds
// (falt.ts) — can import it without the two forming an import cycle.
import type { Database } from '../types';
import { roundsSinceMaintenance } from '@shotledger/shared';

import { getFirearm, updateFirearm } from './firearms';
import { reportMaintenanceCounterMove } from './maintenance-due';
import { listCounterEvents } from './maintenance-counter';

/**
 * Adds `delta` rounds to a firearm's lifetime counter (never below zero). Rounds
 * since maintenance is derived from it (spec M4), so only the crossing check
 * looks at it, before and after.
 */
export function applyRoundCountDelta(db: Database, firearmId: string, delta: number) {
  const firearm = getFirearm(db, firearmId);
  if (!firearm) return undefined;
  const roundCount = Math.max(0, firearm.roundCount + delta);
  const updated = updateFirearm(db, firearmId, { roundCount });
  const events = listCounterEvents(db, firearmId);
  reportMaintenanceCounterMove(
    firearm,
    roundsSinceMaintenance(firearm.roundCount, events),
    roundsSinceMaintenance(roundCount, events),
  );
  return updated;
}
