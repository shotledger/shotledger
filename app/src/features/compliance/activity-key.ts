import type { LicenseActivity } from '@shotledger/shared';

/**
 * A stable React key / testID fragment for one license-activity result.
 *
 * A shooter-scope rule has no weapon groups, so the old
 * `weaponGroups.join(',')` collapsed to an empty string and the testIDs read
 * `firearm-barometer-undefined`.
 */
export function licenseActivityKey(activity: LicenseActivity): string {
  return activity.scope === 'shooter' ? 'shooter' : activity.weaponGroups.join(',');
}
