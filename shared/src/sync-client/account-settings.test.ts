import { describe, expect, it } from 'vitest';

import { SE_FIRST_HANDGUN_VARIANT } from '../compliance/profiles/se';
import { readAccountSettings, type AccountSettings } from './account-settings';
import type { Payload } from './rows';

const CREATED = '2026-01-01T00:00:00.000Z';

const row = (id: string, value: string): Payload => ({
  id,
  value,
  created_at: CREATED,
  updated_at: CREATED,
  deleted_at: null,
});

const rows = (...list: Payload[]) => new Map(list.map((r) => [String(r.id), r]));

const UNSET: AccountSettings = {
  birthYear: null,
  skillClass: null,
  competesInWomensClasses: false,
  complianceProfile: null,
  complianceProfileVariant: null,
};

const SET: AccountSettings = {
  birthYear: 1980,
  skillClass: '2',
  competesInWomensClasses: true,
  complianceProfile: 'se',
  complianceProfileVariant: SE_FIRST_HANDGUN_VARIANT,
};

describe('reading the pulled settings rows', () => {
  it('P1 each key’s JSON text is decoded', () => {
    const pulled = rows(
      row('birthYear', '1980'),
      row('skillClass', '"2"'),
      row('competesInWomensClasses', 'true'),
      row('complianceProfile', '"se"'),
      row('complianceProfileVariant', `"${SE_FIRST_HANDGUN_VARIANT}"`),
    );
    expect(readAccountSettings(pulled)).toEqual(SET);
  });

  it('P2 absent rows read as unset: null, null, false, null, null', () => {
    expect(readAccountSettings(new Map())).toEqual(UNSET);
  });

  it('P3 unparsable, wrong-typed and unknown values read as unset', () => {
    const cases: [string, string][] = [
      ['birthYear', '"1980"'],
      ['birthYear', '1980.5'],
      ['birthYear', 'null'],
      ['birthYear', '{'],
      ['skillClass', '"4"'],
      ['skillClass', '2'],
      ['competesInWomensClasses', '"true"'],
      ['competesInWomensClasses', '1'],
      ['complianceProfile', '"xx"'],
      ['complianceProfile', 'true'],
      ['complianceProfileVariant', '7'],
      ['complianceProfileVariant', 'not json'],
    ];
    for (const [key, value] of cases) {
      expect(readAccountSettings(rows(row(key, value))), `${key} ${value}`).toEqual(UNSET);
    }
    // A value that is not a string at all.
    expect(readAccountSettings(rows({ ...row('birthYear', ''), value: 1980 }))).toEqual(UNSET);
    // A stored case is kept as-is; whether it applies is the profile's call.
    expect(readAccountSettings(rows(row('complianceProfileVariant', '"retired"')))).toEqual({
      ...UNSET,
      complianceProfileVariant: 'retired',
    });
  });

  it('P4 a row whose payload id is not its key is ignored', () => {
    const pulled = new Map([['birthYear', row('skillClass', '1980')]]);
    expect(readAccountSettings(pulled)).toEqual(UNSET);
  });
});
