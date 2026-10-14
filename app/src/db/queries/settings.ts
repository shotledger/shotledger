import { and, eq, isNull } from 'drizzle-orm';

import { settings } from '../schema';
import type { Database } from '../types';
import { nowIso } from '../util';

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
  // Which case within that profile applies to this shooter — for 'se', FAP
  // 551-3 5 § (no handgun yet) vs 6 § (already holds one). Not derivable from
  // app data, so the shooter picks it; unset = the profile's own default.
  complianceProfileVariant: 'complianceProfileVariant',
  // Timers. `spokenPrompts` is legacy — read once to seed the per-timer cue
  // settings that replaced it, never written. The fälttimer's own blob
  // (mode, prep/shooting time, parti boundaries, a cue per command).
  spokenPrompts: 'spokenPrompts',
  faltTimer: 'faltTimer',
  // The timer's own blob (time limit, start delay, repetitions, rest, shot
  // detection and its gate, cue mode, spoken prompts).
  timerSetup: 'timerSetup',
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
  // Settings → Optional Fields (#569). Each hides an input the shooter never
  // uses; stored values stay and still show. All on by default.
  trackHandloads: 'trackHandloads',
  trackWeaponGroups: 'trackWeaponGroups',
  trackShooterClass: 'trackShooterClass',
  // Settings → Features (#801). Each hides an optional area's ways in; the
  // area's data stays. Synced (SYNCED_SETTING_KEYS); only `false` hides, so
  // unset shows (shared/src/features/visibility.ts).
  showLicenseActivity: 'showLicenseActivity',
  showPhotos: 'showPhotos',
  showTimer: 'showTimer',
  showSightSettings: 'showSightSettings',
  showAmmoLots: 'showAmmoLots',
  showMaintenance: 'showMaintenance',
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

// The key column is plain text (no enum in schema, comment above): callers
// generating a dynamic key (e.g. one entry per Webshooter classname, §A.8)
// pass a plain `string` — `SettingKey` remains the typed convenience for
// the fixed keys above, not an exhaustive constraint on the column itself.
export function getSetting<T>(db: Database, key: SettingKey | string, fallback: T): T {
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.id, key), isNull(settings.deletedAt)))
    .get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

// Never tombstones: a synced setting's id is its key, so a tombstone would
// stop it ever being set again on the account (ADR 0019). Null is a value.
export function setSetting<T>(db: Database, key: SettingKey | string, value: T): void {
  const encoded = JSON.stringify(value);
  const now = nowIso();
  db.insert(settings)
    .values({ id: key, value: encoded, createdAt: now, updatedAt: now, deletedAt: null })
    .onConflictDoUpdate({ target: settings.id, set: { value: encoded, updatedAt: now } })
    .run();
}
