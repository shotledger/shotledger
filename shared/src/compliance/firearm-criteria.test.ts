// Behaviors F1-F22 of docs/specs/compliance-firearm-criteria-spec.md.
import { describe, expect, it } from 'vitest';

import { computeFirearmCriteria, computeFirearmCriterion } from './firearm-criteria';
import { getProfile } from './profile-registry';
import { SE_CRITERION_ADDITIONAL_HANDGUN, SE_CRITERION_RENEWAL } from './profiles/se';
import type { ComplianceSession, FirearmComplianceRule, FirearmFact } from './types';

const NOW = new Date('2026-09-01T00:00:00Z');
const GUN = 'firearm-1';

function firearm(overrides: Partial<FirearmFact> = {}): FirearmFact {
  return {
    id: GUN,
    weaponType: 'pistol',
    isOwn: true,
    hasTimeLimitedPermit: false,
    ...overrides,
  };
}

/** "Ytterligare enhandsvapen" in shape: one six-month window, two required. */
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

/** "Förnyelse" in shape: two twelve-month windows, four required in each. */
function renewalRule(overrides: Partial<FirearmComplianceRule> = {}): FirearmComplianceRule {
  return additionalRule({
    criterionId: 'renewal',
    windowMonths: 12,
    windowCount: 2,
    requiredActivities: 4,
    ...overrides,
  });
}

function session(overrides: Partial<ComplianceSession> = {}): ComplianceSession {
  return {
    id: 'session-1',
    startedAt: '2026-08-01T00:00:00Z',
    type: 'training',
    firearmId: GUN,
    ...overrides,
  };
}

/** `count` sessions with `firearmId`, spaced a day apart back from `from`. */
function sessions(count: number, from: string, overrides: Partial<ComplianceSession> = {}) {
  const start = new Date(from).getTime();
  return Array.from({ length: count }, (_, i) =>
    session({
      id: `s-${overrides.firearmId ?? GUN}-${from}-${i}`,
      startedAt: new Date(start - i * 86_400_000).toISOString(),
      ...overrides,
    }),
  );
}

describe('computeFirearmCriterion — one six-month window (F1-F7, F13, F14)', () => {
  it('F1: meets the criterion at exactly the required count', () => {
    const result = computeFirearmCriterion(
      sessions(2, '2026-08-01T00:00:00Z'),
      additionalRule(),
      firearm(),
      NOW,
    );
    expect(result.met).toBe(true);
    expect(result.status).toBe('green');
    expect(result.periods).toHaveLength(1);
    expect(result.activityCount).toBe(2);
    expect(result.periods[0]!.countedSessionCount).toBe(2);
  });

  it('F2: one short is amber, not met', () => {
    const result = computeFirearmCriterion(
      sessions(1, '2026-08-01T00:00:00Z'),
      additionalRule(),
      firearm(),
      NOW,
    );
    expect(result.met).toBe(false);
    expect(result.status).toBe('amber');
  });

  it('F3: nothing at all is red', () => {
    const result = computeFirearmCriterion([], additionalRule(), firearm(), NOW);
    expect(result.met).toBe(false);
    expect(result.status).toBe('red');
    expect(result.activityCount).toBe(0);
  });

  it('F4: sessions with another firearm count for nothing, and are reported', () => {
    const result = computeFirearmCriterion(
      sessions(5, '2026-08-01T00:00:00Z', { firearmId: 'firearm-2' }),
      additionalRule(),
      firearm(),
      NOW,
    );
    expect(result.activityCount).toBe(0);
    expect(result.met).toBe(false);
    expect(result.otherFirearmSessionCount).toBe(5);
    expect(result.unattributedSessionCount).toBe(0);
  });

  it('F4b: the reported span has two edges, and both are exclusive of what is outside', () => {
    // The span for this rule is [2026-03-01, 2026-09-01].
    const result = computeFirearmCriterion(
      [
        session({ id: 'at-open', firearmId: 'firearm-2', startedAt: '2026-03-01T00:00:00Z' }),
        session({ id: 'inside', firearmId: 'firearm-2', startedAt: '2026-08-01T00:00:00Z' }),
        session({ id: 'at-now', firearmId: 'firearm-2', startedAt: '2026-09-01T00:00:00Z' }),
        session({ id: 'before', firearmId: 'firearm-2', startedAt: '2026-02-28T23:59:59Z' }),
        session({ id: 'after', firearmId: 'firearm-2', startedAt: '2026-09-01T00:00:01Z' }),
        session({ id: 'after-none', firearmId: null, startedAt: '2026-09-01T00:00:01Z' }),
      ],
      additionalRule(),
      firearm(),
      NOW,
    );
    expect(result.otherFirearmSessionCount).toBe(3);
    expect(result.unattributedSessionCount).toBe(0);
  });

  it('F5: a session naming no firearm is never counted, and is reported apart', () => {
    const result = computeFirearmCriterion(
      sessions(3, '2026-08-01T00:00:00Z', { firearmId: null }),
      additionalRule(),
      firearm(),
      NOW,
    );
    expect(result.activityCount).toBe(0);
    expect(result.unattributedSessionCount).toBe(3);
    expect(result.otherFirearmSessionCount).toBe(0);
  });

  it('F5b: a session with the property absent altogether behaves as unattributed', () => {
    const bare: ComplianceSession = {
      id: 'bare',
      startedAt: '2026-08-01T00:00:00Z',
      type: 'training',
    };
    const result = computeFirearmCriterion([bare], additionalRule(), firearm(), NOW);
    expect(result.activityCount).toBe(0);
    expect(result.unattributedSessionCount).toBe(1);
  });

  it('F6: a session the day before the window opens does not count', () => {
    // Window opens 2026-03-01.
    const result = computeFirearmCriterion(
      [
        session({ id: 'in', startedAt: '2026-03-01T00:00:00Z' }),
        session({ id: 'out', startedAt: '2026-02-28T23:59:59Z' }),
      ],
      additionalRule(),
      firearm(),
      NOW,
    );
    expect(result.activityCount).toBe(1);
    // Outside every window, so not an "other firearm" either — simply not in
    // the period the form asks about.
    expect(result.otherFirearmSessionCount).toBe(0);
  });

  it('F7: a session dated after now does not count', () => {
    const result = computeFirearmCriterion(
      [
        session({ id: 'now', startedAt: '2026-09-01T00:00:00Z' }),
        session({ id: 'future', startedAt: '2026-09-02T00:00:00Z' }),
      ],
      additionalRule(),
      firearm(),
      NOW,
    );
    expect(result.activityCount).toBe(1);
  });

  it('F13: a zero-weighted session type is counted as a session but not as an activity', () => {
    const rule = additionalRule({ countsAs: { training: 1, competition: 0 } });
    const result = computeFirearmCriterion(
      [
        session({ id: 'a', type: 'competition' }),
        session({ id: 'b', type: 'competition', startedAt: '2026-07-01T00:00:00Z' }),
      ],
      rule,
      firearm(),
      NOW,
    );
    expect(result.activityCount).toBe(0);
    expect(result.periods[0]!.countedSessionCount).toBe(2);
    expect(result.met).toBe(false);
  });

  it('F13b: the weighting tells the two session types apart', () => {
    const rule = additionalRule({ countsAs: { training: 1, competition: 0 } });
    const result = computeFirearmCriterion(
      [
        session({ id: 'training', type: 'training' }),
        session({ id: 'competition', type: 'competition', startedAt: '2026-07-01T00:00:00Z' }),
      ],
      rule,
      firearm(),
      NOW,
    );
    expect(result.activityCount).toBe(1);
    expect(result.periods[0]!.countedSessionCount).toBe(2);
  });

  it('F14: a criterion requiring nothing is met with nothing', () => {
    const result = computeFirearmCriterion(
      [],
      additionalRule({ requiredActivities: 0 }),
      firearm(),
      NOW,
    );
    expect(result.met).toBe(true);
    expect(result.status).toBe('green');
  });
});

describe('computeFirearmCriterion — two twelve-month windows (F8-F12)', () => {
  it('F8: four in each of the two years meets it', () => {
    const result = computeFirearmCriterion(
      [...sessions(4, '2026-08-01T00:00:00Z'), ...sessions(4, '2025-08-01T00:00:00Z')],
      renewalRule(),
      firearm(),
      NOW,
    );
    expect(result.met).toBe(true);
    expect(result.periods).toHaveLength(2);
    expect(result.periods.every((p) => p.met)).toBe(true);
  });

  it('F9: eight in the recent year and none in the older one does NOT meet it', () => {
    // The whole reason the rule is two windows: a 24-month total would say 8/4.
    const result = computeFirearmCriterion(
      sessions(8, '2026-08-01T00:00:00Z'),
      renewalRule(),
      firearm(),
      NOW,
    );
    expect(result.met).toBe(false);
    expect(result.activityCount).toBe(0);
    expect(result.periods[0]!.activityCount).toBe(8);
    expect(result.periods[1]!.activityCount).toBe(0);
  });

  it('F10: four in the older year and none recently does not meet it either', () => {
    const result = computeFirearmCriterion(
      sessions(4, '2025-08-01T00:00:00Z'),
      renewalRule(),
      firearm(),
      NOW,
    );
    expect(result.met).toBe(false);
    expect(result.periods[0]!.met).toBe(false);
    expect(result.periods[1]!.met).toBe(true);
  });

  it('F11: periods run most recent first, and activityCount is the worst', () => {
    const result = computeFirearmCriterion(
      [...sessions(6, '2026-08-01T00:00:00Z'), ...sessions(4, '2025-08-01T00:00:00Z')],
      renewalRule(),
      firearm(),
      NOW,
    );
    expect(new Date(result.periods[0]!.startIso).getTime()).toBeGreaterThan(
      new Date(result.periods[1]!.startIso).getTime(),
    );
    expect(result.activityCount).toBe(4);
    expect(result.met).toBe(true);
  });

  it('F11b: the reported span reaches back across every window, not just the newest', () => {
    // 2025-03-01 is eighteen months back: inside 12 x 2, outside 12 / 2.
    const result = computeFirearmCriterion(
      [session({ id: 'older', firearmId: 'firearm-2', startedAt: '2025-03-01T00:00:00Z' })],
      renewalRule(),
      firearm(),
      NOW,
    );
    expect(result.otherFirearmSessionCount).toBe(1);
  });

  it('F12: the windows tile with no gap and no overlap', () => {
    const result = computeFirearmCriterion([], renewalRule(), firearm(), NOW);
    expect(result.periods[0]!.startIso).toBe(result.periods[1]!.endIso);
    expect(result.periods[0]!.endIso).toBe(NOW.toISOString());
    // A session landing exactly on the boundary belongs to the newer window
    // only ([start, end), with the most recent window closed at `now`), so it
    // can never be counted twice.
    const onBoundary = computeFirearmCriterion(
      [session({ startedAt: result.periods[0]!.startIso })],
      renewalRule(),
      firearm(),
      NOW,
    );
    expect(onBoundary.periods[0]!.activityCount).toBe(1);
    expect(onBoundary.periods[1]!.activityCount).toBe(0);
  });
});

describe('computeFirearmCriteria — which criteria cover a firearm (F15-F22)', () => {
  const se = getProfile('se');

  function idsFor(overrides: Partial<FirearmFact>) {
    return computeFirearmCriteria([], se, firearm(overrides), NOW).map((c) => c.criterionId);
  }

  it('F15: an owned pistol on an open-ended licence gets the additional-handgun box', () => {
    expect(idsFor({})).toEqual([SE_CRITERION_ADDITIONAL_HANDGUN]);
  });

  it('F16: a time-limited licence adds the renewal box, in profile order', () => {
    expect(idsFor({ hasTimeLimitedPermit: true })).toEqual([
      SE_CRITERION_ADDITIONAL_HANDGUN,
      SE_CRITERION_RENEWAL,
    ]);
  });

  it('F17: a borrowed handgun is not one the shooter holds', () => {
    expect(idsFor({ isOwn: false })).toEqual([]);
  });

  it('F18: a rifle is not an enhandsvapen', () => {
    expect(idsFor({ weaponType: 'rifle' })).toEqual([]);
  });

  it('F19: an airgun is excluded, same as for 5 §/6 §', () => {
    expect(idsFor({ weaponType: 'airgun' })).toEqual([]);
  });

  it('F20: a firearm with no weapon type cannot be shown to be a handgun', () => {
    expect(idsFor({ weaponType: null })).toEqual([]);
  });

  it('F21: no profile means no criteria at all', () => {
    expect(computeFirearmCriteria([], null, firearm(), NOW)).toEqual([]);
  });

  it('F22: renewal names no weapon type, so a time-limited rifle still gets it', () => {
    expect(idsFor({ weaponType: 'rifle', hasTimeLimitedPermit: true })).toEqual([
      SE_CRITERION_RENEWAL,
    ]);
  });

  it('carries the firearm id and the rule numbers through', () => {
    const additional = computeFirearmCriteria([], se, firearm(), NOW)[0]!;
    expect(additional.firearmId).toBe(GUN);
    expect(additional.windowMonths).toBe(6);
    expect(additional.windowCount).toBe(1);
    expect(additional.requiredActivities).toBe(2);
  });
});
