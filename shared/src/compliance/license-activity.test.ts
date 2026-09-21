import { describe, expect, it } from 'vitest';

import {
  computeLicenseActivityForWeaponGroup,
  computeFirearmLicenseActivity,
  computeOverallLicenseActivity,
  computeRuleLicenseActivity,
  worstStatus,
} from './license-activity';
import type {
  ComplianceRule,
  ComplianceSession,
  JurisdictionProfile,
  ShooterComplianceRule,
  WeaponGroupComplianceRule,
} from './types';

const NOW = new Date('2026-09-01T00:00:00Z');

function rule(overrides: Partial<WeaponGroupComplianceRule> = {}): WeaponGroupComplianceRule {
  return {
    scope: 'weaponGroups',
    weaponGroups: ['spsf:C'],
    windowMonths: 6,
    requiredActivities: 4,
    countsAs: { training: 1, competition: 1 },
    ...overrides,
  };
}

/** A FAP 551-3 5–6 §§-shaped rule: on the shooter, not on a vapengrupp. */
function shooterRule(overrides: Partial<ShooterComplianceRule> = {}): ShooterComplianceRule {
  return {
    scope: 'shooter',
    windowMonths: 6,
    requiredActivities: 4,
    countsAs: { training: 1, competition: 1 },
    ...overrides,
  };
}

function session(overrides: Partial<ComplianceSession>): ComplianceSession {
  return {
    id: 'session-1',
    startedAt: '2026-08-01T00:00:00Z',
    type: 'training',
    weaponGroup: 'spsf:C',
    ...overrides,
  };
}

function profile(rules: ComplianceRule[]): JurisdictionProfile {
  return {
    id: 'se',
    name: { sv: 'x', en: 'x' },
    variantId: 'test',
    rules,
    firearmCriteria: [],
    source: 'test',
    verified: false,
  };
}

describe('computeRuleLicenseActivity', () => {
  it('B1: no sessions -> red', () => {
    const result = computeRuleLicenseActivity([], rule(), NOW);
    expect(result.activityCount).toBe(0);
    expect(result.status).toBe('red');
  });

  it('B2: requiredActivities <= 0 -> always green', () => {
    const result = computeRuleLicenseActivity([], rule({ requiredActivities: 0 }), NOW);
    expect(result.status).toBe('green');
  });

  it('B3: sessions in window with weight 1 each count', () => {
    const sessions = [session({ id: 'a' }), session({ id: 'b' })];
    const result = computeRuleLicenseActivity(sessions, rule(), NOW);
    expect(result.activityCount).toBe(2);
  });

  it('B4: session before window excluded', () => {
    const result = computeRuleLicenseActivity(
      [session({ startedAt: '2026-01-01T00:00:00Z' })],
      rule(),
      NOW,
    );
    expect(result.activityCount).toBe(0);
  });

  it('B5: session exactly at now included', () => {
    const result = computeRuleLicenseActivity(
      [session({ startedAt: NOW.toISOString() })],
      rule(),
      NOW,
    );
    expect(result.activityCount).toBe(1);
  });

  it('B6: session exactly at windowStart included', () => {
    const result = computeRuleLicenseActivity(
      [session({ startedAt: '2026-03-01T00:00:00Z' })],
      rule(),
      NOW,
    );
    expect(result.windowStartIso).toBe('2026-03-01T00:00:00.000Z');
    expect(result.activityCount).toBe(1);
  });

  it('B7: session one instant before windowStart excluded', () => {
    const result = computeRuleLicenseActivity(
      [session({ startedAt: '2026-02-28T23:59:59.999Z' })],
      rule(),
      NOW,
    );
    expect(result.activityCount).toBe(0);
  });

  it('distinguishes training weight from competition weight by session.type', () => {
    const trainingSession = session({ type: 'training' });
    const result = computeRuleLicenseActivity(
      [trainingSession],
      rule({ countsAs: { training: 1, competition: 0 } }),
      NOW,
    );
    expect(result.activityCount).toBe(1);
  });

  it('B8: weight 0 excludes that session type', () => {
    const sessions = [session({ type: 'competition' })];
    const result = computeRuleLicenseActivity(
      sessions,
      rule({ countsAs: { training: 1, competition: 0 } }),
      NOW,
    );
    expect(result.activityCount).toBe(0);
  });

  it('a session after `now` (future) is excluded', () => {
    const result = computeRuleLicenseActivity(
      [session({ startedAt: '2026-09-15T00:00:00Z' })],
      rule(),
      NOW,
    );
    expect(result.activityCount).toBe(0);
  });

  it('B9: two sessions same day both count', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-08-01T08:00:00Z' }),
      session({ id: 'b', startedAt: '2026-08-01T18:00:00Z' }),
    ];
    const result = computeRuleLicenseActivity(sessions, rule(), NOW);
    expect(result.activityCount).toBe(2);
  });

  it.each([
    [4, 'green'],
    [2, 'amber'],
    [1, 'red'],
  ] as const)('B10-B12: count=%i -> %s (required=4)', (count, expected) => {
    const sessions = Array.from({ length: count }, (_, i) => session({ id: `s${i}` }));
    const result = computeRuleLicenseActivity(sessions, rule(), NOW);
    expect(result.status).toBe(expected);
  });
});

describe('computeLicenseActivityForWeaponGroup', () => {
  it('B13: session with a weapon group outside the rule excluded', () => {
    const result = computeLicenseActivityForWeaponGroup(
      [session({ weaponGroup: 'spsf:B' })],
      profile([rule()]),
      'spsf:C',
      NOW,
    );
    expect(result?.activityCount).toBe(0);
  });

  it('B14: no matching rule returns null', () => {
    const result = computeLicenseActivityForWeaponGroup([], profile([rule()]), 'spsf:Z', NOW);
    expect(result).toBeNull();
  });
});

describe('computeFirearmLicenseActivity', () => {
  it('B15: matched by weaponGroup membership, not firearm_id', () => {
    const sessions = [session({ weaponGroup: 'spsf:C' })];
    const result = computeFirearmLicenseActivity(sessions, profile([rule()]), ['spsf:C'], NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.activityCount).toBe(1);
  });

  it('B16: two groups covered by two rules yields two statuses', () => {
    const p = profile([
      rule({ weaponGroups: ['spsf:C'] }),
      rule({ weaponGroups: ['spsf:B'], requiredActivities: 2 }),
    ]);
    const result = computeFirearmLicenseActivity([], p, ['spsf:C', 'spsf:B'], NOW);
    expect(result).toHaveLength(2);
  });

  it('does not double-count a group covered twice by the same rule', () => {
    const p = profile([rule({ weaponGroups: ['spsf:C', 'spsf:B'] })]);
    const result = computeFirearmLicenseActivity([], p, ['spsf:C', 'spsf:B'], NOW);
    expect(result).toHaveLength(1);
  });
});

describe('computeOverallLicenseActivity', () => {
  it('B17: overall is worst of the matched rules', () => {
    const p = profile([
      rule({ weaponGroups: ['spsf:C'], requiredActivities: 1 }),
      rule({ weaponGroups: ['spsf:B'], requiredActivities: 10 }),
    ]);
    const sessions = [session({ weaponGroup: 'spsf:C' })];
    const result = computeOverallLicenseActivity(sessions, p, ['spsf:C', 'spsf:B'], NOW);
    expect(result.overall).toBe('red'); // spsf:B has 0/10 -> red
  });

  it('B18: no weapon groups requested returns empty, no fabricated status', () => {
    const result = computeOverallLicenseActivity([], profile([rule()]), [], NOW);
    expect(result).toEqual({ statuses: [], overall: null });
  });

  it('does not double-count a weapon group requested twice', () => {
    const result = computeOverallLicenseActivity([], profile([rule()]), ['spsf:C', 'spsf:C'], NOW);
    expect(result.statuses).toHaveLength(1);
  });
});

describe('computeRuleLicenseActivity weaponGroup fallback', () => {
  it('a session with no weaponGroup never matches a rule requiring a real group', () => {
    const result = computeRuleLicenseActivity([session({ weaponGroup: undefined })], rule(), NOW);
    expect(result.activityCount).toBe(0);
  });

  it("falls back to '' for a missing weaponGroup, matching a rule that lists ''", () => {
    const result = computeRuleLicenseActivity(
      [session({ weaponGroup: undefined })],
      rule({ weaponGroups: [''] }),
      NOW,
    );
    expect(result.activityCount).toBe(1);
  });
});

describe('worstStatus', () => {
  it('returns null for empty input', () => {
    expect(worstStatus([])).toBeNull();
  });

  it('orders red < amber < green', () => {
    expect(worstStatus(['green', 'amber'])).toBe('amber');
    expect(worstStatus(['green', 'red', 'amber'])).toBe('red');
    expect(worstStatus(['green', 'green'])).toBe('green');
  });
});

// #319: found by importing 267 real sessions, 142 of them with no vapengrupp.
// A shooter-scope rule is the fix; these pin the behavior that was wrong.
describe('shooter-scope rules (FAP 551-3 5–6 §§)', () => {
  it('S1: counts a session with no weaponGroup at all', () => {
    const result = computeRuleLicenseActivity([session({ weaponGroup: null })], shooterRule(), NOW);
    expect(result.activityCount).toBe(1);
    expect(result.countedSessionCount).toBe(1);
    expect(result.skippedSessionCount).toBe(0);
  });

  it('S2: counts sessions of every weaponGroup alike', () => {
    const sessions = [
      session({ id: 'a', weaponGroup: 'spsf:A' }),
      session({ id: 'b', weaponGroup: 'spsf:C' }),
      session({ id: 'c', weaponGroup: undefined }),
    ];
    const result = computeRuleLicenseActivity(sessions, shooterRule(), NOW);
    expect(result.activityCount).toBe(3);
  });

  it('S3: never reports skipped sessions — by construction it skips none', () => {
    const sessions = [session({ id: 'a', weaponGroup: null }), session({ id: 'b' })];
    const result = computeRuleLicenseActivity(sessions, shooterRule(), NOW);
    expect(result.skippedSessionCount).toBe(0);
    expect(result.scope).toBe('shooter');
    expect(result.weaponGroups).toEqual([]);
  });

  it('S4: still respects the window', () => {
    const sessions = [
      session({ id: 'old', startedAt: '2025-01-01T00:00:00Z' }),
      session({ id: 'in' }),
    ];
    const result = computeRuleLicenseActivity(sessions, shooterRule(), NOW);
    expect(result.activityCount).toBe(1);
  });

  it('S5: applies with no weapon groups on file — the post-import case', () => {
    const sessions = [session({ weaponGroup: null })];
    const result = computeOverallLicenseActivity(sessions, profile([shooterRule()]), [], NOW);
    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0]?.activityCount).toBe(1);
    expect(result.overall).not.toBeNull();
  });

  it('S6: a firearm with no weapon groups still gets the shooter-level status', () => {
    const result = computeFirearmLicenseActivity(
      [session({ weaponGroup: null })],
      profile([shooterRule()]),
      [],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.scope).toBe('shooter');
  });
});

describe('skippedSessionCount (the honesty figure)', () => {
  it('S7: a weaponGroups rule reports what it left out, inside the window only', () => {
    const sessions = [
      session({ id: 'counted', weaponGroup: 'spsf:C' }),
      session({ id: 'other-group', weaponGroup: 'spsf:B' }),
      session({ id: 'no-group', weaponGroup: null }),
      session({ id: 'out-of-window', weaponGroup: 'spsf:B', startedAt: '2025-01-01T00:00:00Z' }),
    ];
    const result = computeRuleLicenseActivity(sessions, rule(), NOW);
    expect(result.countedSessionCount).toBe(1);
    expect(result.skippedSessionCount).toBe(2);
  });

  it('S8: countedSessionCount is unweighted where activityCount is weighted', () => {
    const sessions = [session({ id: 'a', type: 'competition' })];
    const result = computeRuleLicenseActivity(
      sessions,
      rule({ countsAs: { training: 1, competition: 2 } }),
      NOW,
    );
    expect(result.activityCount).toBe(2);
    expect(result.countedSessionCount).toBe(1);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_COMPL_001
 */
it('counts only sessions inside the window, at their training or competition weight', () => {
  const r: ComplianceRule = {
    scope: 'shooter',
    windowMonths: 6,
    requiredActivities: 12,
    countsAs: { training: 1, competition: 2 },
  };
  const sessions: ComplianceSession[] = [
    { id: 'inside-training', startedAt: '2026-08-01T00:00:00Z', type: 'training' },
    { id: 'inside-competition', startedAt: '2026-07-01T00:00:00Z', type: 'competition' },
    // The boundary itself: 2026-03-01T00:00:00Z is the window start and counts.
    { id: 'on-the-boundary', startedAt: '2026-03-01T00:00:00Z', type: 'training' },
    // One millisecond earlier does not.
    { id: 'just-outside', startedAt: '2026-02-28T23:59:59.999Z', type: 'training' },
  ];
  const activity = computeRuleLicenseActivity(sessions, r, NOW);
  expect(activity.activityCount).toBe(4);
  expect(activity.countedSessionCount).toBe(3);
  expect(activity.windowStartIso).toBe('2026-03-01T00:00:00.000Z');
});

/**
 * @SVCs SVC_COMPL_002
 */
it('applies a shooter-scope rule when no firearm has a vapengrupp', () => {
  const profile: JurisdictionProfile = {
    ...({} as JurisdictionProfile),
    rules: [
      {
        scope: 'shooter',
        windowMonths: 6,
        requiredActivities: 12,
        countsAs: { training: 1, competition: 1 },
      },
    ],
  };
  const sessions: ComplianceSession[] = [
    { id: 'a', startedAt: '2026-08-01T00:00:00Z', type: 'training' },
  ];
  const overall = computeOverallLicenseActivity(sessions, profile, [], NOW);
  expect(overall.statuses).toHaveLength(1);
  expect(overall.statuses[0]!.activityCount).toBe(1);
});
