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
  // (mode, prep/shooting time, parti boundaries, whistle).
  spokenPrompts: 'spokenPrompts',
  faltTimer: 'faltTimer',
  // The IPSC timer's own blob (trigger level, random delay range, PAR,
  // auto-stop).
  ipscTimer: 'ipscTimer',
  timerCues: 'timerCues',
  // Opt-in online place lookup for the session Location field (Photon/OSM).
  // OFF by default: with it on, what the user types is sent to a third-party
  // server, which an offline-first app must not do without being asked.
  onlineLocationLookup: 'onlineLocationLookup',
  // The shooter's own klass (SPSF 1/2/3), one across all vapengrupper per the
  // maintainer's ruling 2026-09-12. Earned rather than derived, so it has to
  // be stored — everything else about eligibility falls out of birthYear.
  skillClass: 'skillClass',
  // Whether the shooter competes in women's classes and events. A competition
  // fact rather than a gender: SPSF keys Dam 1/2/3 off it, ISSF keys whole
  // EVENTS off it (25 m Pistol is women/juniors, 25 m Rapid Fire has no
  // women's version). Never gates anything — it prefills an overridable
  // picker.
  competesInWomensClasses: 'competesInWomensClasses',
  // Opt-in collection of tap-to-mark positions as training data for a future
  // learned hole detector (db/queries/training-samples.ts). OFF by default and
  // local-only: target photos are personal data under hard rule 7, so consent
  // here is consent to keep labels ON THIS DEVICE, not to send anything.
  photoTrainingConsent: 'photoTrainingConsent',
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

// The key column is plain text (no enum in schema, comment above): callers
// generating a dynamic key (e.g. one entry per Webshooter classname, §A.8)
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
