import {
  SE_EXISTING_HANDGUN_VARIANT,
  SE_FIRST_HANDGUN_VARIANT,
} from '@shotledger/shared/src/compliance/profiles/se';
import type { AccountSettings } from '@shotledger/shared/src/sync-client/account-settings';
import { describe, expect, it } from 'vitest';

import {
  birthYearChoices,
  caseView,
  defaultProfile,
  hasChanges,
  initialSettings,
  needsBirthYearConfirm,
  ownershipFacts,
  shownProfile,
} from './model';

const row = (id: string, value: string) => ({
  id,
  value,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
});
const rows = (...list: ReturnType<typeof row>[]) => new Map(list.map((r) => [r.id, r]));

const SET: AccountSettings = {
  birthYear: 1980,
  skillClass: '2',
  competesInWomensClasses: true,
  complianceProfile: 'se',
  complianceProfileVariant: null,
};

describe('the settings form', () => {
  it('U1 opens on the stored values; an unset profile shows the language default; an unset case is derived', () => {
    const stored = rows(
      row('birthYear', '1980'),
      row('skillClass', '"2"'),
      row('competesInWomensClasses', 'true'),
      row('complianceProfile', '"none"'),
      row('complianceProfileVariant', `"${SE_FIRST_HANDGUN_VARIANT}"`),
    );
    expect(initialSettings(stored)).toEqual({
      birthYear: 1980,
      skillClass: '2',
      competesInWomensClasses: true,
      complianceProfile: 'none',
      complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT,
    });
    // An unset profile stays unset in the form (R6); the page shows the default.
    const unset = initialSettings(new Map());
    expect(unset.complianceProfile).toBeNull();
    expect(shownProfile(unset, defaultProfile('sv'))).toBe('se');
    expect(shownProfile(unset, defaultProfile('en'))).toBe('none');
    expect(shownProfile(SET, 'none')).toBe('se');

    // No stored case: the phone's derivation from the firearms, marked as proposed.
    const facts = ownershipFacts(
      new Map([
        ['f1', { id: 'f1', weapon_type: 'pistol', is_own: true }],
        ['f2', { id: 'f2', weapon_type: 'rifle', is_own: 1 }],
      ]),
    );
    expect(facts).toEqual([
      { weaponType: 'pistol', isOwn: true },
      { weaponType: 'rifle', isOwn: true },
    ]);
    expect(caseView(SET, facts, 'none')).toEqual({
      variantIds: [SE_FIRST_HANDGUN_VARIANT, SE_EXISTING_HANDGUN_VARIANT],
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      explicit: false,
      reasonId: 'ownsHandgun',
    });
    expect(ownershipFacts(new Map([['f', { id: 'f', is_own: 0 }]]))).toEqual([
      { weaponType: null, isOwn: false },
    ]);
    // No profile stored: the cases are the shown default's.
    expect(caseView(unset, facts, 'se').variantId).toBe(SE_EXISTING_HANDGUN_VARIANT);
    expect(caseView(unset, facts, 'none').variantIds).toEqual([]);
    // A stored case is the shooter's own.
    expect(
      caseView({ ...SET, complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT }, facts, 'none'),
    ).toMatchObject({ variantId: SE_FIRST_HANDGUN_VARIANT, explicit: true, reasonId: null });
  });

  it('U2 the case picker is offered only when the profile has more than one case', () => {
    expect(caseView({ ...SET, complianceProfile: 'none' }, [], 'se')).toEqual({
      variantIds: [],
      variantId: null,
      explicit: false,
      reasonId: null,
    });
    expect(caseView(SET, [], 'none').variantIds.length).toBeGreaterThan(1);
  });

  it('U3 changing an already-set birth year needs confirmation; setting it the first time does not', () => {
    expect(needsBirthYearConfirm(SET, { ...SET, birthYear: 1981 })).toBe(true);
    expect(needsBirthYearConfirm(SET, { ...SET, skillClass: '3' })).toBe(false);
    const unset = { ...SET, birthYear: null };
    expect(needsBirthYearConfirm(unset, { ...unset, birthYear: 1981 })).toBe(false);
  });

  it('U4 (part) nothing changed is detected per key', () => {
    expect(hasChanges(SET, { ...SET }, 'none')).toBe(false);
    for (const edit of [
      { birthYear: 1981 },
      { skillClass: '3' as const },
      { competesInWomensClasses: false },
      { complianceProfile: 'none' as const },
      { complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT },
    ]) {
      expect(hasChanges(SET, { ...SET, ...edit }, 'none')).toBe(true);
    }
    // Choosing the shown default when none is stored is a change (R6).
    const unset = { ...SET, complianceProfile: null };
    expect(hasChanges(unset, { ...unset, complianceProfile: 'se' }, 'se')).toBe(true);
    // A case changed under a profile with none is not a change: Save stays off (R4).
    expect(
      hasChanges(
        SET,
        { ...SET, complianceProfile: 'none', complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT },
        'none',
      ),
    ).toBe(true);
    const none = { ...SET, complianceProfile: 'none' as const };
    expect(
      hasChanges(none, { ...none, complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT }, 'se'),
    ).toBe(false);
    expect(
      hasChanges(unset, { ...unset, complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT }, 'none'),
    ).toBe(false);
  });

  it('the birth year list is the phone’s, plus a stored year that has aged out of it', () => {
    const years = birthYearChoices(2026, 1980);
    expect(years[0]).toBe(2016);
    expect(years.at(-1)).toBe(1926);
    expect(birthYearChoices(2026, null)).toEqual(years);
    expect(birthYearChoices(2026, 1920).at(-1)).toBe(1920);
    expect(birthYearChoices(2026, 1920)).toHaveLength(92);
  });
});
