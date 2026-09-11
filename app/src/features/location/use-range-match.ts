// "Use my location" for the session Location field.
//
// Never runs on its own: no fix is taken, and no coordinates leave the device,
// until the shooter taps the button. That is the whole privacy design — the
// field works as plain text, the recents work offline, and this is a shortcut
// on top of both.
import {
  buildRangeQuery,
  matchRanges,
  OVERPASS_ENDPOINT,
  parseOverpassRanges,
  rankRecentLocations,
  SEARCH_RADIUS_METERS,
  type RangeMatch,
} from '@shotledger/shared';
import { useCallback, useRef, useState } from 'react';

import { db } from '@/db/client';
import { listLocationUsage } from '@/db/queries/sessions';
import { getCurrentFix } from '@/platform/geolocation';

/** What the field should show. Every failure is a state, not an exception. */
export type RangeMatchState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'matched'; matches: RangeMatch[] }
  /** A fix was taken and OSM knows of no range near it. */
  | { status: 'none' }
  | { status: 'denied' }
  /** No fix, or the lookup failed — offline, blocked, rate-limited. */
  | { status: 'failed' };

const MAX_MATCHES = 5;
/** Overpass asks for a descriptive agent; it rate-limits anonymous floods. */
const USER_AGENT = 'ShotLedger (github.com/jimisola/shotledger)';

export function useRangeMatch() {
  const [state, setState] = useState<RangeMatchState>({ status: 'idle' });
  // A second tap while the first is in flight must not race it.
  const requestId = useRef(0);

  const reset = useCallback(() => {
    requestId.current += 1;
    setState({ status: 'idle' });
  }, []);

  const findRanges = useCallback(async () => {
    const id = ++requestId.current;
    setState({ status: 'locating' });

    const result = await getCurrentFix();
    if (id !== requestId.current) return;
    if (result.status !== 'ok') {
      setState({ status: result.status === 'denied' ? 'denied' : 'failed' });
      return;
    }

    const { fix } = result;
    try {
      const response = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT },
        body: buildRangeQuery(fix.latitude, fix.longitude, SEARCH_RADIUS_METERS),
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);

      const ranges = parseOverpassRanges(await response.json());
      if (id !== requestId.current) return;

      // The shooter's own spellings win over OSM's; see matchRanges.
      const known = db
        ? rankRecentLocations(listLocationUsage(db), '', Number.MAX_SAFE_INTEGER)
        : [];
      const matches = matchRanges(fix, ranges, known).slice(0, MAX_MATCHES);
      setState(matches.length > 0 ? { status: 'matched', matches } : { status: 'none' });
    } catch {
      if (id === requestId.current) setState({ status: 'failed' });
    }
  }, []);

  return { state, findRanges, reset };
}
