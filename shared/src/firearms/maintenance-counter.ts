// Rounds since maintenance, derived from the maintenance log rather than
// stored on the firearm (#727 PR B, spec M2). Logging, deleting or syncing an
// event moves the figure without a write to `firearms`.

/** The fields of a maintenance event the figure depends on. */
export interface MaintenanceCounterEvent {
  readonly id: string;
  readonly performedAt: string;
  readonly roundCountAt: number;
  /** A round-count correction, not maintenance: never a reference event. */
  readonly isAdjustment: number | boolean;
  readonly deletedAt?: string | null;
}

/**
 * The event the figure counts from: the newest non-deleted, non-adjustment
 * event by `performedAt`, ties broken by `id` (UUIDv7, creation order).
 * Undefined when the firearm has none.
 */
export function latestMaintenanceEvent<T extends MaintenanceCounterEvent>(
  events: readonly T[],
): T | undefined {
  let latest: T | undefined;
  for (const event of events) {
    if (event.deletedAt != null || event.isAdjustment) continue;
    if (
      latest === undefined ||
      event.performedAt > latest.performedAt ||
      (event.performedAt === latest.performedAt && event.id > latest.id)
    ) {
      latest = event;
    }
  }
  return latest;
}

/** `roundCount` minus the reference event's `roundCountAt`, never below 0;
 *  the whole `roundCount` when no maintenance is logged. */
export function roundsSinceMaintenance(
  roundCount: number,
  events: readonly MaintenanceCounterEvent[],
): number {
  const latest = latestMaintenanceEvent(events);
  return Math.max(0, roundCount - (latest?.roundCountAt ?? 0));
}
