// Behaviors S1-S8, G1 and properties Q1-Q3 of
// docs/specs/compliance-licence-check-spec.md.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { computeFirearmCriterion } from './firearm-criteria';
import { computeRuleLicenseActivity } from './license-activity';
import { getProfile } from './profile-registry';
import { SE_CRITERION_ADDITIONAL_HANDGUN, SE_CRITERION_RENEWAL } from './profiles/se';
import { computeFirearmCriterionShortfall, ruleShortfall } from './shortfall';
import type {
  ComplianceRule,
  ComplianceSession,
  FirearmComplianceRule,
  FirearmFact,
} from './types';

const NOW = new Date('2026-10-13T12:00:00Z');
const GUN = 'firearm-1';

const firearm: FirearmFact = {
  id: GUN,
  weaponType: 'pistol',
  isOwn: true,
  hasTimeLimitedPermit: true,
};

function at(day: string, overrides: Partial<ComplianceSession> = {}): ComplianceSession {
  const startedAt = day.length === 10 ? `${day}T00:00:00Z` : day;
  return { id: startedAt, startedAt, type: 'training', firearmId: GUN, ...overrides };
}

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

function renewalRule(): FirearmComplianceRule {
  return additionalRule({
    criterionId: 'renewal',
    purpose: 'renewal',
    windowMonths: 12,
    windowCount: 2,
    requiredActivities: 4,
  });
}

const sixMonthRule: ComplianceRule = {
  scope: 'shooter',
  windowMonths: 6,
  requiredActivities: 6,
  countsAs: { training: 1, competition: 1 },
};

describe('ruleShortfall', () => {
  it('S1: the activities missing from the requirement', () => {
    const sessions = ['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01'].map((d) => at(d));
    expect(ruleShortfall(computeRuleLicenseActivity(sessions, sixMonthRule, NOW))).toBe(2);
  });

  it('S2: nothing missing once met, however far over', () => {
    const sessions = Array.from({ length: 9 }, (_, i) => at(`2026-0${i + 1}-20`));
    expect(ruleShortfall(computeRuleLicenseActivity(sessions, sixMonthRule, NOW))).toBe(0);
    const exactly = Array.from({ length: 6 }, (_, i) => at(`2026-0${i + 4}-20`));
    expect(ruleShortfall(computeRuleLicenseActivity(exactly, sixMonthRule, NOW))).toBe(0);
  });
});

describe('computeFirearmCriterionShortfall', () => {
  it('S3: one window short is fixable now', () => {
    expect(
      computeFirearmCriterionShortfall([at('2026-08-01')], additionalRule(), firearm, NOW),
    ).toEqual({ recentNeeded: 1, olderPeriods: [], metFromIso: NOW.toISOString() });
  });

  it('S4: a met criterion needs nothing', () => {
    const sessions = [
      '2025-01-05',
      '2025-02-05',
      '2025-03-05',
      '2025-04-05',
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
    ].map((d) => at(d));
    expect(computeFirearmCriterionShortfall(sessions, renewalRule(), firearm, NOW)).toEqual({
      recentNeeded: 0,
      olderPeriods: [],
      metFromIso: null,
    });
  });

  it('S5: only the recent year short is fixable now', () => {
    const sessions = [
      '2025-01-05',
      '2025-02-05',
      '2025-03-05',
      '2025-04-05',
      '2026-05-01',
      '2026-06-01',
    ].map((d) => at(d));
    expect(computeFirearmCriterionShortfall(sessions, renewalRule(), firearm, NOW)).toEqual({
      recentNeeded: 2,
      olderPeriods: [],
      metFromIso: NOW.toISOString(),
    });
  });

  it('S6: an older year short is met once enough recent sessions have moved into it', () => {
    const sessions = [
      '2025-02-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ].map((d) => at(d));
    expect(computeFirearmCriterionShortfall(sessions, renewalRule(), firearm, NOW)).toEqual({
      recentNeeded: 0,
      olderPeriods: [
        {
          startIso: '2024-10-13T12:00:00.000Z',
          endIso: '2025-10-13T12:00:00.000Z',
          activityCount: 1,
          needed: 3,
        },
      ],
      metFromIso: '2027-01-01T00:00:00.001Z',
    });
  });

  it('S7: with nothing logged, the older year can only fill once it ends after now', () => {
    expect(computeFirearmCriterionShortfall([], renewalRule(), firearm, NOW)).toEqual({
      recentNeeded: 4,
      olderPeriods: [
        {
          startIso: '2024-10-13T12:00:00.000Z',
          endIso: '2025-10-13T12:00:00.000Z',
          activityCount: 0,
          needed: 4,
        },
      ],
      metFromIso: '2027-10-13T12:00:00.001Z',
    });
  });

  it('S8: sessions with another firearm do not count', () => {
    const sessions = [at('2026-08-01'), at('2026-09-01', { firearmId: 'other' })];
    expect(computeFirearmCriterionShortfall(sessions, additionalRule(), firearm, NOW)).toEqual({
      recentNeeded: 1,
      olderPeriods: [],
      metFromIso: NOW.toISOString(),
    });
  });

  it('defaults now to the current time', () => {
    expect(computeFirearmCriterionShortfall([], additionalRule(), firearm).recentNeeded).toBe(2);
  });
});

it('G1: the Swedish criteria are grouped by what the intyg is for', () => {
  const profile = getProfile('se');
  const purposes = Object.fromEntries(
    profile!.firearmCriteria.map((rule) => [rule.criterionId, rule.purpose]),
  );
  expect(purposes).toEqual({
    [SE_CRITERION_ADDITIONAL_HANDGUN]: 'purchase',
    [SE_CRITERION_RENEWAL]: 'renewal',
  });
});

// Properties: checked against computeFirearmCriterion, never a second formula.

const BASE_MS = Date.parse('2026-01-01T00:00:00Z');
const DAY_MS = 86_400_000;

const scenarioArb = fc.record({
  nowOffsetMs: fc.integer({ min: 0, max: 365 * DAY_MS }),
  offsets: fc.array(fc.integer({ min: -4 * 365 * DAY_MS, max: 0 }), { maxLength: 25 }),
  other: fc.array(fc.boolean(), { minLength: 25, maxLength: 25 }),
  windowMonths: fc.integer({ min: 1, max: 24 }),
  windowCount: fc.integer({ min: 1, max: 3 }),
  requiredActivities: fc.integer({ min: 1, max: 6 }),
});

it('Q1-Q3: the shortfall agrees with computeFirearmCriterion', () => {
  fc.assert(
    fc.property(scenarioArb, (s) => {
      const now = new Date(BASE_MS + s.nowOffsetMs);
      const sessions = s.offsets.map((offset, i) =>
        at(new Date(now.getTime() + offset).toISOString(), {
          id: `s${i}`,
          firearmId: s.other[i] ? 'other' : GUN,
        }),
      );
      const rule = additionalRule({
        windowMonths: s.windowMonths,
        windowCount: s.windowCount,
        requiredActivities: s.requiredActivities,
      });
      const result = computeFirearmCriterionShortfall(sessions, rule, firearm, now);
      const current = computeFirearmCriterion(sessions, rule, firearm, now);

      // Q3
      expect(result.metFromIso === null).toBe(current.met);
      expect(result.recentNeeded).toBe(
        Math.max(0, rule.requiredActivities - current.periods[0]!.activityCount),
      );
      expect(result.olderPeriods.length === 0).toBe(
        current.met || result.metFromIso === now.toISOString(),
      );
      if (result.metFromIso === null) return;

      // Q1: fill every short window at t with sessions logged from now on.
      const t = new Date(result.metFromIso);
      const at_t = computeFirearmCriterion(sessions, rule, firearm, t);
      const added: ComplianceSession[] = [];
      at_t.periods.forEach((period, n) => {
        if (period.met) return;
        const startMs = Date.parse(period.startIso);
        const ms = Math.max(now.getTime(), startMs);
        // The newest window is closed at t; older ones end just before their end.
        expect(n === 0 || ms < Date.parse(period.endIso)).toBe(true);
        for (let k = 0; k < rule.requiredActivities; k += 1) {
          added.push(at(new Date(ms).toISOString(), { id: `added-${n}-${k}` }));
        }
      });
      expect(computeFirearmCriterion([...sessions, ...added], rule, firearm, t).met).toBe(true);

      // Q2: a moment earlier, some short window had already ended by now.
      if (t.getTime() > now.getTime()) {
        const before = computeFirearmCriterion(sessions, rule, firearm, new Date(t.getTime() - 1));
        expect(
          before.periods.some(
            (period, n) => n > 0 && !period.met && Date.parse(period.endIso) <= now.getTime(),
          ),
        ).toBe(true);
      }
    }),
    { numRuns: 300 },
  );
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_COMPL_004
 */
it('says what a renewal that is not met still needs, and from when it can be met', () => {
  const result = computeFirearmCriterionShortfall([at('2026-09-01')], renewalRule(), firearm, NOW);
  expect(result.recentNeeded).toBe(3);
  expect(result.olderPeriods).toHaveLength(1);
  expect(result.olderPeriods[0]!.needed).toBe(4);
  // The older year ends after now only from 2027-10-13 on.
  expect(result.metFromIso).toBe('2027-10-13T12:00:00.001Z');
});

it('S7: a window ending exactly at now cannot take a session logged now', () => {
  const midnight = new Date('2026-10-13T00:00:00Z');
  expect(computeFirearmCriterionShortfall([], renewalRule(), firearm, midnight).metFromIso).toBe(
    '2027-10-13T00:00:00.001Z',
  );
});
