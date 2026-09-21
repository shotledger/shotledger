import {
  isFirearmIncomplete,
  missingFirearmFields,
  requiresLicense,
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

// #365: an effektbegränsat air weapon needs no licence in Sweden, and the
// maintainer's own 10 m air pistol sat flagged as incomplete with nothing they
// could do about it.
describe('licence-free weapon types', () => {
  it('C10: an airgun requires no licence; everything else does', () => {
    expect(requiresLicense('airgun')).toBe(false);
    for (const type of ['pistol', 'revolver', 'rifle']) {
      expect(requiresLicense(type)).toBe(true);
    }
  });

  it('C11: an unknown weapon type still requires one — the app cannot tell yet', () => {
    expect(requiresLicense(null)).toBe(true);
    expect(requiresLicense('')).toBe(true);
  });

  it('C12: an airgun with no licence is missing nothing', () => {
    expect(missingFirearmFields(firearm({ weaponType: 'airgun', hasLicense: false }))).toEqual([]);
  });

  it('C13: an owned airgun with no licence is NOT incomplete', () => {
    expect(
      isFirearmIncomplete({ ...firearm({ weaponType: 'airgun', hasLicense: false }), isOwn: true }),
    ).toBe(false);
  });

  it('C14: an airgun is still incomplete when the caliber is missing', () => {
    expect(
      isFirearmIncomplete({
        ...firearm({ weaponType: 'airgun', caliber: null, hasLicense: false }),
        isOwn: true,
      }),
    ).toBe(true);
  });

  it('C15: a cartridge firearm with no licence is unaffected by the exemption', () => {
    expect(missingFirearmFields(firearm({ hasLicense: false }))).toEqual(['license']);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_APP_001
 */
it('does not report an air weapon as missing a licence', () => {
  expect(requiresLicense('airgun')).toBe(false);
  expect(missingFirearmFields(firearm({ weaponType: 'airgun', hasLicense: false }))).toEqual([]);
  expect(missingFirearmFields(firearm({ weaponType: 'pistol', hasLicense: false }))).toEqual([
    'license',
  ]);
});
