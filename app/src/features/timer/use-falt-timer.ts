// React wrapper around the pure `FaltTimerEngine` (shared/src/timer/falt.ts,
// unit-tested there). Same division of labour as use-timer.ts/use-ipsc-timer.ts:
// the engine owns the sequence, this hook owns the interval, keep-awake and
// the cue → speech/tone/vibration mapping. Not independently tested — the
// same precedent as those two.
import {
  FALT_MARKERA_TEXT,
  FaltTimerEngine,
  type FaltCue,
  type FaltCueKind,
  type FaltPhase,
  type FaltTimerSettings,
  type TimerCueKind,
} from '@shotledger/shared';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';

import { vibrate } from '@/platform/haptics';
import { speak, stopSpeaking } from '@/platform/speech';
import { playTimerCueSound, releaseTimerCuePlayers } from '@/platform/timer-cues';

const TICK_MS = 100;
const KEEP_AWAKE_TAG = 'falt-timer';
const COMMAND_LANGUAGE = 'sv-SE';

const IDLE_PHASE: FaltPhase = {
  kind: 'idle',
  elapsedMs: 0,
  remainingMs: 0,
  shootingElapsedMs: 0,
  shootingRemainingMs: 0,
  eventsPassed: 0,
};

/**
 * Tone per cue — played alongside the spoken command, and on its own when
 * spoken prompts are off or the platform's TTS refuses. The regular timer's
 * four assets are all there is: there is no separate whistle sample, so the
 * whistle variant of ELD UPPHÖR borrows the stop tone (plan.md limit).
 */
const CUE_SOUND: Record<FaltCueKind, TimerCueKind | null> = {
  ladda: null,
  allaKlara: null,
  tenSeconds: null,
  fardiga: null,
  eld: 'start',
  eldUpphor: 'stop',
  ceaseFire: 'complete',
  patronUr: null,
  visitation: null,
  event: 'ready',
};

export interface UseFaltTimerResult {
  phase: FaltPhase;
  /** The command last given, for the highlighted row in the command list. */
  currentCue: FaltCueKind | null;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** MARKERA — the untimed final command. */
  markera: () => void;
}

export function useFaltTimer(
  settings: FaltTimerSettings,
  spokenPrompts: boolean,
): UseFaltTimerResult {
  const [phase, setPhase] = useState<FaltPhase>(IDLE_PHASE);
  const [currentCue, setCurrentCue] = useState<FaltCueKind | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Built fresh in `start()`, from whatever `settings` are current then —
  // mirrors use-ipsc-timer.ts's `engineRef`. A ref (not `useMemo`) because
  // this is a mutable, stateful instance with imperative lifecycle methods:
  // `useMemo` never guarantees it won't recompute the value on some later
  // render (React may discard a memoized value at any time, and Strict Mode
  // deliberately does so to surface exactly this kind of bug), which would
  // silently orphan a running engine while the render output moved on to a
  // fresh, never-started one.
  const engineRef = useRef<FaltTimerEngine | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(0);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const playCues = useCallback(
    (cues: readonly FaltCue[]) => {
      for (const cue of cues) {
        const tone = CUE_SOUND[cue.kind];
        // The Swedish command wording is SPSF-regulated (SHB D.6.2) and is
        // always spoken in sv-SE, whatever the app's UI language is.
        const spoke =
          spokenPrompts && cue.speech !== undefined
            ? speak(cue.speech, {
                language: COMMAND_LANGUAGE,
                rate: cue.speechRate,
                onError: () => playTimerCueSound(tone ?? 'ready'),
              })
            : false;
        if (tone !== null || !spoke) playTimerCueSound(tone ?? 'ready');
        if (cue.vibrate) vibrate();
        setCurrentCue(cue.kind);
      }
    },
    [spokenPrompts],
  );

  const teardown = useCallback(() => {
    stopInterval();
    stopSpeaking();
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, [stopInterval]);

  useEffect(() => {
    return () => {
      teardown();
      releaseTimerCuePlayers();
    };
  }, [teardown]);

  const tick = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = Date.now();
    const delta = now - lastTickRef.current;
    lastTickRef.current = now;
    playCues(engine.advance(delta));
    const next = engine.getPhase();
    setPhase(next);
    // The plan ends at VISITATION; MARKERA is an untimed tap, so the
    // interval and keep-awake can go once the clock has run out.
    if (next.elapsedMs >= engine.getPlan().totalMs) {
      stopInterval();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
  }, [playCues, stopInterval]);

  const runInterval = useCallback(() => {
    stopInterval();
    lastTickRef.current = Date.now();
    intervalRef.current = setInterval(tick, TICK_MS);
  }, [stopInterval, tick]);

  const start = useCallback(() => {
    const engine = new FaltTimerEngine(settings);
    engineRef.current = engine;
    playCues(engine.start());
    setPhase(engine.getPhase());
    setIsRunning(engine.isRunning());
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    runInterval();
  }, [settings, playCues, runInterval]);

  const pause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.pause();
    stopInterval();
    stopSpeaking();
    setPhase(engine.getPhase());
    setIsRunning(engine.isRunning());
  }, [stopInterval]);

  const resume = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resume();
    setPhase(engine.getPhase());
    setIsRunning(engine.isRunning());
    runInterval();
  }, [runInterval]);

  const reset = useCallback(() => {
    teardown();
    engineRef.current = null;
    setPhase(IDLE_PHASE);
    setCurrentCue(null);
    setIsRunning(false);
  }, [teardown]);

  const markera = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    teardown();
    if (spokenPrompts) speak(FALT_MARKERA_TEXT, { language: COMMAND_LANGUAGE });
    engine.markera();
    setPhase(engine.getPhase());
    setCurrentCue(null);
    setIsRunning(engine.isRunning());
  }, [spokenPrompts, teardown]);

  return {
    phase,
    currentCue,
    isRunning,
    start,
    pause,
    resume,
    reset,
    markera,
  };
}
