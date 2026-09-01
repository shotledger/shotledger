import { SE_PROFILE } from './profiles/se';
import type { JurisdictionProfile, JurisdictionProfileId } from './types';

export type ProfileSelection = 'none' | JurisdictionProfileId;

const PROFILES: Record<JurisdictionProfileId, JurisdictionProfile> = {
  se: SE_PROFILE,
};

/**
 * `'none'` resolves to `null` — the §6.6 rule that the entire compliance UI
 * hides with no profile selected. Never fabricate a profile for `'none'`.
 */
export function getProfile(selection: ProfileSelection): JurisdictionProfile | null {
  if (selection === 'none') return null;
  return PROFILES[selection];
}
