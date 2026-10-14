// Every scheduled reminder rebuilt from the database without prompting for
// permission: at app start and on the foreground (maintenance-reminders.tsx),
// and after data arrives in bulk (a JSON import, demo data), #847.
import { refreshLicenseExpiryReminders } from './license-reminders';
import { refreshMaintenanceTimeReminders } from './maintenance';

export async function refreshReminders(): Promise<void> {
  await refreshMaintenanceTimeReminders({ request: false });
  await refreshLicenseExpiryReminders({ request: false });
}
