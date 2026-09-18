import { SE_EXISTING_HANDGUN_VARIANT, SE_FIRST_HANDGUN_VARIANT } from '@shotledger/shared';

import { resolveComplianceCase } from './resolve-case';

const ownedPistol = { weaponType: 'pistol', isOwn: true };
const borrowedPistol = { weaponType: 'pistol', isOwn: false };

describe('resolveComplianceCase', () => {
  it('C1: no profile means no case', () => {
    expect(resolveComplianceCase('none', null, [ownedPistol])).toEqual({
      variantId: null,
      isExplicit: false,
    });
  });

  it('C2: no stored choice and no owned handgun derives the 5 § case', () => {
    expect(resolveComplianceCase('se', null, [borrowedPistol])).toEqual({
      variantId: SE_FIRST_HANDGUN_VARIANT,
      isExplicit: false,
    });
  });

  it('C3: no stored choice and an owned handgun derives the 6 § case', () => {
    expect(resolveComplianceCase('se', null, [ownedPistol])).toEqual({
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      isExplicit: false,
    });
  });

  it('C4: an explicit choice wins over the derivation, in both directions', () => {
    expect(resolveComplianceCase('se', SE_FIRST_HANDGUN_VARIANT, [ownedPistol])).toEqual({
      variantId: SE_FIRST_HANDGUN_VARIANT,
      isExplicit: true,
    });
    expect(resolveComplianceCase('se', SE_EXISTING_HANDGUN_VARIANT, [])).toEqual({
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      isExplicit: true,
    });
  });

  it('C5: a stored id the profile no longer offers falls through to the derivation', () => {
    expect(resolveComplianceCase('se', 'retiredVariant', [ownedPistol])).toEqual({
      variantId: SE_EXISTING_HANDGUN_VARIANT,
      isExplicit: false,
    });
    expect(resolveComplianceCase('se', 'retiredVariant', [])).toEqual({
      variantId: SE_FIRST_HANDGUN_VARIANT,
      isExplicit: false,
    });
  });
});
