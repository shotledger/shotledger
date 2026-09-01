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
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

export function getSetting<T>(db: Database, key: SettingKey, fallback: T): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting<T>(db: Database, key: SettingKey, value: T): void {
  const encoded = JSON.stringify(value);
  db.insert(settings)
    .values({ key, value: encoded })
    .onConflictDoUpdate({ target: settings.key, set: { value: encoded } })
    .run();
}
