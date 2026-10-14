import {
  SE_EXISTING_HANDGUN_VARIANT,
  SE_FIRST_HANDGUN_VARIANT,
} from '@shotledger/shared/src/compliance/profiles/se';
import { describe, expect, it } from 'vitest';

import { buildLicenseCheck } from '../../app/src/features/compliance/license-check';
import { getProfile, type ComplianceSession } from '@shotledger/shared/src/compliance';
import { groupIds, licenseCheck, overallLicenseActivity } from './license-activity';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const STAMP = '2026-01-01T00:00:00.000Z';
const base = { created_at: STAMP, updated_at: STAMP, deleted_at: null as string | null };

const setting = (id: string, value: string) => ({ id, value, ...base });

/** `count` training sessions on the wire, one a day, ending today. */
function sessionRows(count: number, prefix = 's') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    ...base,
    started_at: new Date(NOW.getTime() - i * 86_400_000).toISOString(),
    type: 'training',
    weapon_group: 'spsf:C',
    firearm_id: null,
  }));
}

const byId = <T extends { id: string }>(list: T[]) =>
  new Map<string, Record<string, unknown>>(list.map((r) => [r.id, r]));

function tables({
  licenses = [] as Record<string, unknown>[],
  sessions = sessionRows(6),
  settings = [setting('complianceProfile', '"se"')],
  firearms = [] as Record<string, unknown>[],
  groups = [{ id: 'g1', ...base, firearm_id: 'f1', group_id: 'spsf:C' }] as Record<
    string,
    unknown
  >[],
} = {}) {
  return {
    sessions: byId(sessions),
    settings: byId(settings),
    firearms: byId(firearms as { id: string }[]),
    firearm_groups: byId(groups as { id: string }[]),
    licenses: byId(licenses as { id: string }[]),
  };
}

const statusOf = (...args: Parameters<typeof overallLicenseActivity>) =>
  overallLicenseActivity(...args)?.status ?? null;

describe('the overall license activity on the web', () => {
  it('is nothing while no profile is stored, or the profile is none', () => {
    expect(statusOf(tables({ settings: [] }), NOW)).toBeNull();
    expect(
      statusOf(tables({ settings: [setting('complianceProfile', '"none"')] }), NOW),
    ).toBeNull();
  });

  it('follows the stored case: six sessions are on track under 6 §, behind under 5 §', () => {
    const under = (variant: string) =>
      statusOf(
        tables({
          settings: [
            setting('complianceProfile', '"se"'),
            setting('complianceProfileVariant', `"${variant}"`),
          ],
        }),
        NOW,
      );
    expect(under(SE_EXISTING_HANDGUN_VARIANT)).toBe('green');
    // On track, it also says until when, as the phone's Home line does (#795).
    const green = overallLicenseActivity(
      tables({
        settings: [
          setting('complianceProfile', '"se"'),
          setting('complianceProfileVariant', `"${SE_EXISTING_HANDGUN_VARIANT}"`),
        ],
      }),
      NOW,
    );
    expect(green?.lapseIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(under(SE_FIRST_HANDGUN_VARIANT)).toBe('amber');
  });

  it('derives the case from live firearms when none is stored, as the phone does', () => {
    const ownPistol = { id: 'f1', ...base, weapon_type: 'pistol', is_own: 1 };
    // Owning a handgun proposes 6 §: six sessions are on track.
    expect(statusOf(tables({ firearms: [ownPistol] }), NOW)).toBe('green');
    // The same firearm deleted proposes 5 §: six is behind.
    expect(
      statusOf(
        tables({ firearms: [{ ...ownPistol, deleted_at: '2026-02-01T00:00:00.000Z' }] }),
        NOW,
      ),
    ).toBe('amber');
  });

  it('counts only live sessions', () => {
    const variant = setting('complianceProfileVariant', `"${SE_EXISTING_HANDGUN_VARIANT}"`);
    const settings = [setting('complianceProfile', '"se"'), variant];
    const deleted = sessionRows(1, 'd').map((r) => ({ ...r, deleted_at: STAMP }));
    expect(statusOf(tables({ settings, sessions: [...sessionRows(5), ...deleted] }), NOW)).toBe(
      'amber',
    );
  });
});

describe('the overall license activity and Settings → Features', () => {
  it("is nothing while license activity is hidden, as on the phone's Home", () => {
    const settings = [
      setting('complianceProfile', '"se"'),
      setting('showLicenseActivity', 'false'),
    ];
    expect(statusOf(tables({ settings }), NOW)).toBeNull();
    const shown = [setting('complianceProfile', '"se"'), setting('showLicenseActivity', 'true')];
    expect(statusOf(tables({ settings: shown }), NOW)).not.toBeNull();
  });
});

describe('the License Check on the web (#796)', () => {
  const variant = setting('complianceProfileVariant', `"${SE_EXISTING_HANDGUN_VARIANT}"`);
  const settings = [setting('complianceProfile', '"se"'), variant];
  const firearm = (id: string, make: string, model: string, extra = {}) => ({
    id,
    ...base,
    make,
    model,
    weapon_type: 'pistol',
    is_own: 1,
    archived_at: null,
    ...extra,
  });
  const license = (id: string, firearmId: string, validUntil: string | null, extra = {}) => ({
    id,
    ...base,
    firearm_id: firearmId,
    valid_until: validUntil,
    ...extra,
  });

  it('is nothing without a profile, as the phone shows its "off" card', () => {
    expect(licenseCheck(tables({ settings: [] }), NOW)).toBeNull();
    expect(
      licenseCheck(tables({ settings: [setting('complianceProfile', '"none"')] }), NOW),
    ).toBeNull();
  });

  it("builds the phone's check from the active firearms, by make, with their latest license", () => {
    const rows = tables({
      settings,
      firearms: [
        firearm('f2', 'Walther', ' GSP'),
        firearm('f1', 'CZ', 'Shadow 2', { weapon_type: 'revolver', is_own: 0 }),
        firearm('f3', 'Archived', 'Old', { archived_at: '2026-05-01' }),
        firearm('f4', 'Deleted', 'Gone', { deleted_at: STAMP }),
      ],
      // The archived firearm's group is not the shooter's, as on the phone
      // (`listAllFirearmGroupIds`).
      groups: [
        { id: 'g1', ...base, firearm_id: 'f1', group_id: 'spsf:C' },
        { id: 'g3', ...base, firearm_id: 'f3', group_id: 'spsf:B' },
      ],
      licenses: [
        // f2: the latest (highest time-ordered id) has an end date; an older one did not.
        license('0190-a', 'f2', null),
        license('0190-b', 'f2', '2030-01-01'),
        // f1: the latest live one is "tills vidare"; a later deleted one is ignored.
        license('0190-c', 'f1', null),
        license('0190-d', 'f1', '2031-01-01', { deleted_at: STAMP }),
      ],
    });
    const profile = getProfile('se', SE_EXISTING_HANDGUN_VARIANT)!;
    const sessions = sessionRows(6).map((r): ComplianceSession => ({
      id: r.id,
      startedAt: r.started_at,
      type: 'training',
      weaponGroup: r.weapon_group,
      firearmId: r.firearm_id,
    }));
    const expected = buildLicenseCheck(
      sessions,
      profile,
      ['spsf:C'],
      [
        {
          name: 'CZ Shadow 2',
          fact: { id: 'f1', weaponType: 'revolver', isOwn: false, hasTimeLimitedPermit: false },
        },
        {
          name: 'Walther  GSP',
          fact: { id: 'f2', weaponType: 'pistol', isOwn: true, hasTimeLimitedPermit: true },
        },
      ],
      NOW,
    );
    const check = licenseCheck(rows, NOW);
    expect(check).toEqual(expected);
    expect(check!.firearms.map((f) => f.id)).toEqual(['f1', 'f2']);
    // Only the time-limited permit has a renewal box.
    expect(check!.renewal.map((r) => r.firearmId)).toEqual(['f2']);
  });
});

describe("the shooter's weapon groups on the web", () => {
  it('come only from live, unarchived firearms, as listAllFirearmGroupIds', () => {
    const firearm = (id: string, extra = {}) => ({ id, ...base, archived_at: null, ...extra });
    const group = (id: string, firearmId: string, groupId: string, extra = {}) => ({
      id,
      ...base,
      firearm_id: firearmId,
      group_id: groupId,
      ...extra,
    });
    const rows = tables({
      firearms: [
        firearm('f1'),
        firearm('f2', { archived_at: '2026-05-01' }),
        firearm('f3', { deleted_at: STAMP }),
      ],
      groups: [
        group('g1', 'f1', 'spsf:C'),
        group('g2', 'f1', 'spsf:C'),
        group('g3', 'f1', 'spsf:A', { deleted_at: STAMP }),
        group('g4', 'f2', 'spsf:B'),
        group('g5', 'f3', 'spsf:R'),
        group('g6', 'gone', 'spsf:M'),
      ],
    });
    expect(groupIds(rows)).toEqual(['spsf:C']);
  });
});
