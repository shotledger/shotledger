// Narrowing the import list to competitions the shooter actually has a
// result in (maintainer, 2026-09-11: "could eg have been sign-up but then
// no show or dnf").
//
// WebShooter has no "my competitions" endpoint, and wscli's own commands
// solve it the same brute-force way: fetch /results per competition and
// look for your card number. That is one request per competition, so this
// hook is built to be POLITE rather than eager —
//
//   - it scans one year at a time, never the whole history;
//   - it goes sequentially, so it never opens a burst of connections;
//   - it leans on the client's own TTL cache, so a second visit is free;
//   - it stops the moment the screen goes away.
//
// The alternative — scanning everything on mount — would mean hundreds of
// requests to someone else's server every time the screen opened.
import { hasResultForCard } from '@shotledger/shared/src/integrations/webshooter/my-results';
import { useCallback, useEffect, useRef, useState } from 'react';

import { db } from '@/db/client';
import { getSetting } from '@/db/queries/settings';

import { getWebShooterClient, loadTokenCache } from './client';

/** Generic over the competition shape so callers keep whatever they enriched it with. */
export interface MyCompetitionsScan<T> {
  /** Competitions from `candidates` where the shooter has a result. */
  mine: T[];
  /** How many of `candidates` have been checked so far. */
  checked: number;
  total: number;
  scanning: boolean;
  error: string | null;
  errorDetail: string | null;
  rescan: () => void;
}

export function useWebShooterMyCompetitions<T extends { id: number }>(
  candidates: T[],
): MyCompetitionsScan<T> {
  const [mine, setMine] = useState<T[]>([]);
  const [checked, setChecked] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Bumped on unmount and on every new scan, so an in-flight sequential
  // walk can see that its results are no longer wanted and stop.
  const runId = useRef(0);

  const rescan = useCallback(() => setAttempt((n) => n + 1), []);

  const key = candidates.map((c) => c.id).join(',');

  useEffect(() => {
    // Nothing to scan: the empty result is derived at the bottom rather
    // than written here — a synchronous setState in an effect body is what
    // the React Compiler rule forbids, and it would cascade a render.
    if (!db || candidates.length === 0) return;

    runId.current += 1;
    const thisRun = runId.current;
    let cancelled = false;

    async function scan() {
      setScanning(true);
      setError(null);
      setErrorDetail(null);
      setMine([]);
      setChecked(0);
      try {
        await loadTokenCache();
        const cardNumber = getSetting<string | null>(db!, 'webshooterCardNumber', null);
        const client = getWebShooterClient();

        for (const competition of candidates) {
          if (cancelled || runId.current !== thisRun) return;
          try {
            const results = await client.getResults(competition.id);
            if (cancelled || runId.current !== thisRun) return;
            if (hasResultForCard(results, cardNumber)) {
              setMine((previous) => [...previous, competition]);
            }
          } catch (err) {
            // One unreadable competition must not end the scan: the rest of
            // the year is still perfectly importable.
            console.error('[webshooter] skipping competition', competition.id, err);
          }
          setChecked((n) => n + 1);
        }
      } catch (err) {
        if (cancelled || runId.current !== thisRun) return;
        console.error('[webshooter] scanning for my results failed', err);
        setError('fetchFailed');
        setErrorDetail(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && runId.current === thisRun) setScanning(false);
      }
    }

    void scan();
    return () => {
      cancelled = true;
      runId.current += 1;
    };
    // `key` stands in for the candidate list: a new array with the same ids
    // must not restart a scan that is already walking those competitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  return {
    // Derived, so an emptied candidate list cannot leave stale rows behind.
    mine: candidates.length === 0 ? [] : mine,
    checked,
    total: candidates.length,
    scanning,
    error,
    errorDetail,
    rescan,
  };
}
