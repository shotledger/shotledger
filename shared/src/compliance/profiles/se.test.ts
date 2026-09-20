import { describe, expect, it } from 'vitest';

import type { FirearmOwnershipFact } from '../types';
import {
  deriveSeVariantId,
  SE_REASON_NO_FIREARMS,
  SE_REASON_NO_HANDGUN_ON_FILE,
  SE_REASON_OWNS_HANDGUN,
  SE_EXISTING_HANDGUN_VARIANT,
  SE_FIRST_HANDGUN_VARIANT,
  SE_HANDGUN_WEAPON_TYPES,
} from './se';

const own = (weaponType: string | null): FirearmOwnershipFact => ({ weaponType, isOwn: true });
const borrowed = (weaponType: string | null): FirearmOwnershipFact => ({
  weaponType,
  isOwn: false,
});
describe('deriveSeVariantId', () => {
  it('D1: no firearms at all is the 5 § case', () => {
    expect(deriveSeVariantId([]).variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('D2: an owned pistol is the 6 § case', () => {
    expect(deriveSeVariantId([own('pistol')]).variantId).toBe(SE_EXISTING_HANDGUN_VARIANT);
  });

  it('D3: an owned revolver is the 6 § case', () => {
    expect(deriveSeVariantId([own('revolver')]).variantId).toBe(SE_EXISTING_HANDGUN_VARIANT);
  });

  it('D4: an owned rifle is not an enhandsvapen', () => {
    expect(deriveSeVariantId([own('rifle')]).variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('D5: an owned airgun does not count — the app cannot tell a licensed one apart', () => {
    expect(deriveSeVariantId([own('airgun')]).variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('D6: a borrowed pistol is not held by the shooter', () => {
    expect(deriveSeVariantId([borrowed('pistol')]).variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('D7: an owned firearm with no weapon type recorded keeps the stricter case', () => {
    expect(deriveSeVariantId([own(null)]).variantId).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('D8: one owned handgun among borrowed and non-handgun firearms is enough', () => {
    expect(deriveSeVariantId([borrowed('pistol'), own('rifle'), own('pistol')]).variantId).toBe(
      SE_EXISTING_HANDGUN_VARIANT,
    );
  });

  it('D9: no owned handgun among them stays the 5 § case', () => {
    expect(
      deriveSeVariantId([borrowed('pistol'), own('rifle'), borrowed('revolver')]).variantId,
    ).toBe(SE_FIRST_HANDGUN_VARIANT);
  });

  it('every handgun weapon type derives the 6 § case when owned', () => {
    for (const weaponType of SE_HANDGUN_WEAPON_TYPES) {
      expect(deriveSeVariantId([own(weaponType)]).variantId).toBe(SE_EXISTING_HANDGUN_VARIANT);
    }
  });
});

// #320: Compliance proposed "First Handgun" to a shooter with five handguns,
// because an import carried firearms as a name string with no weapon type and
// no license. The proposal was right given what was on file and unexplainable
// on screen, which is what made it look like a judgement rather than a gap.
describe('deriveSeVariantId reasons (#320)', () => {
  it('D10: no firearms at all is distinguishable from no handgun on file', () => {
    expect(deriveSeVariantId([]).reasonId).toBe(SE_REASON_NO_FIREARMS);
    expect(deriveSeVariantId([own('rifle')]).reasonId).toBe(SE_REASON_NO_HANDGUN_ON_FILE);
  });

  it('D11: the import case — firearms on file, none with a weapon type', () => {
    const imported = [own(null), own(null), own(null), own(null), own(null)];
    expect(deriveSeVariantId(imported)).toEqual({
      variantId: SE_FIRST_HANDGUN_VARIANT,
      reasonId: SE_REASON_NO_HANDGUN_ON_FILE,
    });
  });

  it('D12: an owned handgun explains itself as such', () => {
    expect(deriveSeVariantId([own('pistol')]).reasonId).toBe(SE_REASON_OWNS_HANDGUN);
  });

  it('D13: borrowed handguns only are "no handgun on file", not "no firearms"', () => {
    expect(deriveSeVariantId([borrowed('pistol')]).reasonId).toBe(SE_REASON_NO_HANDGUN_ON_FILE);
  });
});
