// Pure scheduling logic for local notifications (§4 M4). These functions
// decide WHAT to schedule and WHEN — the platform wrapper
// (app/src/platform/notifications.ts) is the only place that calls the
// expo-notifications API; this module has no RN/Expo imports so it is fully
// vitest-covered and testable without a device or emulator.
import { LICENSE_EXPIRY_LEAD_DAYS, MAINTENANCE_RED_THRESHOLD } from './constants';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  if (intervalRounds == null || intervalRounds <= 0) return false;
  const threshold = intervalRounds * MAINTENANCE_RED_THRESHOLD;
  return previousRoundsSinceMaintenance < threshold && nextRoundsSinceMaintenance >= threshold;
}

export interface LicenseExpiryNotification {
  leadDays: number;
  /** ISO-8601 instant the notification should fire. */
  fireAt: string;
}

/**
 * The set of license-expiry reminders (§4 M4: 90/30/7 days before
 * valid_until, VERIFY) that still lie in the future relative to `now` — a
 * license renewed or with a past lead time yields fewer/no entries. Returns
 * [] for `validUntil: null` (tills vidare — nothing to remind about).
 */
export function licenseExpiryNotifications(
  validUntil: string | null,
  now: Date = new Date(),
  leadDaysList: readonly number[] = LICENSE_EXPIRY_LEAD_DAYS,
): readonly LicenseExpiryNotification[] {
  if (validUntil === null) return [];
  const expiry = new Date(validUntil).getTime();
  const notifications: LicenseExpiryNotification[] = [];
  for (const leadDays of leadDaysList) {
    const fireAtMs = expiry - leadDays * DAY_MS;
    if (fireAtMs > now.getTime()) {
      notifications.push({ leadDays, fireAt: new Date(fireAtMs).toISOString() });
    }
  }
  return notifications;
}
