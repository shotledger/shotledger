// Pure scheduling logic for local notifications (§4 M4). These functions
// decide WHAT to schedule and WHEN — the platform wrapper
// (app/src/platform/notifications.ts) is the only place that calls the
// expo-notifications API; this module has no RN/Expo imports so it is fully
// vitest-covered and testable without a device or emulator.
import { LICENSE_EXPIRY_LEAD_DAYS, LICENSE_EXPIRY_REMINDER_HOUR } from './constants';
import { parseLocalDay } from '../dates';
import { maintenanceStatus } from './maintenance-status';

/**
 * Whether logging a new round count should trigger the "maintenance due"
 * notification: fires exactly once, on the transition across the 100%
 * threshold (never re-fires while already over, never fires on the way
 * down after a maintenance reset).
 */
export function shouldNotifyMaintenanceDue(
  previousRoundsSinceMaintenance: number,
  nextRoundsSinceMaintenance: number,
  intervalRounds: number | null | undefined,
): boolean {
  return (
    maintenanceStatus(previousRoundsSinceMaintenance, intervalRounds) !== 'red' &&
    maintenanceStatus(nextRoundsSinceMaintenance, intervalRounds) === 'red'
  );
}

export interface LicenseExpiryNotification {
  leadDays: number;
  /** ISO-8601 instant the notification should fire. */
  fireAt: string;
}

/**
 * The set of license-expiry reminders (§4 M4: 90/30/7 days before
 * valid_until, VERIFY) that still lie in the future relative to `now` — a
 * license renewed or with a past lead time yields fewer/no entries. Each
 * fires at 09:00 local time, `leadDays` calendar days before valid_until.
 * Returns [] for `validUntil: null` (tills vidare — nothing to remind about)
 * and for a value that is not a `YYYY-MM-DD` date.
 */
export function licenseExpiryNotifications(
  validUntil: string | null,
  now: Date = new Date(),
  leadDaysList: readonly number[] = LICENSE_EXPIRY_LEAD_DAYS,
): readonly LicenseExpiryNotification[] {
  if (validUntil === null) return [];
  const lastDay = parseLocalDay(validUntil);
  if (lastDay === null) return [];
  const notifications: LicenseExpiryNotification[] = [];
  for (const leadDays of leadDaysList) {
    // The Date constructor rolls a day below 1 into the previous month, and
    // sets the wall-clock hour whatever the DST offset that day.
    const fireAt = new Date(
      lastDay.year,
      lastDay.month - 1,
      lastDay.day - leadDays,
      LICENSE_EXPIRY_REMINDER_HOUR,
    );
    if (fireAt.getTime() > now.getTime()) {
      notifications.push({ leadDays, fireAt: fireAt.toISOString() });
    }
  }
  return notifications;
}
