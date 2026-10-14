// The maintenance-due crossing (§4 M4), checked where a local write moves a
// firearm's rounds-since-maintenance. The query layer stays synchronous and
// free of platform imports: it calls a listener, and the app root connects
// that listener to the notification wrapper (app/src/platform/notifications.ts).
import { shouldNotifyMaintenanceDue } from '@shotledger/shared';

export interface MaintenanceDueFirearm {
  id: string;
  make: string;
  model: string;
}

type MaintenanceDueListener = (firearm: MaintenanceDueFirearm) => void;

let listener: MaintenanceDueListener | null = null;

/** Sets the one listener told about a crossing; returns a function that removes it. */
export function setMaintenanceDueListener(next: MaintenanceDueListener | null): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/**
 * Tells the listener when a counter move takes rounds-since-maintenance from
 * below the interval to at or above it. Once over, later rounds do not cross
 * again; a maintenance reset brings it back below. An archived firearm stays
 * quiet: it is gone from the shooter's cabinet (#799).
 */
export function reportMaintenanceCounterMove(
  firearm: MaintenanceDueFirearm & {
    maintenanceIntervalRounds: number | null;
    archivedAt?: string | null;
  },
  previousRoundsSinceMaintenance: number,
  nextRoundsSinceMaintenance: number,
): void {
  if (
    listener &&
    !firearm.archivedAt &&
    shouldNotifyMaintenanceDue(
      previousRoundsSinceMaintenance,
      nextRoundsSinceMaintenance,
      firearm.maintenanceIntervalRounds,
    )
  ) {
    listener({ id: firearm.id, make: firearm.make, model: firearm.model });
  }
}
