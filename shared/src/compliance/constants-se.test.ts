// Spec: docs/specs/compliance-fap551-spec.md, behaviors C1–C5.
import { describe, expect, it } from 'vitest';

import {
  SE_ADDITIONAL_HANDGUN_REQUIRED,
  SE_ADDITIONAL_HANDGUN_WINDOW_MONTHS,
  SE_EXISTING_HANDGUN_PER_MONTH,
  SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES,
  SE_FIRST_HANDGUN_PER_MONTH,
  SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES,
  SE_RENEWAL_REQUIRED_PER_WINDOW,
  SE_RENEWAL_WINDOW_COUNT,
  SE_RENEWAL_WINDOW_MONTHS,
  SE_SOURCE_CITATION,
  SE_VERIFIED,
  SE_WINDOW_MONTHS,
} from './constants-se';
import { getProfile } from './profile-registry';
import {
  SE_CRITERION_ADDITIONAL_HANDGUN,
  SE_CRITERION_RENEWAL,
  SE_EXISTING_HANDGUN_VARIANT,
  SE_FIRST_HANDGUN_VARIANT,
  SE_PROFILE,
} from './profiles/se';

describe('FAP 551-3 constants', () => {
  it('C1: the window is the six months both paragraphs name', () => {
    expect(SE_WINDOW_MONTHS).toBe(6);
  });

  it('C2: 5 § — two per month on average over six months is twelve in total', () => {
    expect(SE_FIRST_HANDGUN_PER_MONTH).toBe(2);
    expect(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES).toBe(12);
    expect(SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES).toBe(
      SE_FIRST_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS,
    );
  });

  it('C3: 6 § — one per month on average over six months is six in total', () => {
    expect(SE_EXISTING_HANDGUN_PER_MONTH).toBe(1);
    expect(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES).toBe(6);
    expect(SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES).toBe(
      SE_EXISTING_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS,
    );
  });

  it('C4: the modeled numbers are verified against a cited source', () => {
    expect(SE_VERIFIED).toBe(true);
  });

  it('C5: the citation names the form and the regulation, and claims nothing unverified', () => {
    expect(SE_SOURCE_CITATION).toContain('PM 551.24');
    expect(SE_SOURCE_CITATION).toContain('FAP 551-3');
    expect(SE_SOURCE_CITATION).toContain('5 kap 5–6 §§');
    expect(SE_SOURCE_CITATION).not.toMatch(/VERIFY|placeholder|unconfirmed/i);
  });
});

// Behaviors C1-C6 of docs/specs/compliance-firearm-criteria-spec.md — the two
// per-firearm criteria under "Intyget avser".
describe('the per-firearm criteria (#329)', () => {
  it('C1: the numbers are the ones on page 3 of PM 551.24', () => {
    expect(SE_ADDITIONAL_HANDGUN_WINDOW_MONTHS).toBe(6);
    expect(SE_ADDITIONAL_HANDGUN_REQUIRED).toBe(2);
    expect(SE_RENEWAL_WINDOW_MONTHS).toBe(12);
    expect(SE_RENEWAL_WINDOW_COUNT).toBe(2);
    expect(SE_RENEWAL_REQUIRED_PER_WINDOW).toBe(4);
  });

  it('C1b: "de senaste två åren" is the two windows, never stored as a 24', () => {
    expect(SE_RENEWAL_WINDOW_MONTHS * SE_RENEWAL_WINDOW_COUNT).toBe(24);
  });

  it('C2: the profile declares both criteria, in form order', () => {
    expect(SE_PROFILE.firearmCriteria.map((c) => c.criterionId)).toEqual([
      SE_CRITERION_ADDITIONAL_HANDGUN,
      SE_CRITERION_RENEWAL,
    ]);
  });

  it('C3: every number on a criterion traces to a constant, none repeated as a literal', () => {
    const [additional, renewal] = SE_PROFILE.firearmCriteria as [
      (typeof SE_PROFILE.firearmCriteria)[number],
      (typeof SE_PROFILE.firearmCriteria)[number],
    ];
    expect(additional.windowMonths).toBe(SE_ADDITIONAL_HANDGUN_WINDOW_MONTHS);
    expect(additional.windowCount).toBe(1);
    expect(additional.requiredActivities).toBe(SE_ADDITIONAL_HANDGUN_REQUIRED);
    expect(renewal.windowMonths).toBe(SE_RENEWAL_WINDOW_MONTHS);
    expect(renewal.windowCount).toBe(SE_RENEWAL_WINDOW_COUNT);
    expect(renewal.requiredActivities).toBe(SE_RENEWAL_REQUIRED_PER_WINDOW);
  });

  it('C4: "tränat eller tävlat" pools the two session types, as 5–6 §§ do', () => {
    for (const criterion of SE_PROFILE.firearmCriteria) {
      expect(criterion.countsAs).toEqual({ training: 1, competition: 1 });
    }
  });

  it('C5: the criteria do not depend on which paragraph the shooter falls under', () => {
    const first = getProfile('se', SE_FIRST_HANDGUN_VARIANT)!;
    const existing = getProfile('se', SE_EXISTING_HANDGUN_VARIANT)!;
    expect(first.firearmCriteria).toEqual(existing.firearmCriteria);
    expect(first.firearmCriteria).toEqual(SE_PROFILE.firearmCriteria);
  });

  it('C6: the 5 §/6 § rules are untouched by any of this', () => {
    for (const variantId of [SE_FIRST_HANDGUN_VARIANT, SE_EXISTING_HANDGUN_VARIANT]) {
      for (const rule of getProfile('se', variantId)!.rules) {
        expect(rule.scope).toBe('shooter');
        expect(rule.windowMonths).toBe(SE_WINDOW_MONTHS);
      }
    }
    expect(getProfile('se', SE_FIRST_HANDGUN_VARIANT)!.rules[0]!.requiredActivities).toBe(12);
    expect(getProfile('se', SE_EXISTING_HANDGUN_VARIANT)!.rules[0]!.requiredActivities).toBe(6);
  });
});
