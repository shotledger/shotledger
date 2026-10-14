// The license check (#804): every requirement on the föreningsintyg, grouped
// by what it is for, with whether it is met, what it still needs, and the
// date to shoot by to keep it. Pure: the hook in use-license-check.ts feeds it.
import {
  applicableRules,
  computeFirearmCriterion,
  computeFirearmCriterionLapse,
  computeFirearmCriterionShortfall,
  computeRuleLapse,
  computeRuleLicenseActivity,
  ruleShortfall,
  type ComplianceSession,
  type FirearmCriterionActivity,
  type FirearmCriterionShortfall,
  type FirearmFact,
  type JurisdictionProfile,
  type LicenseActivity,
} from '@shotledger/shared';

export interface RuleCheck {
  activity: LicenseActivity;
  /** Activities still needed now; 0 when met. */
  needed: number;
  /** When it stops being met with nothing more logged; null when not met. */
  lapseIso: string | null;
}

export interface CriterionCheck {
  firearmId: string;
  firearmName: string;
  criterion: FirearmCriterionActivity;
  shortfall: FirearmCriterionShortfall;
  lapseIso: string | null;
}

export interface LicenseCheck {
  rules: RuleCheck[];
  purchase: CriterionCheck[];
  renewal: CriterionCheck[];
}

export interface LicenseCheckFirearm {
  fact: FirearmFact;
  name: string;
}

export function buildLicenseCheck(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  weaponGroups: readonly string[],
  firearms: readonly LicenseCheckFirearm[],
  now: Date = new Date(),
): LicenseCheck {
  const rules = applicableRules(profile, weaponGroups).map((rule) => {
    const activity = computeRuleLicenseActivity(sessions, rule, now);
    return {
      activity,
      needed: ruleShortfall(activity),
      lapseIso: computeRuleLapse(sessions, rule, now),
    };
  });
  const check: LicenseCheck = { rules, purchase: [], renewal: [] };
  for (const rule of profile.firearmCriteria) {
    for (const { fact, name } of firearms) {
      if (!rule.appliesTo(fact)) continue;
      check[rule.purpose].push({
        firearmId: fact.id,
        firearmName: name,
        criterion: computeFirearmCriterion(sessions, rule, fact, now),
        shortfall: computeFirearmCriterionShortfall(sessions, rule, fact, now),
        lapseIso: computeFirearmCriterionLapse(sessions, rule, fact, now),
      });
    }
  }
  return check;
}
