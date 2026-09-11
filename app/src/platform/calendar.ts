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

export interface WritableCalendar {
  id: string;
  title: string;
  /** The account it belongs to — what tells a work calendar from a personal one. */
  account: string;
  allowsAllDay: boolean;
}

/** Every calendar this device will let us write to, for the Settings picker. */
export async function listWritableCalendars(): Promise<WritableCalendar[]> {
  await ensurePermission();
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars
    .filter((c) => c.allowsModifications)
    .map((c) => ({
      id: c.id,
      title: c.title,
      account: c.source?.name ?? c.ownerAccount ?? '',
      allowsAllDay: c.allowedAvailabilities?.includes(Calendar.Availability.FREE) ?? true,
    }));
}

async function getWritableCalendarId(preferredId: string | null): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  // The shooter's choice wins, but only while it still exists and is still
  // writable — a calendar can be removed or turned read-only from under us.
  const preferred = preferredId
    ? calendars.find((c) => c.id === preferredId && c.allowsModifications)
    : undefined;
  if (preferred) return preferred.id;
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
export interface UpsertResult {
  eventId: string;
  /** Which calendar it landed in, so the app can say rather than guess. */
  calendarTitle: string;
}

/** Local midnight on a `YYYY-MM-DD`, which is what an all-day event wants. */
function localMidnight(dateLocal: string, endOfDay = false): Date {
  const [year, month, day] = dateLocal.split('-').map(Number);
  return new Date(year!, month! - 1, day! + (endOfDay ? 1 : 0));
}

export async function upsertCalendarEvent(
  event: CalendarEvent,
  existingEventId: string | null,
  preferredCalendarId: string | null = null,
): Promise<UpsertResult> {
  await ensurePermission();
  const calendarId = await getWritableCalendarId(preferredCalendarId);
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarTitle = calendars.find((c) => c.id === calendarId)?.title ?? '';

  const details = {
    title: event.summary,
    location: event.location,
    notes: event.description,
    // All-day entries are built from the LOCAL date: deriving them from the
    // UTC instant puts them a day early anywhere east of Greenwich.
    startDate: event.allDay ? localMidnight(event.dateLocal) : new Date(event.startUtc),
    endDate: event.allDay ? localMidnight(event.dateLocal, true) : new Date(event.endUtc),
    allDay: event.allDay,
    // A competition you have entered but have no time for should not block
    // the day in other people's eyes; a published patrol time should.
    availability: event.busy ? Calendar.Availability.BUSY : Calendar.Availability.FREE,
    timeZone: 'Europe/Stockholm',
  };

  if (existingEventId) {
    try {
      await Calendar.updateEventAsync(existingEventId, details);
      return { eventId: existingEventId, calendarTitle };
    } catch {
      // The previously-created event was removed outside the app (user
      // deleted it in their calendar app) — fall through to re-create.
    }
  }

  return { eventId: await Calendar.createEventAsync(calendarId, details), calendarTitle };
}
