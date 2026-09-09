// Persistence for the timer screens' own options, in the existing key/value
// `settings` table (same shape as the backup folder URI in
// features/backup/use-backup-export-import.ts). `db` is null on web, where
// the values simply stay in component state for the session.
import { normalizeFaltSettings, type FaltTimerSettings } from '@shotledger/shared';
import { useCallback, useState } from 'react';

import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';

/** Spoken prompts (both timers). On by default — the fälttimer is a spoken command sequence. */
export function useSpokenPrompts(): [boolean, (next: boolean) => void] {
  const [spoken, setSpoken] = useState<boolean>(() =>
    db ? getSetting<boolean>(db, SETTINGS_KEYS.spokenPrompts, true) : true,
  );

  const update = useCallback((next: boolean) => {
    if (db) setSetting(db, SETTINGS_KEYS.spokenPrompts, next);
    setSpoken(next);
  }, []);

  return [spoken, update];
}

/**
 * The fälttimer's settings. A stored blob is validated through
 * `normalizeFaltSettings` before use, so an older or hand-edited row cannot
 * hand the engine an out-of-range shooting time.
 */
export function useFaltSettings(
  defaults: FaltTimerSettings,
): [FaltTimerSettings, (next: FaltTimerSettings) => void] {
  const [settings, setSettings] = useState<FaltTimerSettings>(() => {
    if (!db) return defaults;
    const stored = getSetting<FaltTimerSettings | null>(db, SETTINGS_KEYS.faltTimer, null);
    // A row written before the 2026-09-09 rework carries the old
    // competition/training modes; the mode check drops it back to defaults.
    if (!stored || (stored.mode !== 'rangeOfficer' && stored.mode !== 'solo')) return defaults;
    try {
      return normalizeFaltSettings({ ...defaults, ...stored });
    } catch {
      return defaults;
    }
  });

  const update = useCallback((next: FaltTimerSettings) => {
    if (db) setSetting(db, SETTINGS_KEYS.faltTimer, next);
    setSettings(next);
  }, []);

  return [settings, update];
}
