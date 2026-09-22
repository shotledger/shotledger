// React wrapper around `TimerController` (plain TS, fully unit-tested in
// timer-controller.test.ts). The controller owns the drill and the shot
// detection; this hook owns the interval, the microphone handle, keep-awake
// and the cue → sound mapping. Not independently tested — the same precedent
// as `use-home-data.ts`.
//
// The microphone is opened only when the setup asks for shots (#346), so a
// plain PAR drill still costs no permission prompt and no recorder.
import type { DetectedShot, TimerPhase, TimerSetup } from '@shotledger/shared';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ensureMicPermission,
  isShotListeningAvailable,
  startShotListening,
  type ShotListenerHandle,
} from '@/platform/shot-listener';
import { speak, stopSpeaking } from '@/platform/speech';
import {
  playTimerCueSound,
  releaseTimerCuePlayers,
  respectSilentMode,
  vibrateForTimerCue,
} from '@/platform/timer-cues';

import { TimerController, type SeriesResult, type TimerEffects } from './timer-controller';

const TICK_MS = 100;
const KEEP_AWAKE_TAG = 'shot-timer';

const IDLE_PHASE: TimerPhase = {
  kind: 'idle',
  openEnded: false,
  seriesIndex: -1,
  remainingMs: 0,
  elapsedMs: 0,
};

/** Why a run could not start. Only ever set when the setup asked for the microphone. */
export type TimerError = 'unavailable' | 'denied' | 'failed';

/** The spoken ready prompt, in the app's language — not the fälttimer's regulated Swedish. */
export interface TimerPrompts {
  language: string;
  ready: string;
}

export interface UseTimerResult {
  phase: TimerPhase;
  isRunning: boolean;
  /** The running series' shots, as they are detected. */
  shots: readonly DetectedShot[];
  /** Every finished series, in order. Empty unless shots are being recorded. */
  results: readonly SeriesResult[];
  error: TimerError | null;
  /** False on web, where expo-audio cannot open the microphone. */
  micAvailable: boolean;
  start: () => void;
  /** Ends the running series — the Stop button under an open-ended string. */
  stopSeries: () => void;
  reset: () => void;
}

/**
 * Where the audio sample clock stands at wall time `nowMs`, projected from
 * the last window that arrived. Buffers reach JS in ~100 ms bursts, so the
 * newest window is always a little behind the present; the wall clock covers
 * that gap without inheriting the burst's jitter.
 */
function streamMsAt(last: { atMs: number; wallMs: number } | null, nowMs: number): number {
  return last === null ? 0 : last.atMs + (nowMs - last.wallMs);
}

export function useTimer(setup: TimerSetup, prompts: TimerPrompts): UseTimerResult {
  const effects = useMemo<TimerEffects>(
    () => ({
      playSound: playTimerCueSound,
      vibrate: vibrateForTimerCue,
      speak: () => speak(prompts.ready, { language: prompts.language }),
    }),
    [prompts],
  );

  const [phase, setPhase] = useState<TimerPhase>(IDLE_PHASE);
  const [shots, setShots] = useState<readonly DetectedShot[]>([]);
  const [results, setResults] = useState<readonly SeriesResult[]>([]);
  const [error, setError] = useState<TimerError | null>(null);

  const controllerRef = useRef<TimerController | null>(null);
  const listenerRef = useRef<ShotListenerHandle | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The most recent window's position on the audio sample clock, and the wall
  // time it arrived. Together they place "now" on that clock, which is what a
  // shot is timed against.
  const lastWindowRef = useRef<{ atMs: number; wallMs: number } | null>(null);

  /** Tears down the interval, the microphone and keep-awake. Idempotent. */
  const teardown = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const listener = listenerRef.current;
    listenerRef.current = null;
    lastWindowRef.current = null;
    void listener?.stop();
    stopSpeaking();
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, []);

  useEffect(() => {
    return () => {
      teardown();
      releaseTimerCuePlayers();
    };
  }, [teardown]);

  const publish = useCallback((controller: TimerController, next: TimerPhase) => {
    setPhase(next);
    setShots([...controller.getShots()]);
    setResults([...controller.getResults()]);
  }, []);

  const runInterval = useCallback(
    (controller: TimerController) => {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const next = controller.tick(now, streamMsAt(lastWindowRef.current, now));
        publish(controller, next);
        if (next.kind === 'done') {
          teardown();
        }
      }, TICK_MS);
    },
    [publish, teardown],
  );

  const start = useCallback(() => {
    setError(null);
    setResults([]);
    setShots([]);
    // Re-asserted at every start: the microphone takes the audio session over
    // while it is open (platform/timer-cues.ts).
    void respectSilentMode();

    const controller = new TimerController(setup, effects);
    controllerRef.current = controller;

    const begin = () => {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      publish(controller, controller.start(Date.now()));
      runInterval(controller);
    };

    if (!controller.isRecordingShots()) {
      begin();
      return;
    }

    if (!isShotListeningAvailable()) {
      setError('unavailable');
      return;
    }

    void (async () => {
      const permission = await ensureMicPermission();
      if (permission !== 'granted') {
        setError(permission === 'unavailable' ? 'unavailable' : 'denied');
        return;
      }

      // The microphone opens BEFORE the drill does. A shot is anchored to the
      // audio sample clock, which only exists once a window has arrived —
      // start first and a slow-opening microphone would anchor the series at
      // zero and report every split late by however long it took. It also
      // means the noise floor is already settling while the ready delay runs.
      try {
        listenerRef.current = await startShotListening((window) => {
          lastWindowRef.current = { atMs: window.atMs, wallMs: Date.now() };
          if (controllerRef.current?.pushWindow(window)) {
            setShots([...(controllerRef.current?.getShots() ?? [])]);
          }
        });
      } catch {
        teardown();
        controllerRef.current = null;
        setPhase(IDLE_PHASE);
        setError('failed');
        return;
      }

      begin();
    })();
  }, [effects, publish, runInterval, setup, teardown]);

  const stopSeries = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const next = controller.stopSeries();
    publish(controller, next);
    if (next.kind === 'done') teardown();
  }, [publish, teardown]);

  const reset = useCallback(() => {
    teardown();
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.reset();
    setPhase(IDLE_PHASE);
    setShots([]);
    setResults([]);
    setError(null);
  }, [teardown]);

  return {
    phase,
    // From the phase rather than from the controller: a ref must not be read
    // during render, and the phase is the same answer.
    isRunning: phase.kind !== 'idle' && phase.kind !== 'done',
    shots,
    results,
    error,
    micAvailable: isShotListeningAvailable(),
    start,
    stopSeries,
    reset,
  };
}
