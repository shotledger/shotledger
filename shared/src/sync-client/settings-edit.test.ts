import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { getProfileDefinition, PROFILE_SELECTIONS } from '../compliance/profile-registry';
import { SE_EXISTING_HANDGUN_VARIANT, SE_FIRST_HANDGUN_VARIANT } from '../compliance/profiles/se';
import { birthYearOptions, SKILL_CLASSES } from '../disciplines/eligibility';
import { ClientChangeSchema, isSyncableSettingRow, SYNCED_SETTING_KEYS } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import type { Payload } from './rows';
import {
  buildSettingsChanges,
  readAccountSettings,
  type AccountSettings,
  type SettingsDeps,
} from './settings-edit';

const NOW = '2026-10-07T10:00:00.000Z';
const CREATED = '2026-01-01T00:00:00.000Z';

const row = (id: string, value: string): Payload => ({
  id,
  value,
  created_at: CREATED,
  updated_at: CREATED,
  deleted_at: null,
});

const rows = (...list: Payload[]) => new Map(list.map((r) => [String(r.id), r]));

function deps(): SettingsDeps {
  let n = 0;
  return {
    newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
    now: () => NOW,
    currentYear: 2026,
  };
}

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
  it('R1 each key’s JSON text is decoded', () => {
    const pulled = rows(
      row('birthYear', '1980'),
      row('skillClass', '"2"'),
      row('competesInWomensClasses', 'true'),
      row('complianceProfile', '"se"'),
      row('complianceProfileVariant', `"${SE_FIRST_HANDGUN_VARIANT}"`),
    );
    expect(readAccountSettings(pulled)).toEqual(SET);
  });

  it('R2 absent rows read as unset: null, null, false, null, null', () => {
    expect(readAccountSettings(new Map())).toEqual(UNSET);
  });

  it('R3 unparsable, wrong-typed and unknown values read as unset (C7)', () => {
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

  it('R4 a row whose payload id is not its key is ignored', () => {
    const pulled = new Map([['birthYear', row('skillClass', '1980')]]);
    expect(readAccountSettings(pulled)).toEqual(UNSET);
  });
});

describe('building the push', () => {
  it('B1 nothing changed → no changes', () => {
    expect(buildSettingsChanges(SET, { ...SET }, new Map(), deps())).toEqual({
      ok: true,
      changes: [],
    });
    expect(buildSettingsChanges(UNSET, { ...UNSET }, new Map(), deps())).toEqual({
      ok: true,
      changes: [],
    });
  });

  it('B2 one changed key → one settings change', () => {
    const pulled = rows(row('birthYear', '1980'), row('skillClass', '"2"'));
    const result = buildSettingsChanges(SET, { ...SET, skillClass: '3' }, pulled, deps());
    expect(result).toEqual({
      ok: true,
      changes: [
        {
          clientChangeId: '00000000-0000-4000-8000-000000000001',
          tableName: 'settings',
          rowId: 'skillClass',
          payload: {
            id: 'skillClass',
            value: '"3"',
            created_at: CREATED,
            updated_at: NOW,
            deleted_at: null,
          },
          deletedAt: null,
          updatedAt: NOW,
        },
      ],
    });
  });

  it('B3 a key with no pulled row gets created_at = now', () => {
    const result = buildSettingsChanges(UNSET, { ...UNSET, birthYear: 1980 }, new Map(), deps());
    expect(result.ok && result.changes[0]!.payload).toEqual({
      id: 'birthYear',
      value: '1980',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
    });
  });

  it('B4 all five changed → five changes in SYNCED_SETTING_KEYS order, each valid', () => {
    const after: AccountSettings = {
      birthYear: 1975,
      skillClass: '1',
      competesInWomensClasses: false,
      complianceProfile: 'se',
      complianceProfileVariant: SE_EXISTING_HANDGUN_VARIANT,
    };
    const before: AccountSettings = { ...SET, complianceProfile: 'none' };
    const result = buildSettingsChanges(before, after, new Map(), deps());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.changes.map((c) => c.rowId)).toEqual([...SYNCED_SETTING_KEYS]);
    expect(result.changes.map((c) => (c.payload as Payload).value)).toEqual([
      '1975',
      '"1"',
      'false',
      '"se"',
      `"${SE_EXISTING_HANDGUN_VARIANT}"`,
    ]);
    const ids = new Set(result.changes.map((c) => c.clientChangeId));
    expect(ids.size).toBe(5);
    for (const change of result.changes) {
      expect(ClientChangeSchema.safeParse(change).success).toBe(true);
      expect(change.tableName).toBe('settings');
      expect(isSyncableSettingRow(change.rowId, change.payload)).toBe(true);
      const value = (change.payload as Payload).value as string;
      expect(value.length).toBeLessThanOrEqual(TEXT_LIMITS.settings.value);
    }
  });

  it('B5 a value outside the phone’s lists is refused, naming the key; nothing built', () => {
    const refused: [Partial<AccountSettings>, string][] = [
      [{ birthYear: 2017 }, 'birthYear'],
      [{ birthYear: 1925 }, 'birthYear'],
      [{ birthYear: 1980.5 }, 'birthYear'],
      [{ birthYear: null }, 'birthYear'],
      [{ skillClass: '4' as never }, 'skillClass'],
      [{ skillClass: null }, 'skillClass'],
      [{ competesInWomensClasses: 'yes' as never }, 'competesInWomensClasses'],
      [{ complianceProfile: 'xx' as never }, 'complianceProfile'],
      [{ complianceProfile: null }, 'complianceProfile'],
      [{ complianceProfileVariant: 'retired' }, 'complianceProfileVariant'],
      [{ complianceProfileVariant: null }, 'complianceProfileVariant'],
      // A case under 'none', which offers none.
      [
        { complianceProfile: 'none', complianceProfileVariant: SE_EXISTING_HANDGUN_VARIANT },
        'complianceProfileVariant',
      ],
    ];
    for (const [edit, key] of refused) {
      expect(buildSettingsChanges(SET, { ...SET, ...edit }, new Map(), deps()), key).toEqual({
        ok: false,
        errors: [{ key, kind: 'notAllowed' }],
      });
    }
    // The edges of the range are allowed.
    for (const birthYear of [2016, 1926]) {
      expect(buildSettingsChanges(SET, { ...SET, birthYear }, new Map(), deps()).ok).toBe(true);
    }
    // Every invalid key is named.
    expect(
      buildSettingsChanges(SET, { ...SET, birthYear: 1, skillClass: null }, new Map(), deps()),
    ).toEqual({
      ok: false,
      errors: [
        { key: 'birthYear', kind: 'notAllowed' },
        { key: 'skillClass', kind: 'notAllowed' },
      ],
    });
  });

  it('B6 an unchanged value is never validated or written', () => {
    const aged: AccountSettings = { ...SET, birthYear: 1920, complianceProfileVariant: 'retired' };
    const result = buildSettingsChanges(aged, { ...aged, skillClass: '1' }, new Map(), deps());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.changes.map((c) => c.rowId)).toEqual(['skillClass']);
  });

  it('B7 property: exactly the differing keys are pushed, each value round-trips', () => {
    const variants = PROFILE_SELECTIONS.flatMap(
      (selection) => getProfileDefinition(selection)?.variants.map((v) => v.id) ?? [],
    );
    const settings = fc
      .record({
        birthYear: fc.constantFrom(...birthYearOptions(2026)),
        skillClass: fc.constantFrom(...SKILL_CLASSES),
        competesInWomensClasses: fc.boolean(),
        complianceProfile: fc.constantFrom(...PROFILE_SELECTIONS),
        complianceProfileVariant: fc.constantFrom(...variants),
      })
      // A case is only valid under a profile that offers it.
      .filter(
        (s) =>
          getProfileDefinition(s.complianceProfile)?.variants.some(
            (v) => v.id === s.complianceProfileVariant,
          ) ?? false,
      );
    fc.assert(
      fc.property(settings, settings, (before, after) => {
        const result = buildSettingsChanges(before, after, new Map(), deps());
        if (!result.ok) return false;
        const differing = SYNCED_SETTING_KEYS.filter((key) => before[key] !== after[key]);
        expect(result.changes.map((c) => c.rowId)).toEqual(differing);
        for (const change of result.changes) {
          expect(change.deletedAt).toBeNull();
          expect(change.payload).not.toBeNull();
          const payload = change.payload as Payload;
          expect(payload.deleted_at).toBeNull();
          expect(JSON.parse(payload.value as string)).toEqual(
            after[change.rowId as keyof AccountSettings],
          );
        }
        return true;
      }),
    );
  });
});
