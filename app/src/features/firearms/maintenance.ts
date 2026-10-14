// Maintenance due by rounds or by time (#800), for the firearms list, the
// firearm detail and the scheduled time reminders. The math is in
// shared/src/firearms/maintenance-time.ts; this file supplies what the time
// interval counts from and hands reminders to the platform wrapper.
import {
  maintenanceDue,
  maintenanceTimeNotificationAt,
  type MaintenanceDue,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listActiveFirearms } from '@/db/queries/firearms';
import { lastMaintenanceAtByFirearm } from '@/db/queries/maintenance-events';
import {
  replaceMaintenanceTimeReminders,
  type MaintenanceTimeReminder,
} from '@/platform/notifications';

export interface MaintenanceFirearm {
  id: string;
  make: string;
  model: string;
  createdAt: string;
  maintenanceIntervalRounds: number | null;
  maintenanceIntervalMonths: number | null;
}

/** The time interval runs from the last maintenance, else from when the firearm was added. */
export function maintenanceCountedFrom(
  firearm: Pick<MaintenanceFirearm, 'createdAt'>,
  lastMaintenanceAt: string | undefined,
): string {
  return lastMaintenanceAt ?? firearm.createdAt;
}

/** `roundsSinceMaintenance` is the figure derived from the log (#727, `getRoundsSinceMaintenance`). */
export function firearmMaintenanceDue(
  firearm: MaintenanceFirearm,
  roundsSinceMaintenance: number,
  lastMaintenanceAt: string | undefined,
  now: Date = new Date(),
): MaintenanceDue {
  return maintenanceDue(
    {
      roundsSinceMaintenance,
      intervalRounds: firearm.maintenanceIntervalRounds,
      countedFrom: maintenanceCountedFrom(firearm, lastMaintenanceAt),
      intervalMonths: firearm.maintenanceIntervalMonths,
    },
    now,
  );
}

/** One reminder per firearm whose time limit still lies ahead. */
export function maintenanceTimeReminders(
  firearms: readonly MaintenanceFirearm[],
  lastMaintenanceAt: ReadonlyMap<string, string>,
  now: Date,
): MaintenanceTimeReminder[] {
  return firearms.flatMap((firearm) => {
    const fireAt = maintenanceTimeNotificationAt(
      maintenanceCountedFrom(firearm, lastMaintenanceAt.get(firearm.id)),
      firearm.maintenanceIntervalMonths,
      now,
    );
    return fireAt === null
      ? []
      : [{ firearmId: firearm.id, firearmLabel: `${firearm.make} ${firearm.model}`, fireAt }];
  });
}

/**
 * Re-schedules every firearm's time reminder from the database. Runs at app
 * start and on return to the foreground (so an interval or maintenance that
 * arrived by sync is picked up), and after a local change to either. An
 * archived firearm gets none (#799), so archiving and restoring refresh too.
 */
export async function refreshMaintenanceTimeReminders({
  request,
}: {
  request: boolean;
}): Promise<void> {
  if (!db) return;
  await replaceMaintenanceTimeReminders(
    maintenanceTimeReminders(listActiveFirearms(db), lastMaintenanceAtByFirearm(db), new Date()),
    { request },
  );
}
