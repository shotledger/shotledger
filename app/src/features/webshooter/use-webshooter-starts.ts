// "My starts" (integration spec §C): every upcoming competition the
// shooter has entered — not only the ones they have been drawn into a
// patrol for (maintainer, 2026-09-11). A signup with no patrol yet is the
// normal state for weeks after entering, and it is exactly the thing you
// want in your diary early.
//
// Webshooter has no aggregate "my competitions" endpoint, so this walks
// upcoming competitions and asks for their signups. Patrols are fetched
// ONLY for competitions the shooter is actually in, which is strictly
// fewer requests than the previous patrols-for-everything pass.
import {
  buildCalendarEvent,
  type CalendarEvent,
} from '@shotledger/shared/src/integrations/webshooter/calendar';
import { isUpcomingCompetition } from '@shotledger/shared/src/integrations/webshooter/competition-dates';
import {
  cardNumbersMatch,
  resolveIdentity,
} from '@shotledger/shared/src/integrations/webshooter/identity';
import type { Patrol, Signup } from '@shotledger/shared/src/integrations/webshooter/api/schemas';
import { useCallback, useState } from 'react';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { upsertCalendarEvent } from '@/platform/calendar';

import { getWebshooterClient, loadTokenCache } from './client';

/** Which calendar the shooter chose in Settings; null means "first writable". */
export const CALENDAR_ID_SETTING_KEY = 'webshooterCalendarId';

export interface SquadMember {
  name: string;
  lane: number;
  weaponClass: string;
  /** Club name, shown in full — "same club" alone loses who the others are. */
  club: string;
  /** True for the shooter's own row, so the list can mark it. */
  isMe: boolean;
  sameClub: boolean;
}

export interface ClubStart {
  name: string;
  /** 'start|end' in wire format, or null while their patrol is undrawn. */
  window: string | null;
  /** Derived the same way as the shooter's own — see the numbering below. */
  patrolNumber: number | null;
  lane: number;
  weaponClass: string;
  club: string;
}

export interface MyStart {
  competitionId: number;
  competitionName: string;
  competitionDate: string;
  signupId: number;
  /** Naive local, per the wire format. Null until the patrol is drawn. */
  patrolStart: string | null;
  patrolEnd: string | null;
  patrolNumber: number | null;
  lane: number;
  city: string;
  /** e.g. "C" — which gun this signup is for. Blank when the site omits it. */
  weaponClass: string;
  /** Everyone in the shooter's patrol, themselves included. */
  squad: SquadMember[];
  /** Club mates shooting the same competition, in any patrol. */
  clubStarts: ClubStart[];
  event: CalendarEvent;
  /**
   * The calendar entry exists but could not be brought up to date — the
   * patrol moved and the rewrite failed. Shown rather than silently wrong.
   */
  calendarStale: boolean;
}

interface StoredCalendarEntry {
  eventId: string;
  /** What the event was written from, so a change is detectable. */
  signature: string;
}

function calendarEventSettingKey(uid: string): string {
  return `webshooterCalendarEvent:${uid}`;
}

/**
 * Everything a calendar entry depends on; a change here means it must be
 * rewritten. The target calendar is part of that: picking a different
 * calendar changes nothing about the event's CONTENT, so without this the
 * update-on-open pass sees no change and an entry added before the choice
 * stays where it was, in a calendar the shooter may not even display.
 */
function calendarSignature(event: CalendarEvent, calendarId: string | null): string {
  return [
    event.startUtc,
    event.endUtc,
    String(event.allDay),
    event.summary,
    event.description,
    calendarId ?? '',
  ].join('|');
}

function readStoredEntry(uid: string): StoredCalendarEntry | null {
  if (!db) return null;
  const raw = getSetting<string | null>(db, calendarEventSettingKey(uid), null);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'eventId' in parsed) {
      return parsed as StoredCalendarEntry;
    }
  } catch {
    // Written by an earlier build as a bare event id, not JSON. Still a
    // usable id; an empty signature just forces one rewrite.
    return { eventId: raw, signature: '' };
  }
  return { eventId: raw, signature: '' };
}

function writeStoredEntry(uid: string, entry: StoredCalendarEntry): void {
  if (!db) return;
  setSetting<string>(db, calendarEventSettingKey(uid), JSON.stringify(entry));
}

export function useWebshooterStarts() {
  const [starts, setStarts] = useState<MyStart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  /** Competitions whose data could not be read, so the count is visible. */
  const [skipped, setSkipped] = useState(0);

  const load = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    if (!db) return;
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    setSkipped(0);
    try {
      // The token cache is a module variable that only the connection hook
      // fills. Reaching this screen without having mounted that hook sent
      // every request out with no Authorization header.
      await loadTokenCache();
      const client = getWebshooterClient();
      const cardNumber = await resolveIdentity({
        override: null,
        stored: getSetting<string | null>(db, 'webshooterCardNumber', null),
        fetchAuthenticatedUser: async () => {
          const user = await client.authenticateUser();
          return { shooting_card_number: user.shooting_card_number };
        },
      });
      const preferredCalendarId = getSetting<string | null>(db, CALENDAR_ID_SETTING_KEY, null);

      const competitions = (await client.listCompetitions(options)).filter((c) =>
        isUpcomingCompetition(c.date),
      );

      const results: MyStart[] = [];
      let unreadable = 0;
      for (const competition of competitions) {
        // One competition must not cost the shooter every other start.
        // This walks dozens of them, and a single response we cannot parse
        // — a field Webshooter sends differently for one event — used to
        // throw the whole load away and show an empty screen.
        let signups: Signup[];
        let patrols: Patrol[];
        try {
          // BOTH listings, because neither alone is complete. /signups
          // misses entries that only appear once drawn — matching on it
          // alone found nothing at all for a shooter with two real starts
          // (2026-09-11). Patrols carry their own embedded signups and are
          // what the working version used, but they cannot show an entry
          // with no patrol yet, which is the whole point of this screen.
          [patrols, signups] = await Promise.all([
            client.getPatrols(competition.id, options),
            client.getSignups(competition.id, options),
          ]);
        } catch (err) {
          console.error('[webshooter] skipping competition', competition.id, err);
          unreadable += 1;
          continue;
        }

        // The skjutlag number is NOT in the API. A patrol carries only
        // id/competitions_id/start_time/end_time/patrol_size/signups, and
        // `id` is a global key — 8407 for a competition's first patrol —
        // so printing it as the skjutlag number is simply wrong, which is
        // what the calendar description had been doing. It is derived here
        // from the running order instead: patrols in time order, numbered
        // from one, which is the order they are shot in.
        const patrolNumbers = new Map<number, number>();
        [...patrols]
          .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.id - b.id)
          .forEach((p, index) => patrolNumbers.set(p.id, index + 1));

        // Deduplicated by signup id: a drawn entry appears in both.
        const bySignupId = new Map<number, Signup>();
        for (const signup of [...patrols.flatMap((p) => p.signups), ...signups]) {
          if (!bySignupId.has(signup.id)) bySignupId.set(signup.id, signup);
        }
        const mine = [...bySignupId.values()].filter((s) =>
          cardNumbersMatch(s.user?.shooting_card_number ?? null, cardNumber),
        );
        if (mine.length === 0) continue;

        for (const signup of mine) {
          const patrol = patrols.find((p) => p.signups.some((s) => s.id === signup.id)) ?? null;
          const scheduled =
            patrol !== null && patrol.start_time !== null && patrol.end_time !== null;

          const event = buildCalendarEvent({
            competitionId: competition.id,
            signupId: signup.id,
            competitionName: competition.name,
            city: competition.contact_city,
            weaponGroup: signup.weaponclass?.classname_general ?? '',
            patrolNumber: patrol === null ? null : (patrolNumbers.get(patrol.id) ?? null),
            lane: signup.lane,
            startLocal: scheduled ? patrol.start_time : null,
            endLocal: scheduled ? patrol.end_time : null,
            competitionDate: competition.date,
          });

          // Update on open: an entry already in the calendar is rewritten
          // whenever what it should say has changed, so a moved patrol
          // corrects itself the next time this screen is looked at. Only
          // touches entries the shooter added — it never creates one.
          const stored = readStoredEntry(event.uid);
          let calendarStale = false;
          if (
            stored !== null &&
            stored.signature !== calendarSignature(event, preferredCalendarId)
          ) {
            try {
              const upserted = await upsertCalendarEvent(
                event,
                stored.eventId,
                preferredCalendarId,
              );
              writeStoredEntry(event.uid, {
                eventId: upserted.eventId,
                signature: calendarSignature(event, preferredCalendarId),
              });
            } catch (err) {
              // Permission revoked, calendar deleted — the entry is now
              // provably out of date and the shooter has to be told.
              console.error('[webshooter] calendar auto-update failed', err);
              calendarStale = true;
            }
          }

          results.push({
            competitionId: competition.id,
            competitionName: competition.name,
            competitionDate: competition.date,
            signupId: signup.id,
            patrolStart: scheduled ? patrol.start_time : null,
            patrolEnd: scheduled ? patrol.end_time : null,
            patrolNumber: patrol === null ? null : (patrolNumbers.get(patrol.id) ?? null),
            lane: signup.lane,
            city: competition.contact_city,
            // `classname` is the specific class (C, R, A…); classname_general
            // is the group it rolls up to. The shooter cares which gun.
            weaponClass: signup.weaponclass?.classname ?? '',
            squad: (patrol?.signups ?? []).map((s) => ({
              name: s.user?.fullname ?? '',
              lane: s.lane,
              weaponClass: s.weaponclass?.classname ?? '',
              club: s.club?.name ?? '',
              isMe: s.id === signup.id,
              // Only a real match counts: two signups with no club at all
              // are not club mates, and `undefined === undefined` said they
              // were.
              sameClub: s.club?.id !== undefined && s.club.id === signup.club?.id,
            })),
            // Built from the MERGED set, not from /signups: that listing
            // does not contain this shooter, and filtering it against their
            // own club found nobody even with three club mates in the squad.
            clubStarts: [...bySignupId.values()]
              .filter(
                (s) =>
                  s.id !== signup.id && s.club?.id !== undefined && s.club.id === signup.club?.id,
              )
              .map((s) => {
                const theirPatrol = patrols.find((p) => p.signups.some((x) => x.id === s.id));
                const theirWindow =
                  theirPatrol !== undefined &&
                  theirPatrol.start_time !== null &&
                  theirPatrol.end_time !== null
                    ? `${theirPatrol.start_time}|${theirPatrol.end_time}`
                    : null;
                return {
                  name: s.user?.fullname ?? '',
                  window: theirWindow,
                  patrolNumber:
                    theirPatrol === undefined ? null : (patrolNumbers.get(theirPatrol.id) ?? null),
                  lane: s.lane,
                  weaponClass: s.weaponclass?.classname ?? '',
                  club: s.club?.name ?? '',
                };
              }),
            event,
            calendarStale,
          });
        }
      }
      // One summary line instead of guesswork: how many competitions were
      // considered, how many carried one of my signups, how many could not
      // be read at all.
      console.log(
        `[webshooter] starts: ${competitions.length} upcoming, ${results.length} mine, ${unreadable} unreadable, card=${cardNumber ?? 'unresolved'}`,
      );
      setStarts(results);
      setSkipped(unreadable);
    } catch (err) {
      // Not swallowed: "couldn't reach Webshooter" is what every failure
      // here looked like, including ones that reached it perfectly well and
      // failed to parse the answer.
      console.error('[webshooter] starts failed', err);
      setError('fetchFailed');
      setErrorDetail(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  /** Returns the calendar it landed in, so the confirmation can name it. */
  const addToCalendar = useCallback(async (start: MyStart): Promise<string> => {
    if (!db) return '';
    const stored = readStoredEntry(start.event.uid);
    const calendarId = getSetting<string | null>(db, CALENDAR_ID_SETTING_KEY, null);
    const upserted = await upsertCalendarEvent(start.event, stored?.eventId ?? null, calendarId);
    writeStoredEntry(start.event.uid, {
      eventId: upserted.eventId,
      signature: calendarSignature(start.event, calendarId),
    });
    return upserted.calendarTitle;
  }, []);

  return { starts, loading, error, errorDetail, skipped, load, addToCalendar };
}
