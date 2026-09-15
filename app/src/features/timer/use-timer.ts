// Thin React wrapper around `TimerController` (plain TS, fully unit-tested
// in timer-controller.test.ts). This hook itself is not independently
// tested — same precedent as `use-home-data.ts` — its only job is to drive
// a `setInterval` and forward wall-clock ticks; the drill logic underneath
// is what the old-coder gauntlet actually covers.
//
// Rebuilding the controller when `config` changes uses React's documented
// "adjust state during render" pattern (calling `setState` directly in the
// render body when a value changed since the last render), not an effect —
// `new TimerController(...)` has no side effects, so syncing it via
// `useEffect` would only trip `react-hooks/set-state-in-effect` for no
// benefit. A ref is never read during render either, keeping clear of
// `react-hooks/refs` — it's only touched from callbacks/effect cleanup.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { TimerConfig, TimerCueMode, TimerPhase } from '@shotledger/shared';

import {
  playTimerCueSound,
  releaseTimerCuePlayers,
  respectSilentMode,
  vibrateForTimerCue,
} from '@/platform/timer-cues';

import { TimerController, type TimerEffects } from './timer-controller';

const TICK_MS = 100;
const KEEP_AWAKE_TAG = 'shot-timer';

export interface UseTimerResult {
  phase: TimerPhase;
  elapsedMs: number;
  isRunning: boolean;
  start: () => void;
  reset: () => void;
}

export function useTimer(config: TimerConfig, cueMode?: TimerCueMode): UseTimerResult {
  const effects = useMemo<TimerEffects>(
    () => ({ playSound: playTimerCueSound, vibrate: vibrateForTimerCue }),
    [],
  );

  const [controller, setController] = useState(() => new TimerController(config, effects, cueMode));
  const [controllerConfig, setControllerConfig] = useState(config);
  const [controllerCueMode, setControllerCueMode] = useState(cueMode);
  const [phase, setPhase] = useState<TimerPhase>(() => controller.getPhase());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // `config` and `cueMode` change only while the setup view is on
  // screen (timer.tsx renders it solely when `phase.kind === 'idle'`), so a
  // rebuild here can never interrupt a running interval or keep-awake —
  // no side-effect cleanup needed, just derived state.
  let activeController = controller;
  if (config !== controllerConfig || cueMode !== controllerCueMode) {
    activeController = new TimerController(config, effects, cueMode);
    setController(activeController);
    setControllerConfig(config);
    setControllerCueMode(cueMode);
    setPhase(activeController.getPhase());
  }

  useEffect(() => {
    return () => {
      stopInterval();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      releaseTimerCuePlayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, []);

  const start = useCallback(() => {
    // Re-asserted at every start: the shot timer's microphone takes the
    // session over while it is open (platform/timer-cues.ts).
    void respectSilentMode();
    setPhase(activeController.start(Date.now()));
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    stopInterval();
    intervalRef.current = setInterval(() => {
      const next = activeController.tick(Date.now());
      setPhase(next);
      if (next.kind === 'done') {
        stopInterval();
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      }
    }, TICK_MS);
  }, [activeController, stopInterval]);

  const reset = useCallback(() => {
    stopInterval();
    deactivateKeepAwake(KEEP_AWAKE_TAG);
    setPhase(activeController.reset());
  }, [activeController, stopInterval]);

  return {
    phase,
    elapsedMs: activeController.getElapsedMs(),
    isRunning: activeController.isRunning(),
    start,
    reset,
  };
}
