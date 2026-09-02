// Swedish jurisdiction profile. Numbers are VERIFY placeholders — see
// constants-se.ts. Spec: m6-compliance-spec.md "profiles/se.ts".
import { GENERIC_WEAPON_GROUPS, SPSF_WEAPON_GROUPS } from '../../disciplines/groups';
import {
  SE_DEFAULT_REQUIRED_ACTIVITIES,
  SE_DEFAULT_WINDOW_MONTHS,
  SE_SOURCE_CITATION,
  SE_VERIFIED,
} from '../constants-se';
import type { JurisdictionProfile } from '../types';

// One rule shared by every weapon group in v1 — the placeholder has no
// per-group differentiation to VERIFY yet (the real FAP 551-3 text may turn
// out to differentiate by group; that's for the maintainer's review).
const ALL_WEAPON_GROUP_IDS = [
  ...SPSF_WEAPON_GROUPS.map((g) => g.id),
  ...GENERIC_WEAPON_GROUPS.map((g) => g.id),
];

export const SE_PROFILE: JurisdictionProfile = {
  id: 'se',
  name: { sv: 'Sverige (FAP 551-3)', en: 'Sweden (FAP 551-3)' },
  rules: [
    {
      weaponGroups: ALL_WEAPON_GROUP_IDS,
      windowMonths: SE_DEFAULT_WINDOW_MONTHS,
      requiredActivities: SE_DEFAULT_REQUIRED_ACTIVITIES,
      countsAs: { training: 1, competition: 1 },
    },
  ],
  source: SE_SOURCE_CITATION,
  verified: SE_VERIFIED,
};
