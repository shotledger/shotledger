// Pure "rounds since maintenance" indicator math (§4 M4). No interval set ->
// no indicator at all (the UI hides the chip rather than showing a false green).
import { MAINTENANCE_AMBER_THRESHOLD, MAINTENANCE_RED_THRESHOLD } from './constants';

export type MaintenanceStatus = 'unknown' | 'green' | 'amber' | 'red';

export function maintenanceStatus(
  roundsSinceMaintenance: number,
  intervalRounds: number | null | undefined,
): MaintenanceStatus {
  if (intervalRounds == null || intervalRounds <= 0) return 'unknown';
  const ratio = roundsSinceMaintenance / intervalRounds;
  if (ratio >= MAINTENANCE_RED_THRESHOLD) return 'red';
  if (ratio >= MAINTENANCE_AMBER_THRESHOLD) return 'amber';
  return 'green';
}

/** 0..1+ fraction of the interval used, for progress bars. Null when no interval is set. */
export function maintenanceProgress(
  roundsSinceMaintenance: number,
  intervalRounds: number | null | undefined,
): number | null {
  if (intervalRounds == null || intervalRounds <= 0) return null;
  return roundsSinceMaintenance / intervalRounds;
}
