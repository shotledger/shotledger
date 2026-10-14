// When a met requirement stops being met if nothing more is logged — the date
// behind "log your next session by …" (#795). Spec:
// docs/specs/compliance-next-session-spec.md.
//
// The lapse is defined by the status functions themselves, never by a second
// formula: it is the first local midnight after `now` at which the same
// function, on the same sessions, no longer says "met". So it inherits their
// window arithmetic exactly, month-end clamping included.
import { computeFirearmCriterion } from './firearm-criteria';
import { applicableRules, computeRuleLicenseActivity } from './license-activity';
import { firstDayWhere } from './scan';
import type {
  ComplianceRule,
  ComplianceSession,
  FirearmComplianceRule,
  FirearmFact,
  JurisdictionProfile,
} from './types';

/**
 * The first local midnight after `now` at which `met` turns false, or `null`
 * when it is not met at `now` or never turns false.
 */
function firstLapse(
  sessions: readonly ComplianceSession[],
  reachMonths: number,
  now: Date,
  met: (t: Date) => boolean,
): string | null {
  if (!met(now)) return null;
  const times = sessions.map((s) => new Date(s.startedAt).getTime());
  return firstDayWhere(times, reachMonths, now.getTime(), (t) => !met(t));
}

/** When a 5 §/6 § rule stops being green with no further session logged. */
export function computeRuleLapse(
  sessions: readonly ComplianceSession[],
  rule: ComplianceRule,
  now: Date = new Date(),
): string | null {
  return firstLapse(
    sessions,
    rule.windowMonths,
    now,
    (t) => computeRuleLicenseActivity(sessions, rule, t).status === 'green',
  );
}

/** When a per-firearm criterion stops being met with no further session logged. */
export function computeFirearmCriterionLapse(
  sessions: readonly ComplianceSession[],
  rule: FirearmComplianceRule,
  firearm: FirearmFact,
  now: Date = new Date(),
): string | null {
  return firstLapse(
    sessions,
    rule.windowMonths * rule.windowCount,
    now,
    (t) => computeFirearmCriterion(sessions, rule, firearm, t).met,
  );
}

/**
 * When the overall status stops being green: the earliest lapse among the
 * rules that apply, and `null` unless every one of them is green now.
 */
export function computeOverallLapse(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  weaponGroups: readonly string[],
  now: Date = new Date(),
): string | null {
  const rules = applicableRules(profile, weaponGroups);
  if (rules.some((rule) => computeRuleLicenseActivity(sessions, rule, now).status !== 'green')) {
    return null;
  }
  const lapses = rules
    .map((rule) => computeRuleLapse(sessions, rule, now))
    .filter((lapse): lapse is string => lapse !== null);
  if (lapses.length === 0) return null;
  return new Date(Math.min(...lapses.map((lapse) => Date.parse(lapse)))).toISOString();
}

/** One lapse per entry of `computeFirearmLicenseActivity`, in its order. */
export function computeFirearmLicenseLapses(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  firearmWeaponGroups: readonly string[],
  now: Date = new Date(),
): (string | null)[] {
  return applicableRules(profile, firearmWeaponGroups).map((rule) =>
    computeRuleLapse(sessions, rule, now),
  );
}

/** One lapse per entry of `computeFirearmCriteria`, in its order. */
export function computeFirearmCriteriaLapses(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile | null,
  firearm: FirearmFact,
  now: Date = new Date(),
): (string | null)[] {
  if (!profile) return [];
  return profile.firearmCriteria
    .filter((rule) => rule.appliesTo(firearm))
    .map((rule) => computeFirearmCriterionLapse(sessions, rule, firearm, now));
}
