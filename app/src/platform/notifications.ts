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

import i18n from '@/i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** With `request: false` only an already granted permission counts: nothing prompts. */
async function ensurePermission(request = true): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!request) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

// Android files every notification under a channel the user can mute on its
// own; without one, expo-notifications posts on its unnamed fallback channel.
const MAINTENANCE_CHANNEL = 'maintenance';
const LICENSE_EXPIRY_CHANNEL = 'license-expiry';

/** Creates the channel, or renames it into the current language. */
async function ensureChannel(id: string, nameKey: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(id, {
    name: i18n.t(nameKey),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Fires once, right away, when a firearm's rounds-since-maintenance crosses 100% (§4 M4). */
export async function notifyMaintenanceDue(firearmLabel: string): Promise<void> {
  if (!(await ensurePermission())) return;
  try {
    await ensureChannel(MAINTENANCE_CHANNEL, 'notifications.channelMaintenance');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: firearmLabel,
        body: i18n.t('notifications.maintenanceDueBody'),
      },
      // No date: fires immediately — the caller already confirmed the crossing.
      trigger: { channelId: MAINTENANCE_CHANNEL },
    });
  } catch {
    // best-effort: OS delivery failures are out of scope (§4 M4 "Done when").
  }
}

const MAINTENANCE_TIME_PREFIX = 'maintenance-time-';

export interface MaintenanceTimeReminder {
  firearmId: string;
  firearmLabel: string;
  /** ISO-8601 instant the reminder fires. */
  fireAt: string;
}

/**
 * Replaces every scheduled time-based "maintenance due" reminder (#800) with
 * `reminders`, so a changed interval, a logged maintenance or a deleted
 * firearm never leaves a stale one behind. `request: false` (the app-start
 * refresh) never prompts for permission; saving an interval does.
 */
export async function replaceMaintenanceTimeReminders(
  reminders: readonly MaintenanceTimeReminder[],
  { request }: { request: boolean },
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const { identifier } of scheduled) {
      if (identifier.startsWith(MAINTENANCE_TIME_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      }
    }
  } catch {
    // best-effort — see notifyMaintenanceDue.
  }
  if (reminders.length === 0 || !(await ensurePermission(request))) return;
  try {
    await ensureChannel(MAINTENANCE_CHANNEL, 'notifications.channelMaintenance');
  } catch {
    // best-effort — see notifyMaintenanceDue.
  }
  for (const { firearmId, firearmLabel, fireAt } of reminders) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${MAINTENANCE_TIME_PREFIX}${firearmId}`,
        content: {
          title: firearmLabel,
          body: i18n.t('notifications.maintenanceDueBody'),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
          channelId: MAINTENANCE_CHANNEL,
        },
      });
    } catch {
      // best-effort — see notifyMaintenanceDue.
    }
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
  await cancelLicenseExpiryNotifications(
    licenseId,
    notifications.map((n) => n.leadDays),
  );
  if (!(await ensurePermission())) return;
  try {
    await ensureChannel(LICENSE_EXPIRY_CHANNEL, 'notifications.channelLicenseExpiry');
  } catch {
    // best-effort — see notifyMaintenanceDue.
  }
  for (const { leadDays, fireAt } of notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: licenseNotificationId(licenseId, leadDays),
        content: {
          title: firearmLabel,
          body: i18n.t('notifications.licenseExpiresBody', { count: leadDays }),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
          channelId: LICENSE_EXPIRY_CHANNEL,
        },
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
      await Notifications.cancelScheduledNotificationAsync(
        licenseNotificationId(licenseId, leadDays),
      );
    } catch {
      // nothing scheduled under that id — fine.
    }
  }
}
