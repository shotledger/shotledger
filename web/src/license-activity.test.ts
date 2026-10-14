import {
  SE_EXISTING_HANDGUN_VARIANT,
  SE_FIRST_HANDGUN_VARIANT,
} from '@shotledger/shared/src/compliance/profiles/se';
import { describe, expect, it } from 'vitest';

import { overallLicenseActivity } from './license-activity';

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
  };
}

describe('the overall license activity on the web', () => {
  it('is nothing while no profile is stored, or the profile is none', () => {
    expect(overallLicenseActivity(tables({ settings: [] }), NOW)).toBeNull();
    expect(
      overallLicenseActivity(tables({ settings: [setting('complianceProfile', '"none"')] }), NOW),
    ).toBeNull();
  });

  it('follows the stored case: six sessions are on track under 6 §, behind under 5 §', () => {
    const under = (variant: string) =>
      overallLicenseActivity(
        tables({
          settings: [
            setting('complianceProfile', '"se"'),
            setting('complianceProfileVariant', `"${variant}"`),
          ],
        }),
        NOW,
      );
    expect(under(SE_EXISTING_HANDGUN_VARIANT)).toBe('green');
    expect(under(SE_FIRST_HANDGUN_VARIANT)).toBe('amber');
  });

  it('derives the case from live firearms when none is stored, as the phone does', () => {
    const ownPistol = { id: 'f1', ...base, weapon_type: 'pistol', is_own: 1 };
    // Owning a handgun proposes 6 §: six sessions are on track.
    expect(overallLicenseActivity(tables({ firearms: [ownPistol] }), NOW)).toBe('green');
    // The same firearm deleted proposes 5 §: six is behind.
    expect(
      overallLicenseActivity(
        tables({ firearms: [{ ...ownPistol, deleted_at: '2026-02-01T00:00:00.000Z' }] }),
        NOW,
      ),
    ).toBe('amber');
  });

  it('counts only live sessions', () => {
    const variant = setting('complianceProfileVariant', `"${SE_EXISTING_HANDGUN_VARIANT}"`);
    const settings = [setting('complianceProfile', '"se"'), variant];
    const deleted = sessionRows(1, 'd').map((r) => ({ ...r, deleted_at: STAMP }));
    expect(
      overallLicenseActivity(tables({ settings, sessions: [...sessionRows(5), ...deleted] }), NOW),
    ).toBe('amber');
  });
});
