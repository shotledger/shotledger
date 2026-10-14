// Archive and restore a firearm (#799). The row change is the query layer's;
// this adds what follows from it on the device: an archived firearm's license
// expiry and maintenance time reminders stop, and restoring it schedules them
// again.
import { db } from '@/db/client';
import { archiveFirearm, restoreFirearm } from '@/db/queries/firearms';

import { refreshLicenseExpiryReminders } from './license-reminders';
import { refreshMaintenanceTimeReminders } from './maintenance';

/** Both reminder sets leave out archived firearms, so a refresh is all it takes. */
async function refresh(): Promise<void> {
  await refreshLicenseExpiryReminders({ request: false });
  await refreshMaintenanceTimeReminders({ request: false });
}

export async function archiveFirearmAndReminders(firearmId: string): Promise<void> {
  archiveFirearm(db, firearmId);
  await refresh();
}

export async function restoreFirearmAndReminders(firearmId: string): Promise<void> {
  if (!restoreFirearm(db, firearmId)) return;
  await refresh();
}
