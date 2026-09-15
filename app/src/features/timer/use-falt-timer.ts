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
import {
  playTimerCueSound,
  releaseTimerCuePlayers,
  respectSilentMode,
} from '@/platform/timer-cues';

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
 * The beep for each cue — what a command set to `beep` plays, and the
 * fallback when a spoken one's TTS refuses. ELD and the end of the shooting
 * time borrow the Time Limit timer's start/complete tones so the moments
 * that matter sound like they do there; the rest share the short ready tone.
 * A whistle is never mapped here: it is its own 3 s asset (the call is drawn
 * out — "utdraget", maintainer 2026-09-11 — and the 0.39 s stop tone it used
 * to borrow read as a beep rather than a blast).
 */
const CUE_BEEP: Record<FaltCueKind, TimerCueKind> = {
  ladda: 'ready',
  allaKlara: 'ready',
  tenSeconds: 'ready',
  fardiga: 'ready',
  eld: 'start',
  parti: 'ready',
  eldUpphor: 'stop',
  timeUp: 'complete',
  patronUr: 'ready',
  visitation: 'ready',
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
  /** Move the clock while paused — the timeline scrub and tap-a-command-to-jump. */
  seek: (atMs: number) => void;
  /** True while the clock is held, i.e. while scrubbing is allowed. */
  isPaused: boolean;
  /** Back to the settings view. */
  reset: () => void;
  /** Run the same sequence again without leaving the timeline view. */
  restart: () => void;
}

export function useFaltTimer(settings: FaltTimerSettings): UseFaltTimerResult {
  const [phase, setPhase] = useState<FaltPhase>(IDLE_PHASE);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isAwaitingPress, setIsAwaitingPress] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

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

  // Each cue arrives already resolved against the per-command setting
  // (shared/src/timer/falt.ts); this only turns it into calls.
  const playCues = useCallback((cues: readonly FaltCue[]) => {
    for (const cue of cues) {
      const beep = CUE_BEEP[cue.kind];
      switch (cue.sound) {
        case 'voice': {
          // The Swedish command wording is SPSF-regulated (SHB D.6.2) and is
          // always spoken in sv-SE, whatever the app's UI language is. The
          // beep is the fallback when TTS refuses, never a companion.
          const spoke =
            cue.speech !== undefined &&
            speak(cue.speech, {
              language: COMMAND_LANGUAGE,
              rate: cue.speechRate,
              onError: () => playTimerCueSound(beep),
            });
          if (!spoke) playTimerCueSound(beep);
          break;
        }
        case 'whistle':
          playTimerCueSound('whistle');
          break;
        case 'beep':
          playTimerCueSound(beep);
          break;
        case null:
          break;
      }
      if (cue.vibrate) vibrate();
      if (cue.number !== null) setCurrentNumber(cue.number);
    }
  }, []);

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
    setIsPaused(engine.isPaused());
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
    // Re-asserted at every start: the shot timer's microphone takes the
    // session over while it is open (platform/timer-cues.ts).
    void respectSilentMode();
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

  /**
   * Scrub while paused. The engine refuses on a running clock, and fires no
   * cues on the way — see FaltTimerEngine.seek.
   */
  const seek = useCallback(
    (atMs: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.seek(atMs);
      syncFrom(engine);
    },
    [syncFrom],
  );

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
    seek,
    isPaused,
    reset,
    restart,
  };
}
