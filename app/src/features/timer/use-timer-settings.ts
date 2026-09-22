// Persistence for the timer screens' own options, in the existing key/value
// `settings` table (same shape as the backup folder URI in
// features/backup/use-backup-export-import.ts). `db` is null on web, where
// the values simply stay in component state for the session.
import {
  DEFAULT_TIMER_SETUP,
  faltCuesFromLegacy,
  normalizeFaltSettings,
  normalizeTimerSetup,
  type FaltTimerSettings,
  type TimerSetup,
} from '@shotledger/shared';
import { useCallback, useState } from 'react';

import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';

/**
 * The fälttimer's settings. A stored blob is validated through
 * `normalizeFaltSettings` before use, so an older or hand-edited row cannot
 * hand the engine an out-of-range shooting time or a cue it cannot deliver.
 */
export function useFaltSettings(
  defaults: FaltTimerSettings,
): [FaltTimerSettings, (next: FaltTimerSettings) => void] {
  const [settings, setSettings] = useState<FaltTimerSettings>(() => {
    if (!db) return defaults;
    const stored = getSetting<Record<string, unknown> | null>(db, SETTINGS_KEYS.faltTimer, null);
    // A row written before the 2026-09-09 rework carries the old
    // competition/training modes; the mode check drops it back to defaults.
    if (!stored || (stored.mode !== 'rangeOfficer' && stored.mode !== 'solo')) return defaults;
    // A row from before the per-command cues stored three toggles instead,
    // spoken prompts among them in its own row; keep what they meant.
    const cues =
      stored.cues ??
      faltCuesFromLegacy({
        whistle: stored.whistle,
        vibration: stored.vibration,
        spokenPrompts: getSetting<unknown>(db, SETTINGS_KEYS.spokenPrompts, true),
      });
    try {
      return normalizeFaltSettings({ ...defaults, ...stored, cues } as FaltTimerSettings);
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

/**
 * The timer's setup. Validated on the way out of storage, so a row from an
 * older build cannot hand the engine a trigger level, a delay range or a cue
 * mode it rejects — `normalizeTimerSetup` pulls each field into range on its
 * own, and a row that is not a setup at all falls back whole.
 */
export function useTimerSetup(): [TimerSetup, (next: TimerSetup) => void] {
  const [setup, setSetup] = useState<TimerSetup>(() => {
    if (!db) return DEFAULT_TIMER_SETUP;
    // Spoken prompts lived in their own row before they joined this blob.
    const spokenPrompts = getSetting<unknown>(db, SETTINGS_KEYS.spokenPrompts, true);
    const stored = getSetting<unknown>(db, SETTINGS_KEYS.timerSetup, null);
    return normalizeTimerSetup({
      spokenPrompts,
      ...(typeof stored === 'object' && stored !== null ? stored : {}),
    });
  });

  const update = useCallback((next: TimerSetup) => {
    if (db) setSetting(db, SETTINGS_KEYS.timerSetup, next);
    setSetup(next);
  }, []);

  return [setup, update];
}
