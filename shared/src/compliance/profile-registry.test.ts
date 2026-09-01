import { describe, expect, it } from 'vitest';

import { GENERIC_WEAPON_GROUPS, SPSF_WEAPON_GROUPS } from '../disciplines/groups';
import { getProfile } from './profile-registry';
import {
  SE_DEFAULT_REQUIRED_ACTIVITIES,
  SE_DEFAULT_WINDOW_MONTHS,
  SE_VERIFIED,
} from './constants-se';

describe('getProfile', () => {
  it('P1: se resolves to the SE profile, unverified', () => {
    const profile = getProfile('se');
    expect(profile?.id).toBe('se');
    expect(profile?.verified).toBe(SE_VERIFIED);
    expect(profile?.verified).toBe(false);
  });

  it('P2: none resolves to null', () => {
    expect(getProfile('none')).toBeNull();
  });

  it('P3: every v1 weapon group resolves to exactly one rule', () => {
    const profile = getProfile('se')!;
    const allIds = [...SPSF_WEAPON_GROUPS, ...GENERIC_WEAPON_GROUPS].map((g) => g.id);
    for (const id of allIds) {
      const matches = profile.rules.filter((rule) => rule.weaponGroups.includes(id));
      expect(matches).toHaveLength(1);
    }
  });

  it('P4: profile numbers trace to constants-se.ts (no duplicated literals)', () => {
    const profile = getProfile('se')!;
    for (const rule of profile.rules) {
      expect(rule.windowMonths).toBe(SE_DEFAULT_WINDOW_MONTHS);
      expect(rule.requiredActivities).toBe(SE_DEFAULT_REQUIRED_ACTIVITIES);
    }
  });
});
