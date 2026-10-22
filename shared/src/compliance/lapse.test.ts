// Behaviors L1-L8, C1-C4, O1-O2 and properties P1-P4 of
// docs/specs/compliance-next-session-spec.md.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { computeFirearmCriterion } from './firearm-criteria';
import {
  computeFirearmCriteriaLapses,
  computeFirearmCriterionLapse,
  computeFirearmLicenseLapses,
  computeOverallLapse,
  computeRuleLapse,
} from './lapse';
import { computeRuleLicenseActivity } from './license-activity';
import type {
  ComplianceRule,
  ComplianceSession,
  FirearmComplianceRule,
  FirearmFact,
  JurisdictionProfile,
} from './types';

const NOW = new Date('2026-10-13T12:00:00Z');

/**
 * Local midnight starting the given day, as ISO: every lapse is one since
 * windows count whole local days (#816). Vitest runs in Europe/Stockholm.
 */
function lm(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d).toISOString();
}
const GUN = 'firearm-1';

function rule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
  return {
    scope: 'shooter',
    windowMonths: 6,
    requiredActivities: 6,
    countsAs: { training: 1, competition: 1 },
    ...overrides,
  } as ComplianceRule;
}

function at(startedAt: string, overrides: Partial<ComplianceSession> = {}): ComplianceSession {
  return { id: startedAt, startedAt, type: 'training', firearmId: GUN, ...overrides };
}

function profile(rules: ComplianceRule[]): JurisdictionProfile {
  return {
    id: 'se',
    name: { sv: 'Sverige', en: 'Sweden' },
    variantId: 'test',
    rules,
    firearmCriteria: [],
    source: 'test',
    verified: true,
  };
}

function firearm(overrides: Partial<FirearmFact> = {}): FirearmFact {
  return { id: GUN, weaponType: 'pistol', isOwn: true, hasTimeLimitedPermit: true, ...overrides };
}

/** "Ytterligare enhandsvapen" in shape. */
function additionalRule(overrides: Partial<FirearmComplianceRule> = {}): FirearmComplianceRule {
  return {
    criterionId: 'additional',
    purpose: 'purchase',
    windowMonths: 6,
    windowCount: 1,
    requiredActivities: 2,
    countsAs: { training: 1, competition: 1 },
    appliesTo: () => true,
    ...overrides,
  };
}

/** "Förnyelse" in shape. */
function renewalRule(): FirearmComplianceRule {
  return additionalRule({
    criterionId: 'renewal',
    windowMonths: 12,
    windowCount: 2,
    requiredActivities: 4,
  });
}

describe('computeRuleLapse', () => {
  it('L1: a requirement not met now has no lapse', () => {
    const sessions = ['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01'].map(
      (d) => at(`${d}T00:00:00Z`),
    );
    expect(computeRuleLicenseActivity(sessions, rule(), NOW).status).toBe('amber');
    expect(computeRuleLapse(sessions, rule(), NOW)).toBeNull();
  });

  it("L2: exactly the required count lapses the day after the oldest's last day in", () => {
    const sessions = [
      '2026-10-01T10:00:00Z',
      '2026-09-01T10:00:00Z',
      '2026-08-01T10:00:00Z',
      '2026-07-01T10:00:00Z',
      '2026-06-01T10:00:00Z',
      '2026-05-10T10:00:00Z',
    ].map((d) => at(d));
    expect(computeRuleLapse(sessions, rule(), NOW)).toBe(lm(2026, 11, 11));
  });

  it('L3: the sixth-newest session decides; older ones do not move it', () => {
    const sessions = [
      '2026-10-01T08:00:00Z',
      '2026-09-01T08:00:00Z',
      '2026-08-15T08:00:00Z',
      '2026-08-01T08:00:00Z',
      '2026-07-20T08:00:00Z',
      '2026-07-02T08:00:00Z',
      '2026-06-01T08:00:00Z',
      '2026-05-20T08:00:00Z',
      '2026-05-01T08:00:00Z',
    ].map((d) => at(d));
    expect(computeRuleLapse(sessions, rule(), NOW)).toBe(lm(2027, 1, 3));
  });

  it('L4: a weighted competition keeps it met until the competition itself leaves', () => {
    const weighted = rule({ requiredActivities: 2, countsAs: { training: 1, competition: 2 } });
    const sessions = [
      at('2026-06-10T00:00:00Z', { type: 'competition' }),
      at('2026-09-01T00:00:00Z'),
    ];
    expect(computeRuleLapse(sessions, weighted, NOW)).toBe(lm(2026, 12, 11));
  });

  it('L5: follows the window arithmetic exactly, month-end clamping included', () => {
    const monthly = rule({ windowMonths: 1, requiredActivities: 1 });
    const sessions = [at('2026-03-01T12:00:00Z')];
    const now = new Date('2026-03-15T00:00:00Z');
    // 29-31 March minus one month clamp to 28 February (1930:173), so the
    // session stays in through 1 April and leaves on 2 April.
    expect(computeRuleLapse(sessions, monthly, now)).toBe(lm(2026, 4, 2));
    expect(
      computeRuleLicenseActivity(sessions, monthly, new Date(2026, 3, 1, 23, 59, 59, 999)).status,
    ).toBe('green');
    expect(computeRuleLicenseActivity(sessions, monthly, new Date(2026, 3, 2)).status).toBe('red');
  });

  it('L5: a session on the 1st stays in through the 1st six months later', () => {
    const sessions = [
      '2026-10-01T10:00:00Z',
      '2026-09-01T10:00:00Z',
      '2026-08-01T10:00:00Z',
      '2026-07-01T10:00:00Z',
      '2026-06-01T10:00:00Z',
      '2026-05-01T10:00:00Z',
    ].map((d) => at(d));
    // Oct 31 minus six months clamps to Apr 30, and Nov 1 gives May 1.
    expect(computeRuleLapse(sessions, rule(), NOW)).toBe(lm(2026, 11, 2));
  });

  it('L5: a session on 31 March leaves once the window starts after it', () => {
    const monthly = rule({ windowMonths: 1, requiredActivities: 1 });
    // Apr 30 − 1 month is Mar 30, May 1 − 1 month is Apr 1.
    const sessions = [at('2026-03-31T12:00:00Z')];
    expect(computeRuleLapse(sessions, monthly, new Date('2026-04-15T00:00:00Z'))).toBe(
      lm(2026, 5, 1),
    );
  });

  it('reaches a lapse a full 31-day month after the newest session', () => {
    const monthly = rule({ windowMonths: 1, requiredActivities: 1 });
    const sessions = [at('2026-07-15T12:00:00Z')];
    expect(computeRuleLapse(sessions, monthly, new Date('2026-07-16T00:00:00Z'))).toBe(
      lm(2026, 8, 16),
    );
  });

  it('two sessions on the same day leave together, whatever the session order', () => {
    const two = rule({ requiredActivities: 2 });
    const early = at('2026-06-10T08:00:00Z');
    const late = at('2026-06-10T20:00:00Z');
    expect(computeRuleLapse([late, early], two, NOW)).toBe(lm(2026, 12, 11));
    expect(computeRuleLapse([early, late], two, NOW)).toBe(lm(2026, 12, 11));
  });

  it('L6: a rule requiring nothing never lapses', () => {
    expect(computeRuleLapse([], rule({ requiredActivities: 0 }), NOW)).toBeNull();
  });

  it('L7: sessions the rule does not count do not keep it met', () => {
    const grouped = rule({
      scope: 'weaponGroups',
      weaponGroups: ['spsf:C'],
      requiredActivities: 1,
    });
    const sessions = [
      at('2026-06-01T00:00:00Z', { weaponGroup: 'spsf:C' }),
      at('2026-10-01T00:00:00Z', { weaponGroup: 'spsf:B' }),
    ];
    expect(computeRuleLapse(sessions, grouped, NOW)).toBe(lm(2026, 12, 2));
  });

  it('L8: a future-dated session counts from its own day on', () => {
    const one = rule({ requiredActivities: 1 });
    const sessions = [at('2026-06-01T00:00:00Z'), at('2026-11-01T00:00:00Z')];
    expect(computeRuleLapse(sessions, one, NOW)).toBe(lm(2027, 5, 2));
  });

  it("a session on the window's first day lapses tomorrow", () => {
    const one = rule({ requiredActivities: 1 });
    // The window today starts on this session's day.
    const sessions = [at('2026-04-13T12:00:00Z')];
    expect(computeRuleLapse(sessions, one, NOW)).toBe(lm(2026, 10, 14));
  });

  it('defaults now to the current time', () => {
    const one = rule({ requiredActivities: 1 });
    const lapse = computeRuleLapse([at(new Date().toISOString())], one);
    expect(lapse).not.toBeNull();
    expect(new Date(lapse!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('computeFirearmCriterionLapse', () => {
  it('C1: a criterion not met now has no lapse', () => {
    expect(
      computeFirearmCriterionLapse([at('2026-08-01T00:00:00Z')], additionalRule(), firearm(), NOW),
    ).toBeNull();
  });

  it('C2: two sessions with the firearm lapse when the older one leaves', () => {
    const sessions = [at('2026-07-10T00:00:00Z'), at('2026-08-01T00:00:00Z')];
    expect(computeFirearmCriterionLapse(sessions, additionalRule(), firearm(), NOW)).toBe(
      lm(2027, 1, 11),
    );
  });

  it('C3: renewal lapses on the year that drops below four first — the older year here', () => {
    const sessions = [
      '2024-11-05',
      '2024-12-05',
      '2025-01-05',
      '2025-02-05',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ].map((d) => at(`${d}T00:00:00Z`));
    expect(computeFirearmCriterionLapse(sessions, renewalRule(), firearm(), NOW)).toBe(
      lm(2026, 11, 6),
    );
  });

  it('C3: renewal lapses when a session moves out of the recent year into the older one', () => {
    const sessions = [
      '2025-01-10',
      '2025-02-10',
      '2025-03-10',
      '2025-04-10',
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
    ].map((d) => at(`${d}T00:00:00Z`));
    expect(computeFirearmCriterionLapse(sessions, renewalRule(), firearm(), NOW)).toBe(
      lm(2027, 1, 11),
    );
  });

  it('C4: sessions with another firearm do not keep it met', () => {
    const sessions = [
      at('2026-07-10T00:00:00Z'),
      at('2026-08-01T00:00:00Z'),
      at('2026-09-15T00:00:00Z', { firearmId: 'firearm-2' }),
      at('2026-09-20T00:00:00Z', { firearmId: null }),
    ];
    expect(computeFirearmCriterionLapse(sessions, additionalRule(), firearm(), NOW)).toBe(
      lm(2027, 1, 11),
    );
  });

  it('defaults now to the current time', () => {
    const lapse = computeFirearmCriterionLapse(
      [at(new Date().toISOString()), at(new Date().toISOString())],
      additionalRule(),
      firearm(),
    );
    expect(lapse).not.toBeNull();
  });
});

describe('computeOverallLapse', () => {
  const shooterRule = rule({ requiredActivities: 1 });
  const groupRule = rule({
    scope: 'weaponGroups',
    weaponGroups: ['spsf:C'],
    requiredActivities: 1,
  });

  it('O1: overall not green has no lapse', () => {
    const sessions = [at('2026-09-01T00:00:00Z', { weaponGroup: 'spsf:B' })];
    expect(computeOverallLapse(sessions, profile([shooterRule, groupRule]), ['spsf:C'], NOW)).toBe(
      null,
    );
  });

  it('O2: the earliest lapse among the applicable rules', () => {
    const sessions = [
      at('2026-09-01T00:00:00Z', { weaponGroup: 'spsf:B' }),
      at('2026-07-10T00:00:00Z', { weaponGroup: 'spsf:C' }),
    ];
    const p = profile([shooterRule, groupRule]);
    expect(computeOverallLapse(sessions, p, ['spsf:C'], NOW)).toBe(lm(2027, 1, 11));
    // Without the group the shooter holds, only the shooter rule applies.
    expect(computeOverallLapse(sessions, p, [], NOW)).toBe(lm(2027, 3, 2));
  });

  it('O2: the earliest lapse whichever order the profile lists the rules in', () => {
    const sessions = [
      at('2026-09-01T00:00:00Z', { weaponGroup: 'spsf:B' }),
      at('2026-07-10T00:00:00Z', { weaponGroup: 'spsf:C' }),
    ];
    expect(computeOverallLapse(sessions, profile([groupRule, shooterRule]), ['spsf:C'], NOW)).toBe(
      lm(2027, 1, 11),
    );
  });

  it('a rule that never lapses does not hide the one that does', () => {
    const sessions = [at('2026-09-01T00:00:00Z')];
    const p = profile([rule({ requiredActivities: 0 }), shooterRule]);
    expect(computeOverallLapse(sessions, p, [], NOW)).toBe(lm(2027, 3, 2));
  });

  it('a profile with no applicable rule has no lapse', () => {
    expect(computeOverallLapse([], profile([]), [], NOW)).toBeNull();
  });

  it('a met profile whose rules require nothing has no lapse', () => {
    expect(computeOverallLapse([], profile([rule({ requiredActivities: 0 })]), [], NOW)).toBe(null);
  });

  it('defaults now to the current time', () => {
    const sessions = [at(new Date().toISOString())];
    expect(computeOverallLapse(sessions, profile([shooterRule]), [])).not.toBeNull();
  });
});

describe('list helpers, aligned with what the firearm screen shows', () => {
  it('computeFirearmLicenseLapses follows computeFirearmLicenseActivity order', () => {
    const shooterRule = rule({ requiredActivities: 1 });
    const groupRule = rule({
      scope: 'weaponGroups',
      weaponGroups: ['spsf:C'],
      requiredActivities: 1,
    });
    const sessions = [at('2026-09-01T00:00:00Z', { weaponGroup: 'spsf:B' })];
    expect(
      computeFirearmLicenseLapses(sessions, profile([shooterRule, groupRule]), ['spsf:C'], NOW),
    ).toEqual([lm(2027, 3, 2), null]);
    expect(
      computeFirearmLicenseLapses(sessions, profile([shooterRule, groupRule]), [], NOW),
    ).toEqual([lm(2027, 3, 2)]);
  });

  it('computeFirearmCriteriaLapses covers only the criteria that apply to the firearm', () => {
    const p: JurisdictionProfile = {
      ...profile([]),
      firearmCriteria: [
        additionalRule(),
        { ...renewalRule(), appliesTo: (f) => f.hasTimeLimitedPermit },
      ],
    };
    const sessions = [at('2026-07-10T00:00:00Z'), at('2026-08-01T00:00:00Z')];
    expect(computeFirearmCriteriaLapses(sessions, p, firearm(), NOW)).toEqual([
      lm(2027, 1, 11),
      null,
    ]);
    expect(
      computeFirearmCriteriaLapses(sessions, p, firearm({ hasTimeLimitedPermit: false }), NOW),
    ).toEqual([lm(2027, 1, 11)]);
    expect(computeFirearmCriteriaLapses(sessions, null, firearm(), NOW)).toEqual([]);
  });

  it('defaults now to the current time', () => {
    const p = profile([rule({ requiredActivities: 1 })]);
    expect(computeFirearmLicenseLapses([at(new Date().toISOString())], p, [])).toHaveLength(1);
    expect(computeFirearmCriteriaLapses([], p, firearm())).toEqual([]);
  });
});

// Properties: the lapse is defined by the status functions, so it is checked
// against them directly rather than against a second formula.

const BASE_MS = Date.parse('2026-01-01T00:00:00Z');
const YEAR_MS = 365 * 86_400_000;

const sessionArb = fc.record({
  offsetMs: fc.integer({ min: -3 * YEAR_MS, max: 30 * 86_400_000 }),
  type: fc.constantFrom<'training' | 'competition'>('training', 'competition'),
  weaponGroup: fc.constantFrom('a', 'b', null),
  firearmId: fc.constantFrom(GUN, 'other', null),
});

const scenarioArb = fc.record({
  nowOffsetMs: fc.integer({ min: 0, max: YEAR_MS }),
  raw: fc.array(sessionArb, { maxLength: 30 }),
  windowMonths: fc.integer({ min: 1, max: 24 }),
  windowCount: fc.integer({ min: 1, max: 3 }),
  requiredActivities: fc.integer({ min: 1, max: 8 }),
  training: fc.integer({ min: 0, max: 2 }),
  competition: fc.integer({ min: 0, max: 2 }),
  scope: fc.constantFrom<'shooter' | 'weaponGroups'>('shooter', 'weaponGroups'),
  samples: fc.array(fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }), {
    minLength: 200,
    maxLength: 200,
  }),
});

type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;

function scenarioSessions(s: Scenario, now: Date): ComplianceSession[] {
  return s.raw.map((r, i) => ({
    id: `s${i}`,
    startedAt: new Date(now.getTime() + r.offsetMs).toISOString(),
    type: r.type,
    weaponGroup: r.weaponGroup,
    firearmId: r.firearmId,
  }));
}

/** P1/P2/P3 for any lapse function given its "met" predicate. */
function checkLapse(
  lapse: string | null,
  now: Date,
  met: (t: Date) => boolean,
  samples: readonly number[],
): void {
  if (!met(now)) {
    expect(lapse).toBeNull(); // P3
    return;
  }
  expect(lapse).not.toBeNull(); // P2
  const lapseMs = Date.parse(lapse!);
  expect(lapseMs).toBeGreaterThan(now.getTime());
  expect(met(new Date(lapseMs))).toBe(false); // P1
  expect(met(new Date(lapseMs - 1))).toBe(true);
  for (const f of samples) {
    const t = now.getTime() + 1 + Math.floor(f * (lapseMs - now.getTime() - 1));
    expect(met(new Date(t))).toBe(true);
  }
}

describe('properties', () => {
  it('P1-P3: a rule is met until its lapse and not at it', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const now = new Date(BASE_MS + s.nowOffsetMs);
        const sessions = scenarioSessions(s, now);
        const r = rule({
          scope: s.scope,
          weaponGroups: ['a'],
          windowMonths: s.windowMonths,
          requiredActivities: s.requiredActivities,
          countsAs: { training: s.training, competition: s.competition },
        });
        checkLapse(
          computeRuleLapse(sessions, r, now),
          now,
          (t) => computeRuleLicenseActivity(sessions, r, t).status === 'green',
          s.samples,
        );
      }),
      { numRuns: 300 },
    );
  });

  it('P4: a per-firearm criterion is met until its lapse and not at it', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const now = new Date(BASE_MS + s.nowOffsetMs);
        const sessions = scenarioSessions(s, now);
        const r = additionalRule({
          windowMonths: s.windowMonths,
          windowCount: s.windowCount,
          requiredActivities: s.requiredActivities,
          countsAs: { training: s.training, competition: s.competition },
        });
        checkLapse(
          computeFirearmCriterionLapse(sessions, r, firearm(), now),
          now,
          (t) => computeFirearmCriterion(sessions, r, firearm(), t).met,
          s.samples,
        );
      }),
      { numRuns: 300 },
    );
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in docs/reqstool/README.md.
 *
 * @SVCs SVC_COMPL_003
 */
it('gives the first day a met requirement is no longer met, and nothing when not met', () => {
  const one = rule({ requiredActivities: 1 });
  const sessions = [at('2026-06-10T09:30:00Z')];
  const lapse = computeRuleLapse(sessions, one, NOW);
  expect(lapse).toBe(lm(2026, 12, 11));
  const status = (ms: number) => computeRuleLicenseActivity(sessions, one, new Date(ms)).status;
  expect(status(Date.parse(lapse!) - 1)).toBe('green');
  expect(status(Date.parse(lapse!))).toBe('red');
  expect(computeRuleLapse([], one, NOW)).toBeNull();
});
