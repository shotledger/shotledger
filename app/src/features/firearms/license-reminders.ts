// License expiry reminders (#847) follow the data: rebuilt as one set from the
// latest license of each active firearm, so a license that arrived by import,
// restore, demo data or sync gets them, and a renewed, deleted or archived one
// leaves none behind. The dates are shared/src/firearms/notification-schedule.ts.
import { licenseExpiryNotifications } from '@shotledger/shared';

import { db } from '@/db/client';
import { listActiveFirearms } from '@/db/queries/firearms';
import { latestLicense } from '@/db/queries/licenses';
import type { Database } from '@/db/types';
import {
  replaceLicenseExpiryReminders,
  type LicenseExpiryReminder,
} from '@/platform/notifications';

/** Every future reminder for the latest license of each active firearm. */
export function licenseExpiryReminders(database: Database, now: Date): LicenseExpiryReminder[] {
  return listActiveFirearms(database).flatMap((firearm) => {
    const license = latestLicense(database, firearm.id);
    if (!license) return [];
    const firearmLabel = `${firearm.make} ${firearm.model}`;
    return licenseExpiryNotifications(license.validUntil, now).map((notification) => ({
      licenseId: license.id,
      firearmLabel,
      notification,
    }));
  });
}

export async function refreshLicenseExpiryReminders({
  request,
}: {
  request: boolean;
}): Promise<void> {
  if (!db) return;
  await replaceLicenseExpiryReminders(licenseExpiryReminders(db, new Date()), { request });
}
