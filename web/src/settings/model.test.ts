import {
  SE_EXISTING_HANDGUN_VARIANT,
  SE_FIRST_HANDGUN_VARIANT,
} from '@shotledger/shared/src/compliance/profiles/se';
import type { AccountSettings } from '@shotledger/shared/src/sync-client/account-settings';
import { describe, expect, it } from 'vitest';

import {
  birthYearChoices,
  caseView,
  hasChanges,
  initialSettings,
  needsBirthYearConfirm,
  ownershipFacts,
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
  showLicenseActivity: true,
  showPhotos: true,
  showTimer: true,
  showSightSettings: true,
  showAmmoLots: true,
  showMaintenance: true,
};

describe('the settings form', () => {
  it('U1 opens on the stored values; an unset profile stays unset and shows no case; an unset case is derived', () => {
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
      showLicenseActivity: true,
      showPhotos: true,
      showTimer: true,
      showSightSettings: true,
      showAmmoLots: true,
      showMaintenance: true,
    });
    // An unset profile stays unset in the form: nothing is highlighted (R13).
    const unset = initialSettings(new Map());
    expect(unset.complianceProfile).toBeNull();

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
    expect(caseView(SET, facts)).toEqual({
      variantIds: [SE_FIRST_HANDGUN_VARIANT, SE_EXISTING_HANDGUN_VARIANT],
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      explicit: false,
      reasonId: 'ownsHandgun',
    });
    expect(ownershipFacts(new Map([['f', { id: 'f', is_own: 0 }]]))).toEqual([
      { weaponType: null, isOwn: false },
    ]);
    // As the phone's listFirearmOwnershipFacts: an archived firearm is no
    // longer one the shooter has (#799).
    expect(
      ownershipFacts(
        new Map([
          ['f1', { id: 'f1', weapon_type: 'pistol', is_own: 1, archived_at: '2026-10-01' }],
          ['f2', { id: 'f2', weapon_type: 'rifle', is_own: 1, archived_at: null }],
        ]),
      ),
    ).toEqual([{ weaponType: 'rifle', isOwn: true }]);
    // No profile stored: no case, derived or stored, until a profile is chosen (R13).
    const noCase = { variantIds: [], variantId: null, explicit: false, reasonId: null };
    expect(caseView(unset, facts)).toEqual(noCase);
    expect(
      caseView({ ...unset, complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT }, facts),
    ).toEqual(noCase);
    // A stored case is the shooter's own.
    expect(
      caseView({ ...SET, complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT }, facts),
    ).toMatchObject({ variantId: SE_FIRST_HANDGUN_VARIANT, explicit: true, reasonId: null });
  });

  it('U2 the case picker is offered only when the profile has more than one case', () => {
    expect(caseView({ ...SET, complianceProfile: 'none' }, [])).toEqual({
      variantIds: [],
      variantId: null,
      explicit: false,
      reasonId: null,
    });
    expect(caseView(SET, []).variantIds.length).toBeGreaterThan(1);
  });

  it('U3 changing an already-set birth year needs confirmation; setting it the first time does not', () => {
    expect(needsBirthYearConfirm(SET, { ...SET, birthYear: 1981 })).toBe(true);
    expect(needsBirthYearConfirm(SET, { ...SET, skillClass: '3' })).toBe(false);
    const unset = { ...SET, birthYear: null };
    expect(needsBirthYearConfirm(unset, { ...unset, birthYear: 1981 })).toBe(false);
  });

  it('U4 (part) nothing changed is detected per key', () => {
    expect(hasChanges(SET, { ...SET })).toBe(false);
    for (const edit of [
      { birthYear: 1981 },
      { skillClass: '3' as const },
      { competesInWomensClasses: false },
      { complianceProfile: 'none' as const },
      { complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT },
      // The feature switches (#801 W1).
      { showLicenseActivity: false },
      { showPhotos: false },
      { showTimer: false },
      { showSightSettings: false },
      { showAmmoLots: false },
      { showMaintenance: false },
    ]) {
      expect(hasChanges(SET, { ...SET, ...edit })).toBe(true);
    }
    // Choosing a profile when none is stored is a change (R6).
    const unset = { ...SET, complianceProfile: null };
    expect(hasChanges(unset, { ...unset, complianceProfile: 'se' })).toBe(true);
    expect(hasChanges(unset, { ...unset, complianceProfile: 'none' })).toBe(true);
    // A case changed under a profile with none is not a change: Save stays off (R4).
    expect(
      hasChanges(SET, {
        ...SET,
        complianceProfile: 'none',
        complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT,
      }),
    ).toBe(true);
    const none = { ...SET, complianceProfile: 'none' as const };
    expect(hasChanges(none, { ...none, complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT })).toBe(
      false,
    );
    // Nor with no profile stored, even a case Sweden offers (R13).
    expect(
      hasChanges(unset, { ...unset, complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT }),
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
