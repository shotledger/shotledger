// Archive and restore a firearm (#799). The row change is the query layer's;
// this adds what follows from it on the device: an archived firearm's licence
// expiry and maintenance time reminders stop, and restoring it schedules the
// latest licence's and its maintenance reminder again.
import { LICENSE_EXPIRY_LEAD_DAYS, licenseExpiryNotifications } from '@shotledger/shared';

import { db } from '@/db/client';
import { archiveFirearm, restoreFirearm } from '@/db/queries/firearms';
import { latestLicense, listLicenses } from '@/db/queries/licenses';
import {
  cancelLicenseExpiryNotifications,
  scheduleLicenseExpiryNotifications,
} from '@/platform/notifications';

import { refreshMaintenanceTimeReminders } from './maintenance';

export async function archiveFirearmAndReminders(firearmId: string): Promise<void> {
  archiveFirearm(db, firearmId);
  // Every licence, not only the latest: a reminder scheduled for an older one
  // that was never cancelled would still fire.
  for (const license of listLicenses(db, firearmId)) {
    await cancelLicenseExpiryNotifications(license.id, LICENSE_EXPIRY_LEAD_DAYS);
  }
  await refreshMaintenanceTimeReminders({ request: false });
}

export async function restoreFirearmAndReminders(firearmId: string): Promise<void> {
  const firearm = restoreFirearm(db, firearmId);
  if (!firearm) return;
  await refreshMaintenanceTimeReminders({ request: false });
  const license = latestLicense(db, firearmId);
  if (!license) return;
  await scheduleLicenseExpiryNotifications(
    license.id,
    `${firearm.make} ${firearm.model}`,
    licenseExpiryNotifications(license.validUntil),
  );
}
