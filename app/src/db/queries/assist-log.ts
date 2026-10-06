import type { AssistEntry } from '@/features/photo-scoring/assist-log';

import { getSetting, setSetting } from './settings';
import type { Database } from '../types';

// The photo-scoring assist log (features/photo-scoring/assist-log.ts), as one
// JSON array under one settings key: dev builds only, so no table of its own.
export const ASSIST_LOG_KEY = 'assistLog';

/** Oldest entries drop off past this, so the settings row stays small. */
export const ASSIST_LOG_LIMIT = 500;

export function getAssistLog(db: Database): AssistEntry[] {
  const stored = getSetting<unknown>(db, ASSIST_LOG_KEY, []);
  return Array.isArray(stored) ? (stored as AssistEntry[]) : [];
}

export function appendAssistEntry(db: Database, entry: AssistEntry): void {
  setSetting<AssistEntry[]>(
    db,
    ASSIST_LOG_KEY,
    [...getAssistLog(db), entry].slice(-ASSIST_LOG_LIMIT),
  );
}

export function clearAssistLog(db: Database): void {
  setSetting<AssistEntry[]>(db, ASSIST_LOG_KEY, []);
}
