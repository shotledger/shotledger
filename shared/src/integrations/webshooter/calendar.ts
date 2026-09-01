// Pure calendar-event builder (spec §7, v2 spec §C.2). No expo-calendar call
// here — that's app-layer wiring, later.
import { localToUtcIso } from './mapping';

export interface CalendarEventInput {
  competitionId: number | string;
  signupId: number | string;
  competitionName: string;
  city: string;
  weaponGroup: string;
  patrolNumber: number;
  lane: number;
  /** 'YYYY-MM-DD HH:mm:ss', Stockholm-naive — same format as the API. */
  startLocal: string;
  endLocal: string;
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
}

function localDatePart(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

export function buildCalendarEvent(input: CalendarEventInput): CalendarEvent {
  const informationUrl = `https://webshooter.se/app/competitions/${input.competitionId}/information`;
  const descriptionLines = [
    input.competitionName,
    localDatePart(input.startLocal),
    ...(input.venue !== undefined ? [input.venue] : []),
    `Vapengrupp: ${input.weaponGroup}`,
    `Skjutlag: ${input.patrolNumber}`,
    `Bana: ${input.lane}`,
    informationUrl,
  ];

  return {
    uid: `webshooter_${input.competitionId}-${input.signupId}`,
    summary: input.competitionName,
    location: input.city,
    description: descriptionLines.join('\n'),
    startUtc: localToUtcIso(input.startLocal),
    endUtc: localToUtcIso(input.endLocal),
  };
}
