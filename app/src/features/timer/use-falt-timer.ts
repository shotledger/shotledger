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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { vibrate } from '@/platform/haptics';
import { speak, stopSpeaking } from '@/platform/speech';
import { playTimerCueSound, releaseTimerCuePlayers } from '@/platform/timer-cues';

const TICK_MS = 100;
const KEEP_AWAKE_TAG = 'falt-timer';
const COMMAND_LANGUAGE = 'sv-SE';

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
  const engine = useMemo(() => new FaltTimerEngine(settings), [settings]);
  const [phase, setPhase] = useState<FaltPhase>(() => engine.getPhase());
  const [currentCue, setCurrentCue] = useState<FaltCueKind | null>(null);
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
  }, [engine, playCues, stopInterval]);

  const runInterval = useCallback(() => {
    stopInterval();
    lastTickRef.current = Date.now();
    intervalRef.current = setInterval(tick, TICK_MS);
  }, [stopInterval, tick]);

  const start = useCallback(() => {
    playCues(engine.start());
    setPhase(engine.getPhase());
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    runInterval();
  }, [engine, playCues, runInterval]);

  const pause = useCallback(() => {
    engine.pause();
    stopInterval();
    stopSpeaking();
    setPhase(engine.getPhase());
  }, [engine, stopInterval]);

  const resume = useCallback(() => {
    engine.resume();
    setPhase(engine.getPhase());
    runInterval();
  }, [engine, runInterval]);

  const reset = useCallback(() => {
    teardown();
    engine.reset();
    setPhase(engine.getPhase());
    setCurrentCue(null);
  }, [engine, teardown]);

  const markera = useCallback(() => {
    teardown();
    if (spokenPrompts) speak(FALT_MARKERA_TEXT, { language: COMMAND_LANGUAGE });
    engine.markera();
    setPhase(engine.getPhase());
    setCurrentCue(null);
  }, [engine, spokenPrompts, teardown]);

  return {
    phase,
    currentCue,
    isRunning: engine.isRunning(),
    start,
    pause,
    resume,
    reset,
    markera,
  };
}
