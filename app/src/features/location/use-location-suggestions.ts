// Suggestions for the new-session Location field.
//
// Two layers, in this order of trust:
//   1. Recents — distinct locations from this shooter's own sessions. Always
//      on, always offline, and the only layer the app needs to be useful.
//   2. Photon (OpenStreetMap) — opt-in in Settings, off by default, because
//      typing here would otherwise send keystrokes to a third party. Debounced
//      and cancellable; any failure is silent and simply leaves layer 1.
import { buildPhotonUrl, parsePhotonResponse, rankRecentLocations } from '@shotledger/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { db } from '@/db/client';
import { listLocationUsage } from '@/db/queries/sessions';

export const LOCATION_DEBOUNCE_MS = 350;
const MIN_ONLINE_QUERY_LENGTH = 3;
const MAX_PER_LAYER = 5;

export interface LocationSuggestions {
  /** Places this shooter has logged before. */
  recent: string[];
  /** OpenStreetMap hits; always `[]` when the lookup is off or unavailable. */
  online: string[];
}

export function useLocationSuggestions(query: string, onlineEnabled: boolean, language?: string) {
  // Read once per screen: the set cannot change while the form is open.
  const usage = useMemo(() => listLocationUsage(db), []);
  // Keyed by the query it answers, so a reply for text the user has already
  // moved on from is simply not rendered — no clearing setState in the effect.
  const [answer, setAnswer] = useState<{ query: string; results: string[] }>({
    query: '',
    results: [],
  });
  const requestId = useRef(0);

  const trimmed = query.trim();
  const recent = useMemo(
    () => rankRecentLocations(usage, trimmed, MAX_PER_LAYER),
    [usage, trimmed],
  );

  useEffect(() => {
    if (!onlineEnabled || trimmed.length < MIN_ONLINE_QUERY_LENGTH) return;

    const id = ++requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(buildPhotonUrl(trimmed, MAX_PER_LAYER, language), { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: unknown) => {
          // A slower earlier request must never overwrite a newer answer.
          if (id === requestId.current) {
            setAnswer({ query: trimmed, results: parsePhotonResponse(body, MAX_PER_LAYER) });
          }
        })
        .catch(() => {
          // Offline, blocked, rate-limited, malformed — the field still works
          // as plain text and the recents are still there. No error UI.
          if (id === requestId.current) setAnswer({ query: trimmed, results: [] });
        });
    }, LOCATION_DEBOUNCE_MS);

    return () => {
      requestId.current += 1;
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, onlineEnabled, language]);

  // Never offer online hits that duplicate a recent one.
  const online = useMemo(() => {
    if (!onlineEnabled || answer.query !== trimmed) return [];
    const seen = new Set(recent.map((value) => value.toLocaleLowerCase()));
    return answer.results.filter((value) => !seen.has(value.toLocaleLowerCase()));
  }, [recent, answer, onlineEnabled, trimmed]);

  return { recent, online } satisfies LocationSuggestions;
}
