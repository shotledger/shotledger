// React wrapper around the pure `FaltTimerEngine` (shared/src/timer/falt.ts,
// unit-tested there). Same division of labour as use-timer.ts/use-ipsc-timer.ts:
// the engine owns the sequence, this hook owns the interval, keep-awake and
// the cue → speech/tone/vibration mapping. Not independently tested — the
// same precedent as those two.
import {
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
  atMs: 0,
  toEldMs: 0,
  shootingRemainingMs: 0,
  partierPassed: 0,
};

/**
 * Tone per cue — played alongside the spoken command, and on its own when
 * spoken prompts are off or the platform's TTS refuses. The regular timer's
 * four assets are all there is: there is no separate whistle sample, so the
 * whistle variant of ELD UPPHÖR borrows the stop tone.
 */
const CUE_SOUND: Record<FaltCueKind, TimerCueKind | null> = {
  ladda: null,
  allaKlara: null,
  tenSeconds: null,
  fardiga: null,
  eld: 'start',
  eldUpphor: 'stop',
  timeUp: 'complete',
  patronUr: null,
  visitation: null,
  parti: 'ready',
};

export interface UseFaltTimerResult {
  phase: FaltPhase;
  /** The number of the command last given, for the highlighted row in the numbered list. */
  currentNumber: number | null;
  isRunning: boolean;
  /** True while the range officer's next button press is what moves the sequence on. */
  isAwaitingPress: boolean;
  start: () => void;
  /** The range officer's button: the next untimed command, or the start of the automatic run. */
  advanceManual: () => void;
  pause: () => void;
  resume: () => void;
  /** Back to the settings view. */
  reset: () => void;
  /** Run the same sequence again without leaving the timeline view. */
  restart: () => void;
}

export function useFaltTimer(
  settings: FaltTimerSettings,
  spokenPrompts: boolean,
): UseFaltTimerResult {
  const [phase, setPhase] = useState<FaltPhase>(IDLE_PHASE);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isAwaitingPress, setIsAwaitingPress] = useState(false);

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
        if (cue.number !== null) setCurrentNumber(cue.number);
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

  const syncFrom = useCallback((engine: FaltTimerEngine) => {
    setPhase(engine.getPhase());
    setIsRunning(engine.isRunning());
    setIsAwaitingPress(engine.isAwaitingPress());
  }, []);

  const tick = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = Date.now();
    const delta = now - lastTickRef.current;
    lastTickRef.current = now;
    playCues(engine.advance(delta));
    const next = engine.getPhase();
    setPhase(next);
    if (next.kind === 'done') {
      stopInterval();
      setIsRunning(false);
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
  }, [playCues, stopInterval]);

  const runInterval = useCallback(() => {
    stopInterval();
    lastTickRef.current = Date.now();
    intervalRef.current = setInterval(tick, TICK_MS);
  }, [stopInterval, tick]);

  const begin = useCallback(() => {
    const engine = new FaltTimerEngine(settings);
    engineRef.current = engine;
    setCurrentNumber(null);
    playCues(engine.start());
    syncFrom(engine);
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    // In range-officer mode the clock only starts after the presses, so the
    // interval waits too — nothing between LADDA and the run is timed.
    if (engine.isRunning()) runInterval();
  }, [settings, playCues, runInterval, syncFrom]);

  const advanceManual = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    playCues(engine.advanceManual());
    syncFrom(engine);
    if (engine.isRunning() && intervalRef.current === null) runInterval();
  }, [playCues, runInterval, syncFrom]);

  const pause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.pause();
    stopInterval();
    stopSpeaking();
    syncFrom(engine);
  }, [stopInterval, syncFrom]);

  const resume = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resume();
    syncFrom(engine);
    if (engine.isRunning()) runInterval();
  }, [runInterval, syncFrom]);

  const reset = useCallback(() => {
    teardown();
    engineRef.current = null;
    setPhase(IDLE_PHASE);
    setCurrentNumber(null);
    setIsRunning(false);
    setIsAwaitingPress(false);
  }, [teardown]);

  const restart = useCallback(() => {
    teardown();
    engineRef.current = null;
    begin();
  }, [teardown, begin]);

  return {
    phase,
    currentNumber,
    isRunning,
    isAwaitingPress,
    start: begin,
    advanceManual,
    pause,
    resume,
    reset,
    restart,
  };
}
