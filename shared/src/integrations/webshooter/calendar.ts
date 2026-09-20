// Pure calendar-event builder (spec §7, v2 spec §C.2). No expo-calendar call
// here — that's app-layer wiring, later.
import { localToUtcIso } from './mapping';

export interface CalendarEventInput {
  competitionId: number | string;
  signupId: number | string;
  competitionName: string;
  city: string;
  weaponGroup: string;
  /** Null while the shooter has not been put in a patrol yet. */
  patrolNumber: number | null;
  lane: number;
  /**
   * 'YYYY-MM-DD HH:mm:ss', Stockholm-naive — same format as the API. Null
   * until the organizer publishes patrol times, which is the normal state
   * of a signup for weeks after entering.
   */
  startLocal: string | null;
  endLocal: string | null;
  /** 'YYYY-MM-DD'. Used as the all-day date while times are unknown. */
  competitionDate: string;
  /**
   * Free-text venue line, folded into the description when supplied
   * (spec §7 VERIFY — the v2 spec's §C.2 bullet mentions "venue" separately
   * from `location`/city; this field lets a caller add it without this
   * module guessing which upstream field it maps to).
   */
  venue?: string;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  startUtc: string;
  endUtc: string;
  /**
   * The LOCAL date this belongs to, `YYYY-MM-DD`.
   *
   * All-day entries must be built from this, never from `startUtc`: local
   * midnight in Stockholm is 22:00Z the previous day, so an all-day event
   * derived from the UTC instant lands a day early. The classic off-by-one.
   */
  dateLocal: string;
  /**
   * True while start times are unpublished: the entry is an all-day marker
   * on the competition date rather than a claim about when you shoot.
   */
  allDay: boolean;
  /**
   * All-day markers are FREE — a competition you have entered should not
   * block the whole day in other people's eyes. A published patrol time is
   * BUSY, because then it really is.
   */
  busy: boolean;
}

function localDatePart(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

export function buildCalendarEvent(input: CalendarEventInput): CalendarEvent {
  const informationUrl = `https://webshooter.se/app/competitions/${input.competitionId}/information`;
  const scheduled = input.startLocal !== null && input.endLocal !== null;
  const date = scheduled ? localDatePart(input.startLocal!) : input.competitionDate.slice(0, 10);

  const descriptionLines = [
    input.competitionName,
    date,
    ...(input.venue !== undefined ? [input.venue] : []),
    `Vapengrupp: ${input.weaponGroup}`,
    // A patrol number we do not have yet is said plainly rather than
    // printed as "Skjutlag: null".
    input.patrolNumber === null ? 'Skjutlag: ej lottad' : `Skjutlag: ${input.patrolNumber}`,
    `Bana: ${input.lane}`,
    informationUrl,
  ];

  return {
    uid: `webshooter_${input.competitionId}-${input.signupId}`,
    summary: input.competitionName,
    location: input.city,
    description: descriptionLines.join('\n'),
    // An all-day entry still needs a range: midnight to midnight on the
    // competition date, which is what every calendar expects for allDay.
    dateLocal: date,
    startUtc: scheduled ? localToUtcIso(input.startLocal!) : localToUtcIso(`${date} 00:00:00`),
    endUtc: scheduled ? localToUtcIso(input.endLocal!) : localToUtcIso(`${date} 23:59:00`),
    allDay: !scheduled,
    busy: scheduled,
  };
}
