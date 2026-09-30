// One stopwatch per session, shared by every screen that shows it.
//
// #135 put the widget on series entry with local `useState`, so the count
// died the moment you navigated away — useless for timing a whole session,
// which is what the maintainer asked for (#138). The state lives here
// instead, keyed by session id, and both the session view and series entry
// subscribe to the same entry.
//
// In memory only, deliberately: the elapsed time is derived from a start
// timestamp, so persisting it would resurrect a "running" stopwatch days
// later after the app was killed — worse than starting fresh. Closing the
// app ends the session's timing, as it does on a wristwatch left behind.
import {
  lapStopwatch,
  resetStopwatch,
  startStopwatch,
  stopStopwatch,
  STOPWATCH_ZERO,
} from './stopwatch';
import type { StopwatchState } from './stopwatch';

type Listener = () => void;

const states = new Map<string, StopwatchState>();
const listeners = new Map<string, Set<Listener>>();

export function getSessionStopwatch(sessionId: string): StopwatchState {
  return states.get(sessionId) ?? STOPWATCH_ZERO;
}

export function subscribeSessionStopwatch(sessionId: string, listener: Listener): () => void {
  const forSession = listeners.get(sessionId) ?? new Set<Listener>();
  forSession.add(listener);
  listeners.set(sessionId, forSession);
  return () => {
    forSession.delete(listener);
    if (forSession.size === 0) listeners.delete(sessionId);
  };
}

function set(sessionId: string, next: StopwatchState): void {
  if (next === getSessionStopwatch(sessionId)) return;
  states.set(sessionId, next);
  for (const listener of listeners.get(sessionId) ?? []) listener();
}

export function startSessionStopwatch(sessionId: string, now: number): void {
  set(sessionId, startStopwatch(getSessionStopwatch(sessionId), now));
}

export function stopSessionStopwatch(sessionId: string, now: number): void {
  set(sessionId, stopStopwatch(getSessionStopwatch(sessionId), now));
}

export function lapSessionStopwatch(sessionId: string, now: number): void {
  set(sessionId, lapStopwatch(getSessionStopwatch(sessionId), now));
}

export function resetSessionStopwatch(sessionId: string): void {
  set(sessionId, resetStopwatch());
}

/** Test seam — no production caller should need to wipe every session's clock. */
export function clearAllSessionStopwatches(): void {
  states.clear();
  listeners.clear();
}
