// "My starts" (integration spec §C): iterates future competitions from the
// cached listing (§A.11/§C.3 — no aggregate upstream endpoint), fetches
// patrols per competition, and keeps only the signup(s) matching the
// resolved shooting_card_number (§A.10's personal-data boundary — never
// fetches other shooters' full result rows here, only patrol/signup
// listing fields).
import { useCallback, useState } from 'react';
import { resolveIdentity } from '@shotledger/shared/src/integrations/webshooter/identity';
import { cardNumbersMatch } from '@shotledger/shared/src/integrations/webshooter/identity';
import {
  buildCalendarEvent,
  type CalendarEvent,
} from '@shotledger/shared/src/integrations/webshooter/calendar';
import type { Patrol, Signup } from '@shotledger/shared/src/integrations/webshooter/api/schemas';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { upsertCalendarEvent } from '@/platform/calendar';
import { getWebShooterClient } from './client';

export interface MyStart {
  competitionId: number;
  competitionName: string;
  signupId: number;
  patrolStart: string; // naive local, per the wire format
  patrolEnd: string;
  lane: number;
  city: string;
  patrolMates: { name: string; lane: number }[];
  event: CalendarEvent;
}

function calendarEventSettingKey(uid: string): string {
  return `webshooterCalendarEvent:${uid}`;
}

function isFutureCompetitionDate(date: string): boolean {
  return new Date(date).getTime() >= Date.now() - 24 * 60 * 60 * 1000; // include "today"
}

export function useWebShooterStarts() {
  const [starts, setStarts] = useState<MyStart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const client = getWebShooterClient();
      const cardNumber = await resolveIdentity({
        override: null,
        stored: getSetting<string | null>(db, 'webshooterCardNumber', null),
        fetchAuthenticatedUser: async () => {
          const user = await client.authenticateUser();
          return { shooting_card_number: user.shooting_card_number };
        },
      });

      const competitions = (await client.listCompetitions(options)).filter((c) =>
        isFutureCompetitionDate(c.date),
      );

      const results: MyStart[] = [];
      for (const competition of competitions) {
        const patrols: Patrol[] = await client.getPatrols(competition.id, options);
        for (const patrol of patrols) {
          const mine = patrol.signups.filter((s: Signup) =>
            cardNumbersMatch(s.user?.shooting_card_number ?? null, cardNumber),
          );
          for (const signup of mine) {
            const event = buildCalendarEvent({
              competitionId: competition.id,
              signupId: signup.id,
              competitionName: competition.name,
              city: competition.contact_city,
              weaponGroup: signup.weaponclass?.classname_general ?? '',
              patrolNumber: patrol.id,
              lane: signup.lane,
              startLocal: patrol.start_time,
              endLocal: patrol.end_time,
            });
            results.push({
              competitionId: competition.id,
              competitionName: competition.name,
              signupId: signup.id,
              patrolStart: patrol.start_time,
              patrolEnd: patrol.end_time,
              lane: signup.lane,
              city: competition.contact_city,
              patrolMates: patrol.signups
                .filter((s: Signup) => s.id !== signup.id && s.club?.id === signup.club?.id)
                .map((s: Signup) => ({ name: s.user?.fullname ?? '', lane: s.lane })),
              event,
            });
          }
        }
      }
      setStarts(results);
    } catch {
      setError('fetchFailed');
    } finally {
      setLoading(false);
    }
  }, []);

  const addToCalendar = useCallback(async (start: MyStart) => {
    if (!db) return;
    const key = calendarEventSettingKey(start.event.uid);
    const existingEventId = getSetting<string | null>(db, key, null);
    const eventId = await upsertCalendarEvent(start.event, existingEventId);
    setSetting<string>(db, key, eventId);
  }, []);

  return { starts, loading, error, load, addToCalendar };
}
