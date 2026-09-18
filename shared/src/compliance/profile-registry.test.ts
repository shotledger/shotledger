import { describe, expect, it } from 'vitest';

import { GENERIC_WEAPON_GROUPS, SPSF_WEAPON_GROUPS } from '../disciplines/groups';
import {
  getProfile,
  getProfileDefinition,
  resolveDefaultVariantId,
  resolveDefaultVariantIdFor,
} from './profile-registry';
import {
  SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES,
  SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES,
  SE_VERIFIED,
  SE_WINDOW_MONTHS,
} from './constants-se';
import { SE_FIRST_HANDGUN_VARIANT, SE_EXISTING_HANDGUN_VARIANT } from './profiles/se';

describe('getProfile', () => {
  it('P1: se resolves to the SE profile on its default variant, verified', () => {
    const profile = getProfile('se');
    expect(profile?.id).toBe('se');
    expect(profile?.verified).toBe(SE_VERIFIED);
    expect(profile?.verified).toBe(true);
    expect(profile?.variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('P2: none resolves to null, whatever variant is asked for', () => {
    expect(getProfile('none')).toBeNull();
    expect(getProfile('none', SE_EXISTING_HANDGUN_VARIANT)).toBeNull();
  });

  it('P3: every v1 weapon group resolves to exactly one rule, under either variant', () => {
    const allIds = [...SPSF_WEAPON_GROUPS, ...GENERIC_WEAPON_GROUPS].map((g) => g.id);
    for (const variant of [SE_FIRST_HANDGUN_VARIANT, SE_EXISTING_HANDGUN_VARIANT]) {
      const profile = getProfile('se', variant)!;
      for (const id of allIds) {
        const matches = profile.rules.filter((rule) => rule.weaponGroups.includes(id));
        expect(matches).toHaveLength(1);
      }
    }
  });

  it('P4: the window traces to constants-se.ts (no duplicated literals)', () => {
    for (const variant of [SE_FIRST_HANDGUN_VARIANT, SE_EXISTING_HANDGUN_VARIANT]) {
      for (const rule of getProfile('se', variant)!.rules) {
        expect(rule.windowMonths).toBe(SE_WINDOW_MONTHS);
      }
    }
  });

  it('P5: 5 § — the first-handgun variant requires twelve activities', () => {
    const profile = getProfile('se', SE_FIRST_HANDGUN_VARIANT)!;
    expect(profile.variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
    expect(profile.rules.length).toBeGreaterThan(0);
    for (const rule of profile.rules) {
      expect(rule.requiredActivities).toBe(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES);
    }
  });

  it('P6: 6 § — the existing-handgun variant requires six activities', () => {
    const profile = getProfile('se', SE_EXISTING_HANDGUN_VARIANT)!;
    expect(profile.variantId).toBe(SE_EXISTING_HANDGUN_VARIANT);
    expect(profile.rules.length).toBeGreaterThan(0);
    for (const rule of profile.rules) {
      expect(rule.requiredActivities).toBe(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES);
    }
  });

  it('P7: an unknown variant id falls back to the default, never null and never empty', () => {
    const profile = getProfile('se', 'not-a-variant');
    expect(profile).not.toBeNull();
    expect(profile!.variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
    expect(profile!.rules).toEqual(getProfile('se')!.rules);
  });

  it('P8: the se definition offers both cases and names an existing default', () => {
    const definition = getProfileDefinition('se')!;
    expect(definition.variants.map((v) => v.id)).toEqual([
      SE_FIRST_HANDGUN_VARIANT,
      SE_EXISTING_HANDGUN_VARIANT,
    ]);
    expect(definition.variants.map((v) => v.id)).toContain(definition.defaultVariantId);
  });

  it('P9: there is no definition for none', () => {
    expect(getProfileDefinition('none')).toBeNull();
  });

  it('P10: training and competition count alike, as the form pools them', () => {
    for (const variant of [SE_FIRST_HANDGUN_VARIANT, SE_EXISTING_HANDGUN_VARIANT]) {
      for (const rule of getProfile('se', variant)!.rules) {
        expect(rule.countsAs).toEqual({ training: 1, competition: 1 });
      }
    }
  });
});

describe('resolveDefaultVariantId', () => {
  const ownedPistol = { weaponType: 'pistol', isOwn: true };

  it('V1: none has no default case at all', () => {
    expect(resolveDefaultVariantId('none', [])).toBeNull();
    expect(resolveDefaultVariantId('none', [ownedPistol])).toBeNull();
  });

  it('V2: se with no firearms defaults to the stricter 5 § case', () => {
    expect(resolveDefaultVariantId('se', [])).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('V3: se with an owned handgun defaults to the 6 § case', () => {
    expect(resolveDefaultVariantId('se', [ownedPistol])).toBe(SE_EXISTING_HANDGUN_VARIANT);
  });

  it('V4: omitting the facts entirely is not "owns a handgun"', () => {
    expect(resolveDefaultVariantId('se')).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('V5: a profile that declares no derivation falls back to its defaultVariantId', () => {
    const definition = {
      ...getProfileDefinition('se')!,
      deriveDefaultVariantId: undefined,
      defaultVariantId: SE_EXISTING_HANDGUN_VARIANT,
    };
    expect(resolveDefaultVariantIdFor(definition, [ownedPistol])).toBe(
      SE_EXISTING_HANDGUN_VARIANT,
    );
    expect(resolveDefaultVariantIdFor(definition, [])).toBe(SE_EXISTING_HANDGUN_VARIANT);
  });

  it('V6: the derived case feeds getProfile and lands on the 6 § numbers', () => {
    const profile = getProfile('se', resolveDefaultVariantId('se', [ownedPistol]) ?? undefined)!;
    expect(profile.variantId).toBe(SE_EXISTING_HANDGUN_VARIANT);
    for (const rule of profile.rules) {
      expect(rule.requiredActivities).toBe(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES);
    }
  });

  it('V7: an explicit variant id is unaffected by the facts — getProfile never sees them', () => {
    const profile = getProfile('se', SE_FIRST_HANDGUN_VARIANT)!;
    expect(profile.variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
    for (const rule of profile.rules) {
      expect(rule.requiredActivities).toBe(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES);
    }
  });
});
