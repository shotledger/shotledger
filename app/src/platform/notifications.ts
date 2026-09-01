// Platform wrapper for local notifications (§0 rule 6, §4 M4). The pure
// decision logic — whether/when a notification is due — lives in
// shared/src/firearms/notification-schedule.ts and is unit-tested there;
// this module is the thin, best-effort layer that actually talks to
// expo-notifications (cross-platform, so no Android-only module involved).
// Every call is wrapped so a denied permission or an unsupported platform
// (e.g. the web preview) degrades to a silent no-op instead of a crash.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { LicenseExpiryNotification } from '@shotledger/shared';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/** Fires once, right away, when a firearm's rounds-since-maintenance crosses 100% (§4 M4). */
export async function notifyMaintenanceDue(firearmLabel: string): Promise<void> {
  if (!(await ensurePermission())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ShotLedger',
        body: `${firearmLabel}: maintenance interval reached`,
      },
      trigger: null, // fires immediately — the caller already confirmed the crossing
    });
  } catch {
    // best-effort: OS delivery failures are out of scope (§4 M4 "Done when").
  }
}

function licenseNotificationId(licenseId: string, leadDays: number): string {
  return `license-expiry-${licenseId}-${leadDays}`;
}

/** Schedules the 90/30/7-day (VERIFY) reminders for one license, replacing any previously scheduled ones. */
export async function scheduleLicenseExpiryNotifications(
  licenseId: string,
  firearmLabel: string,
  notifications: readonly LicenseExpiryNotification[],
): Promise<void> {
  await cancelLicenseExpiryNotifications(licenseId, notifications.map((n) => n.leadDays));
  if (!(await ensurePermission())) return;
  for (const { leadDays, fireAt } of notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: licenseNotificationId(licenseId, leadDays),
        content: {
          title: 'ShotLedger',
          body: `${firearmLabel}: license expires in ${leadDays} days`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
      });
    } catch {
      // best-effort — see notifyMaintenanceDue.
    }
  }
}

/** Cancels a license's scheduled reminders, e.g. before rescheduling after a renewal. */
export async function cancelLicenseExpiryNotifications(
  licenseId: string,
  leadDaysList: readonly number[],
): Promise<void> {
  for (const leadDays of leadDaysList) {
    try {
      await Notifications.cancelScheduledNotificationAsync(licenseNotificationId(licenseId, leadDays));
    } catch {
      // nothing scheduled under that id — fine.
    }
  }
}
