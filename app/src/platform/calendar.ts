// Platform wrapper for expo-calendar (§0 rule 6, integration spec §C.2).
// expo-calendar has no cross-platform "find event by our own UID" query —
// Android's Events table has no writable UID column the SDK exposes, and
// iOS's `calendarItemExternalIdentifier` is read-only (assigned by the
// system, not settable at creation). Documented limitation, not silently
// worked around: dedup is done locally instead, by remembering the native
// event id we created for each WebShooter UID (settings table, keyed
// `webshooterCalendarEvent:<uid>`) and re-using/updating that id on a
// second "Add to calendar" tap for the same start — this only dedups
// within ShotLedger's own writes, not against wscli's or WebShooter's own
// calendar exports using the same UID scheme, despite spec §C.2's intent
// ("a user who also uses wscli never gets a duplicate event") — that part
// of the dedup guarantee cannot be delivered through expo-calendar's API.
// SDK 57 makes expo-calendar's default import a new, differently-shaped
// "next" API (top-level getCalendars, no *Async suffix) — importing the
// stable, documented Async API explicitly from the `/legacy` subpath.
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import type { CalendarEvent } from '@shotledger/shared/src/integrations/webshooter/calendar';

export class CalendarPermissionDeniedError extends Error {
  constructor() {
    super('Calendar permission denied');
    this.name = 'CalendarPermissionDeniedError';
  }
}

async function ensurePermission(): Promise<void> {
  if (Platform.OS === 'web') throw new CalendarPermissionDeniedError();
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted) return;
  const requested = await Calendar.requestCalendarPermissionsAsync();
  if (!requested.granted) throw new CalendarPermissionDeniedError();
}

async function getWritableCalendarId(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((c) => c.allowsModifications);
  if (writable) return writable.id;

  // No writable calendar exists yet (fresh device/simulator) — create a
  // dedicated ShotLedger one rather than failing.
  const defaultSource =
    Platform.OS === 'ios'
      ? await Calendar.getDefaultCalendarAsync().then((c) => c.source)
      : { isLocalAccount: true, name: 'ShotLedger', type: Calendar.SourceType?.LOCAL ?? 'LOCAL' };
  return Calendar.createCalendarAsync({
    title: 'ShotLedger',
    color: '#7C4DFF',
    entityType: Calendar.EntityTypes.EVENT,
    source: defaultSource,
    sourceId: Platform.OS === 'ios' ? (defaultSource as { id?: string }).id : undefined,
    name: 'ShotLedger',
    ownerAccount: 'ShotLedger',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

/**
 * Creates or updates the device calendar event for one WebShooter start
 * (§C.2). `existingEventId`, when passed, is the id ShotLedger previously
 * created for this UID (see the module comment above) — re-tapping "Add to
 * calendar" updates that event instead of creating a duplicate.
 */
export async function upsertCalendarEvent(
  event: CalendarEvent,
  existingEventId: string | null,
): Promise<string> {
  await ensurePermission();
  const calendarId = await getWritableCalendarId();

  const details = {
    title: event.summary,
    location: event.location,
    notes: event.description,
    startDate: new Date(event.startUtc),
    endDate: new Date(event.endUtc),
    timeZone: 'Europe/Stockholm',
  };

  if (existingEventId) {
    try {
      await Calendar.updateEventAsync(existingEventId, details);
      return existingEventId;
    } catch {
      // The previously-created event was removed outside the app (user
      // deleted it in their calendar app) — fall through to re-create.
    }
  }

  return Calendar.createEventAsync(calendarId, details);
}
