import {
  isFirearmIncomplete,
  missingFirearmFields,
  type FirearmCompletenessInput,
} from './completeness';

function firearm(overrides: Partial<FirearmCompletenessInput> = {}): FirearmCompletenessInput {
  return { weaponType: 'pistol', caliber: '.22LR', hasLicense: true, ...overrides };
}

describe('missingFirearmFields', () => {
  it('C1: a fully recorded firearm is missing nothing', () => {
    expect(missingFirearmFields(firearm())).toEqual([]);
  });

  // The exact shape an import produces: split a name on the first space, and
  // nothing else (#320).
  it('C2: an imported firearm is missing all three', () => {
    const imported = firearm({ weaponType: null, caliber: null, hasLicense: false });
    expect(missingFirearmFields(imported)).toEqual(['weaponType', 'caliber', 'license']);
  });

  it('C3: a whitespace-only caliber counts as missing', () => {
    expect(missingFirearmFields(firearm({ caliber: '   ' }))).toEqual(['caliber']);
  });

  it('C4: an empty-string weapon type counts as missing', () => {
    expect(missingFirearmFields(firearm({ weaponType: '' }))).toEqual(['weaponType']);
  });

  it('C5: the order is stable, so the prompt reads the same every time', () => {
    const missing = missingFirearmFields(firearm({ caliber: null, weaponType: null }));
    expect(missing).toEqual(['weaponType', 'caliber']);
  });
});

describe('isFirearmIncomplete', () => {
  it('C6: an owned firearm with no license is incomplete', () => {
    expect(isFirearmIncomplete({ ...firearm({ hasLicense: false }), isOwn: true })).toBe(true);
  });

  // Telling a shooter to add paperwork for a club gun would be wrong.
  it('C7: a borrowed firearm with no license is NOT incomplete on that basis', () => {
    expect(isFirearmIncomplete({ ...firearm({ hasLicense: false }), isOwn: false })).toBe(false);
  });

  it('C8: a borrowed firearm is still incomplete when the weapon type is missing', () => {
    expect(
      isFirearmIncomplete({ ...firearm({ weaponType: null, hasLicense: false }), isOwn: false }),
    ).toBe(true);
  });

  it('C9: a complete owned firearm is not flagged', () => {
    expect(isFirearmIncomplete({ ...firearm(), isOwn: true })).toBe(false);
  });
});
