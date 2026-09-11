// Keeps the screen on for as long as a timer screen is open.
//
// Each timer hook already holds keep-awake while its own sequence RUNS. That
// is not the whole of the need: at the range the phone also has to stay
// readable between strings — while a program is being set up, while the line
// is called, while the shots are being read back. Those gaps are exactly
// when a phone locks (maintainer, 2026-09-11, first on the diagnostics
// screen and then "for all 4 timers").
//
// Separate tag from the per-run locks, so releasing one cannot release the
// other; expo-keep-awake reference-counts by tag.
import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export function useKeepAwakeOnScreen(tag: string): void {
  useKeepAwakeWhile(true, tag);
}

/**
 * Keeps the screen on while `active`.
 *
 * The session stopwatch wants this rather than the whole-screen version: the
 * session view is somewhere you sit and read, and holding the phone awake for
 * all of that would cost battery for nothing — but a stopwatch that is
 * actually counting is a timer like any other.
 */
export function useKeepAwakeWhile(active: boolean, tag: string): void {
  useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(tag);
    // Released on unmount — leaving the screen must not leave the phone awake
    // for the rest of the day.
    return () => {
      // Braces matter: `deactivateKeepAwake` returns a promise, and returning
      // it from an effect makes React treat it as the cleanup function.
      void deactivateKeepAwake(tag);
    };
  }, [active, tag]);
}
