import { getProfile, type ComplianceSession } from '@shotledger/shared';

import {
  buildLicenseCheck,
  firearmSummaries,
  newFirearmSummary,
  type LicenseCheckFirearm,
} from './license-check';

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

describe('newFirearmSummary', () => {
  const profile = getProfile('se', 'existingHandgun')!;
  const six = ['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-10', '2026-06-10', '2026-05-10'];

  it('is ready when the rule and every additional-handgun box are met, with the earliest lapse', () => {
    const summary = newFirearmSummary(
      buildLicenseCheck(
        six.map((d) => at(d, 'p')),
        profile,
        [],
        [pistol],
        NOW,
      ),
    );
    expect(summary.ready).toBe(true);
    expect(summary.unmet).toBe(0);
    // The rule lapses on 11 November; the pistol box (two in six months) later.
    expect(summary.lapseIso).toBe(new Date(2026, 10, 11).toISOString());
  });

  it('counts each unmet rule and box, and gives no date', () => {
    const summary = newFirearmSummary(
      buildLicenseCheck([at('2026-10-01')], profile, [], [pistol], NOW),
    );
    expect(summary).toEqual({ ready: false, unmet: 2, lapseIso: null });
  });

  it('is not ready when only the additional-handgun box is short', () => {
    const summary = newFirearmSummary(
      buildLicenseCheck(
        six.map((d) => at(d)),
        profile,
        [],
        [pistol],
        NOW,
      ),
    );
    expect(summary).toEqual({ ready: false, unmet: 1, lapseIso: null });
  });

  it('with no rule and no box has nothing to lapse', () => {
    const check = buildLicenseCheck([], profile, [], [], NOW);
    expect(newFirearmSummary({ ...check, rules: [] })).toEqual({
      ready: true,
      unmet: 0,
      lapseIso: null,
    });
  });
});

describe('firearmSummaries', () => {
  const profile = getProfile('se', 'existingHandgun')!;

  it('lists every firearm in order with the boxes that apply to it', () => {
    const summaries = firearmSummaries(buildLicenseCheck([], profile, [], [rifle, pistol], NOW));
    expect(
      summaries.map((s) => [
        s.id,
        s.name,
        s.renewal?.criterion.criterionId ?? null,
        s.purchase?.criterion.criterionId ?? null,
      ]),
    ).toEqual([
      ['r', 'Demo Rifle', 'renewal', null],
      ['p', 'Demo Pistol', null, 'additionalHandgun'],
    ]);
  });
});
