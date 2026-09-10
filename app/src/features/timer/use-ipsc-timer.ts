// React wrapper around the pure `IpscTimerEngine` (shared/src/timer/
// shot-detector.ts, unit-tested there). Same division of labour as
// use-timer.ts: the engine owns the logic, this hook owns the interval, the
// microphone handle, keep-awake and the cue → sound mapping. Not
// independently tested — the same precedent as use-timer.ts.
import {
  IpscTimerEngine,
  type DetectedShot,
  type IpscCueKind,
  type IpscPhase,
  type IpscTimerConfig,
  type ShotRunSummary,
} from '@shotledger/shared';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimerCueKind } from '@shotledger/shared';

import {
  ensureMicPermission,
  isShotListeningAvailable,
  startShotListening,
  type ShotListenerHandle,
} from '@/platform/shot-listener';
import { speak, stopSpeaking } from '@/platform/speech';
import { playTimerCueSound, vibrateForTimerCue } from '@/platform/timer-cues';

const TICK_MS = 50;
const KEEP_AWAKE_TAG = 'ipsc-shot-timer';

const IDLE_PHASE: IpscPhase = { kind: 'idle', remainingMs: 0, runElapsedMs: 0 };

/**
 * Cue → existing timer sound. Played under the spoken prompt, and on its own
 * when spoken prompts are off or the platform's TTS refuses — the tone stays
 * the guarantee, speech is the addition.
 */
const CUE_SOUND: Record<IpscCueKind, TimerCueKind> = {
  ready: 'ready',
  standby: 'ready',
  start: 'start',
  stop: 'complete',
};

export type IpscTimerError = 'unavailable' | 'denied' | 'failed';

export interface UseIpscTimerResult {
  phase: IpscPhase;
  shots: readonly DetectedShot[];
  /** Set once a run has finished; null while idle or running. */
  summary: ShotRunSummary | null;
  error: IpscTimerError | null;
  /** False on web, where expo-audio cannot meter the microphone. */
  available: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * The two prompts to speak, in the app's current language (unlike the
 * fälttimer's SPSF-regulated Swedish commands, these are ordinary UI text).
 * Null turns spoken prompts off, leaving the tones.
 */
export interface IpscSpokenPrompts {
  language: string;
  ready: string;
  standby: string;
}

export function useIpscTimer(
  config: IpscTimerConfig,
  spokenPrompts: IpscSpokenPrompts | null = null,
): UseIpscTimerResult {
  const [phase, setPhase] = useState<IpscPhase>(IDLE_PHASE);
  const [shots, setShots] = useState<readonly DetectedShot[]>([]);
  const [summary, setSummary] = useState<ShotRunSummary | null>(null);
  const [error, setError] = useState<IpscTimerError | null>(null);

  const engineRef = useRef<IpscTimerEngine | null>(null);
  const listenerRef = useRef<ShotListenerHandle | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(0);

  const playCues = useCallback(
    (cues: readonly IpscCueKind[]) => {
      for (const cue of cues) {
        const text =
          spokenPrompts === null
            ? null
            : cue === 'ready'
              ? spokenPrompts.ready
              : cue === 'standby'
                ? spokenPrompts.standby
                : null;
        // The start beep and the stop tone stay tones — a spoken word would
        // arrive late and blur the moment the clock actually starts.
        const spoke =
          text !== null &&
          speak(text, {
            language: spokenPrompts?.language,
            onError: () => playTimerCueSound(CUE_SOUND[cue]),
          });
        if (!spoke) playTimerCueSound(CUE_SOUND[cue]);
        if (cue === 'start') vibrateForTimerCue();
      }
    },
    [spokenPrompts],
  );

  /** Tears down the interval, the microphone and keep-awake. Idempotent. */
  const teardown = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const listener = listenerRef.current;
    listenerRef.current = null;
    void listener?.stop();
    stopSpeaking();
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, []);

  const finish = useCallback(() => {
    teardown();
    const engine = engineRef.current;
    if (!engine) return;
    setPhase(engine.getPhase());
    setShots([...engine.getShots()]);
    setSummary(engine.getSummary());
  }, [teardown]);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(() => {
    if (!isShotListeningAvailable()) {
      setError('unavailable');
      return;
    }
    setError(null);
    setSummary(null);
    setShots([]);

    void (async () => {
      const permission = await ensureMicPermission();
      if (permission !== 'granted') {
        setError(permission === 'unavailable' ? 'unavailable' : 'denied');
        return;
      }

      const engine = new IpscTimerEngine(config);
      engineRef.current = engine;
      playCues(engine.start());
      setPhase(engine.getPhase());
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);

      try {
        listenerRef.current = await startShotListening((db) => {
          const shot = engineRef.current?.pushLevel(db);
          if (shot) setShots([...(engineRef.current?.getShots() ?? [])]);
        });
      } catch {
        teardown();
        engine.reset();
        setPhase(IDLE_PHASE);
        setError('failed');
        return;
      }

      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const running = engineRef.current;
        if (!running) return;
        const now = Date.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;

        const cues = running.advance(delta);
        playCues(cues);
        if (cues.includes('stop')) finish();
        else setPhase(running.getPhase());
      }, TICK_MS);
    })();
  }, [config, finish, playCues, teardown]);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    playCues(engine.stop());
    finish();
  }, [finish, playCues]);

  const reset = useCallback(() => {
    teardown();
    engineRef.current?.reset();
    engineRef.current = null;
    setPhase(IDLE_PHASE);
    setShots([]);
    setSummary(null);
    setError(null);
  }, [teardown]);

  return {
    phase,
    shots,
    summary,
    error,
    available: isShotListeningAvailable(),
    start,
    stop,
    reset,
  };
}
