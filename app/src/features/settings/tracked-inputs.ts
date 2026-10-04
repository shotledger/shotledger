// Settings → What I Track (#569): inputs a shooter can switch off because
// they never use them. Switching one off hides the input only — values
// already stored stay, and still show where they are set.
import type { Database } from '@/db/types';
import { getSetting, SETTINGS_KEYS } from '@/db/queries/settings';

export interface TrackedInputs {
  /** The handload switch and recipe on an ammo lot. */
  handloads: boolean;
  /** The weapon group picker on a competition; off, it comes from the firearm as in training. */
  weaponGroups: boolean;
  /** The class picker on a competition; off, no class is recorded, as in training. */
  shooterClass: boolean;
}

export function readTrackedInputs(db: Database | null): TrackedInputs {
  if (!db) return { handloads: true, weaponGroups: true, shooterClass: true };
  return {
    handloads: getSetting<boolean>(db, SETTINGS_KEYS.trackHandloads, true),
    weaponGroups: getSetting<boolean>(db, SETTINGS_KEYS.trackWeaponGroups, true),
    shooterClass: getSetting<boolean>(db, SETTINGS_KEYS.trackShooterClass, true),
  };
}
