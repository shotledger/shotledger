import { eq } from 'drizzle-orm';

import { settings } from '../schema';
import type { Database } from '../types';

// Keys are plain strings (no enum in schema); centralized here so callers
// don't hand-roll key names. Values are JSON-encoded per §3.
export const SETTINGS_KEYS = {
  language: 'language', // 'system' | 'sv' | 'en'
  theme: 'theme', // 'system' | 'light' | 'dark'
  // Shooter's birth year — drives the märke age reduction (§6.5). null = unknown.
  birthYear: 'birthYear',
  // Jurisdiction profile id ('none' | 'se', §6.6). Unset = no explicit
  // choice yet — the Settings screen applies the locale-based default
  // (se when device locale is sv, else none) rather than writing a row.
  complianceProfile: 'complianceProfile',
  // Timers: spoken prompts on/off, and the fälttimer's own settings blob
  // (mode, prep/shooting time, parti boundaries, whistle) — plan.md "Timers".
  spokenPrompts: 'spokenPrompts',
  faltTimer: 'faltTimer',
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

// The key column is plain text (no enum in schema, comment above): callers
// generating a dynamic key (e.g. one entry per WebShooter classname, §A.8)
// pass a plain `string` — `SettingKey` remains the typed convenience for
// the fixed keys above, not an exhaustive constraint on the column itself.
export function getSetting<T>(db: Database, key: SettingKey | string, fallback: T): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting<T>(db: Database, key: SettingKey | string, value: T): void {
  const encoded = JSON.stringify(value);
  db.insert(settings)
    .values({ key, value: encoded })
    .onConflictDoUpdate({ target: settings.key, set: { value: encoded } })
    .run();
}
