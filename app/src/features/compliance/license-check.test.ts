import { getProfile, type ComplianceSession } from '@shotledger/shared';

import { buildLicenseCheck, type LicenseCheckFirearm } from './license-check';

const NOW = new Date('2026-10-13T12:00:00Z');

function at(day: string, firearmId: string | null = null): ComplianceSession {
  return { id: `${day}-${firearmId}`, startedAt: `${day}T00:00:00Z`, type: 'training', firearmId };
}

const pistol: LicenseCheckFirearm = {
  name: 'Demo Pistol',
  fact: { id: 'p', weaponType: 'pistol', isOwn: true, hasTimeLimitedPermit: false },
};
const rifle: LicenseCheckFirearm = {
  name: 'Demo Rifle',
  fact: { id: 'r', weaponType: 'rifle', isOwn: true, hasTimeLimitedPermit: true },
};

describe('buildLicenseCheck', () => {
  const profile = getProfile('se', 'existingHandgun')!;

  it('groups the criteria by purpose and covers only the firearms they apply to', () => {
    const check = buildLicenseCheck([], profile, [], [pistol, rifle], NOW);
    expect(check.purchase.map((c) => [c.criterion.criterionId, c.firearmId])).toEqual([
      ['additionalHandgun', 'p'],
    ]);
    expect(check.renewal.map((c) => [c.criterion.criterionId, c.firearmId])).toEqual([
      ['renewal', 'r'],
    ]);
  });

  it('a met rule carries its lapse and needs nothing; an unmet one says how many', () => {
    const six = [
      '2026-10-01',
      '2026-09-01',
      '2026-08-01',
      '2026-07-10',
      '2026-06-10',
      '2026-05-10',
    ];
    const met = buildLicenseCheck(
      six.map((d) => at(d)),
      profile,
      [],
      [],
      NOW,
    ).rules[0]!;
    expect(met.needed).toBe(0);
    // Local midnight starting the first day it is no longer met (#816).
    expect(met.lapseIso).toBe(new Date(2026, 10, 11).toISOString());

    const short = buildLicenseCheck(
      six.slice(0, 4).map((d) => at(d)),
      profile,
      [],
      [],
      NOW,
    ).rules[0]!;
    expect(short.needed).toBe(2);
    expect(short.lapseIso).toBeNull();
  });

  it('a criterion carries its shortfall and lapse', () => {
    const check = buildLicenseCheck(
      [at('2026-08-01', 'p'), at('2026-09-01', 'p')],
      profile,
      [],
      [pistol],
      NOW,
    );
    expect(check.purchase[0]!.criterion.met).toBe(true);
    expect(check.purchase[0]!.lapseIso).toBe(new Date(2027, 1, 2).toISOString());
    expect(check.purchase[0]!.shortfall.recentNeeded).toBe(0);
  });

  it('defaults now to the current time', () => {
    expect(buildLicenseCheck([], profile, [], []).rules).toHaveLength(1);
  });
});
