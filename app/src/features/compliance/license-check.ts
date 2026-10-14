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
  /** Every firearm checked, in the order given, for the overview's list. */
  firearms: { id: string; name: string }[];
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
  const check: LicenseCheck = {
    rules,
    purchase: [],
    renewal: [],
    firearms: firearms.map(({ fact, name }) => ({ id: fact.id, name })),
  };
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

/** The overview's answer to "can I apply for a new firearm?". */
export interface NewFirearmSummary {
  /** Every activity rule and every additional-handgun box is met. */
  ready: boolean;
  /** Requirements not met now. */
  unmet: number;
  /** The earliest date one of them stops being met; null when not ready. */
  lapseIso: string | null;
}

function earliest(isos: readonly (string | null)[]): string | null {
  const dates = isos.filter((iso): iso is string => iso !== null).sort();
  return dates[0] ?? null;
}

export function newFirearmSummary(check: LicenseCheck): NewFirearmSummary {
  const unmet =
    check.rules.filter((rule) => rule.needed > 0).length +
    check.purchase.filter((item) => !item.criterion.met).length;
  const ready = unmet === 0;
  return {
    ready,
    unmet,
    lapseIso: ready
      ? earliest([...check.rules, ...check.purchase].map((item) => item.lapseIso))
      : null,
  };
}

/** One firearm's row in the overview and the boxes its detail shows. */
export interface FirearmSummary {
  id: string;
  name: string;
  /** The renewal box; null when its license has no end date. */
  renewal: CriterionCheck | null;
  /** The additional-handgun box; null when it does not apply. */
  purchase: CriterionCheck | null;
}

export function firearmSummaries(check: LicenseCheck): FirearmSummary[] {
  return check.firearms.map(({ id, name }) => ({
    id,
    name,
    renewal: check.renewal.find((item) => item.firearmId === id) ?? null,
    purchase: check.purchase.find((item) => item.firearmId === id) ?? null,
  }));
}
