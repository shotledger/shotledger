import {
  SE_EXISTING_HANDGUN_VARIANT,
  SE_FIRST_HANDGUN_VARIANT,
  SE_REASON_NO_FIREARMS,
  SE_REASON_NO_HANDGUN_ON_FILE,
  SE_REASON_OWNS_HANDGUN,
} from '@shotledger/shared';

import { resolveComplianceCase } from './resolve-case';

const ownedPistol = { weaponType: 'pistol', isOwn: true };
const borrowedPistol = { weaponType: 'pistol', isOwn: false };

describe('resolveComplianceCase', () => {
  it('C1: no profile means no case', () => {
    expect(resolveComplianceCase('none', null, [ownedPistol])).toEqual({
      variantId: null,
      isExplicit: false,
      reasonId: null,
    });
  });

  it('C2: no stored choice and no owned handgun derives the 5 § case', () => {
    expect(resolveComplianceCase('se', null, [borrowedPistol])).toEqual({
      variantId: SE_FIRST_HANDGUN_VARIANT,
      isExplicit: false,
      reasonId: SE_REASON_NO_HANDGUN_ON_FILE,
    });
  });

  it('C3: no stored choice and an owned handgun derives the 6 § case', () => {
    expect(resolveComplianceCase('se', null, [ownedPistol])).toEqual({
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      isExplicit: false,
      reasonId: SE_REASON_OWNS_HANDGUN,
    });
  });

  it('C4: an explicit choice wins over the derivation, in both directions', () => {
    expect(resolveComplianceCase('se', SE_FIRST_HANDGUN_VARIANT, [ownedPistol])).toEqual({
      variantId: SE_FIRST_HANDGUN_VARIANT,
      isExplicit: true,
      // An explicit choice has nothing to explain — it was not derived.
      reasonId: null,
    });
    expect(resolveComplianceCase('se', SE_EXISTING_HANDGUN_VARIANT, [])).toEqual({
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      isExplicit: true,
      reasonId: null,
    });
  });

  it('C5: a stored id the profile no longer offers falls through to the derivation', () => {
    expect(resolveComplianceCase('se', 'retiredVariant', [ownedPistol])).toEqual({
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      isExplicit: false,
      reasonId: SE_REASON_OWNS_HANDGUN,
    });
    expect(resolveComplianceCase('se', 'retiredVariant', [])).toEqual({
      variantId: SE_FIRST_HANDGUN_VARIANT,
      isExplicit: false,
      reasonId: SE_REASON_NO_FIREARMS,
    });
  });

  // #320: five imported handguns, none with a weapon type, produced the
  // first-handgun case with nothing on screen to say why.
  it('C6: firearms on file but none a handgun reads differently from no firearms', () => {
    const imported = [
      { weaponType: null, isOwn: true },
      { weaponType: null, isOwn: true },
    ];
    expect(resolveComplianceCase('se', null, imported).reasonId).toBe(SE_REASON_NO_HANDGUN_ON_FILE);
    expect(resolveComplianceCase('se', null, []).reasonId).toBe(SE_REASON_NO_FIREARMS);
  });
});
