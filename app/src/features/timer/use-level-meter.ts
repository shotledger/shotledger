// Live microphone preview for the IPSC setup screen. It runs the *same*
// `ShotDetector` the run will, on the same window stream, so what the
// shooter sees while tuning is what the timer will do: the tracked noise
// floor the trigger is measured against, and a count of the events that
// actually passed the gate when they dry-fire or clap.
//
// Display only — it never touches the run's engine.
import { ShotDetector, type ShotDetectorOptions } from '@shotledger/shared';
import { useEffect, useRef, useState } from 'react';

import {
  getMicPermission,
  isShotListeningAvailable,
  startShotListening,
  type ShotListenerHandle,
} from '@/platform/shot-listener';

/**
 * How often the reading reaches React. Windows arrive a hundred times a
 * second, which is neither renderable nor readable.
 */
const FLUSH_MS = 100;

export interface LevelMeterResult {
  /** Most recent dBFS reading, or null before metering has started/permission isn't granted. */
  currentDb: number | null;
  /** Highest dBFS reading seen since metering last (re)started. */
  peakDb: number | null;
  /** The tracked noise floor the trigger is measured against, or null before the first window. */
  noiseFloorDb: number | null;
  /** How many events have passed the gate since metering (re)started. */
  detectedCount: number;
}

const EMPTY: LevelMeterResult = {
  currentDb: null,
  peakDb: null,
  noiseFloorDb: null,
  detectedCount: 0,
};

/**
 * Meters the microphone while `enabled` is true and permission is already
 * granted (this never itself prompts — the run's own start() does that).
 * Stops on every disable/unmount, the same guarantee `shot-listener.ts`
 * gives the run path.
 *
 * `gate` is the shooter's current setting: changing it restarts the preview
 * detector, so the count below the meter answers for the setting on screen.
 */
export function useLevelMeter(
  enabled: boolean,
  gate: Pick<ShotDetectorOptions, 'triggerExcessDb' | 'maxEventMs'>,
): LevelMeterResult {
  const [reading, setReading] = useState<LevelMeterResult>(EMPTY);
  const listenerRef = useRef<ShotListenerHandle | null>(null);
  const { triggerExcessDb, maxEventMs } = gate;

  useEffect(() => {
    if (!enabled || !isShotListeningAvailable()) return;

    let canceled = false;
    // Armed because this is not a run: there is no beep to wait for, and an
    // unarmed detector would never report the event the shooter just made.
    const detector = new ShotDetector({ triggerExcessDb, maxEventMs });
    detector.arm(0);

    // Windows land a hundred times a second in bursts; React sees the
    // accumulated reading on a timer instead.
    let pending = EMPTY;
    let dirty = false;
    const flush = setInterval(() => {
      if (canceled || !dirty) return;
      dirty = false;
      setReading(pending);
    }, FLUSH_MS);

    void (async () => {
      const permission = await getMicPermission();
      if (canceled || permission !== 'granted') return;

      try {
        const listener = await startShotListening((window) => {
          if (canceled) return;
          const shot = detector.push(window);
          dirty = true;
          pending = {
            currentDb: window.db,
            peakDb:
              pending.peakDb === null || window.db > pending.peakDb ? window.db : pending.peakDb,
            noiseFloorDb: detector.getNoiseFloorDb(),
            detectedCount: pending.detectedCount + (shot ? 1 : 0),
          };
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
      clearInterval(flush);
      const listener = listenerRef.current;
      listenerRef.current = null;
      void listener?.stop();
      setReading(EMPTY);
    };
  }, [enabled, triggerExcessDb, maxEventMs]);

  return reading;
}
