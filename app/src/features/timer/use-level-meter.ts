// Live microphone level meter for the IPSC setup screen — lets the shooter
// clap/dry-fire and see where the peak lands before picking a trigger level.
// Reuses the same metered-recording plumbing as the run path
// (platform/shot-listener.ts) but never touches ShotDetector/IpscTimerEngine:
// this is display only.
import { useEffect, useRef, useState } from 'react';

import {
  getMicPermission,
  isShotListeningAvailable,
  startShotListening,
  type ShotListenerHandle,
} from '@/platform/shot-listener';

export interface LevelMeterResult {
  /** Most recent dBFS reading, or null before metering has started/permission isn't granted. */
  currentDb: number | null;
  /** Highest dBFS reading seen since metering last (re)started. */
  peakDb: number | null;
}

/**
 * Meters the microphone while `enabled` is true and permission is already
 * granted (this never itself prompts — the run's own start() does that).
 * Stops and deletes the temporary recording on every disable/unmount, the
 * same guarantee `shot-listener.ts` gives the run path.
 */
export function useLevelMeter(enabled: boolean): LevelMeterResult {
  const [currentDb, setCurrentDb] = useState<number | null>(null);
  const [peakDb, setPeakDb] = useState<number | null>(null);
  const listenerRef = useRef<ShotListenerHandle | null>(null);

  useEffect(() => {
    if (!enabled || !isShotListeningAvailable()) return;

    let canceled = false;

    void (async () => {
      const permission = await getMicPermission();
      if (canceled || permission !== 'granted') return;

      try {
        const listener = await startShotListening((db) => {
          if (canceled) return;
          setCurrentDb(db);
          setPeakDb((prev) => (prev === null || db > prev ? db : prev));
        });
        if (canceled) {
          void listener.stop();
          return;
        }
        listenerRef.current = listener;
      } catch {
        // Mic busy or briefly unavailable — the meter just stays blank.
      }
    })();

    return () => {
      canceled = true;
      const listener = listenerRef.current;
      listenerRef.current = null;
      void listener?.stop();
      setCurrentDb(null);
      setPeakDb(null);
    };
  }, [enabled]);

  return { currentDb, peakDb };
}
