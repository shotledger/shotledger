// Activity barometer over sessions (never series — an activity = one
// session, extra_rounds never create one). Spec: m6-compliance-spec.md
// "Behaviors — barometer.ts".
import { subtractMonthsUtc } from './months';
import type {
  ComplianceSession,
  JurisdictionProfile,
  WeaponGroupBarometer,
  WeaponGroupComplianceRule,
} from './types';

function statusFor(count: number, required: number): 'green' | 'amber' | 'red' {
  if (required <= 0) return 'green';
  if (count >= required) return 'green';
  if (count >= Math.ceil(required / 2)) return 'amber';
  return 'red';
}

function weightFor(rule: WeaponGroupComplianceRule, session: ComplianceSession): number {
  return session.type === 'training' ? rule.countsAs.training : rule.countsAs.competition;
}

/** Computes one rule's barometer over its own window, ending at `now`. */
export function computeRuleBarometer(
  sessions: readonly ComplianceSession[],
  rule: WeaponGroupComplianceRule,
  now: Date = new Date(),
): WeaponGroupBarometer {
  const windowStart = subtractMonthsUtc(now, rule.windowMonths);
  const windowStartMs = windowStart.getTime();
  const nowMs = now.getTime();

  let activityCount = 0;
  for (const session of sessions) {
    if (!rule.weaponGroups.includes(session.weaponGroup ?? '')) continue;
    const t = new Date(session.startedAt).getTime();
    if (t < windowStartMs || t > nowMs) continue;
    activityCount += weightFor(rule, session);
  }

  return {
    weaponGroups: rule.weaponGroups,
    windowMonths: rule.windowMonths,
    requiredActivities: rule.requiredActivities,
    activityCount,
    status: statusFor(activityCount, rule.requiredActivities),
    windowStartIso: windowStart.toISOString(),
  };
}

function ruleForWeaponGroup(
  profile: JurisdictionProfile,
  weaponGroup: string,
): WeaponGroupComplianceRule | null {
  return profile.rules.find((rule) => rule.weaponGroups.includes(weaponGroup)) ?? null;
}

/** Barometer for a single weapon group, or `null` if the profile has no rule for it. */
export function computeBarometerForWeaponGroup(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  weaponGroup: string,
  now: Date = new Date(),
): WeaponGroupBarometer | null {
  const rule = ruleForWeaponGroup(profile, weaponGroup);
  if (!rule) return null;
  return computeRuleBarometer(sessions, rule, now);
}

/**
 * Barometer(s) for a firearm, matched by the weapon groups it holds — never
 * by `session.firearm_id` (§6.6 "per firearm via its weapon groups"). A
 * firearm holding groups covered by different rules gets one status per
 * rule; callers needing a single chip take the worst (§"Overall
 * aggregation").
 */
export function computeFirearmBarometer(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  firearmWeaponGroups: readonly string[],
  now: Date = new Date(),
): WeaponGroupBarometer[] {
  const seenRules = new Set<WeaponGroupComplianceRule>();
  const results: WeaponGroupBarometer[] = [];
  for (const group of firearmWeaponGroups) {
    const rule = ruleForWeaponGroup(profile, group);
    if (!rule || seenRules.has(rule)) continue;
    seenRules.add(rule);
    results.push(computeRuleBarometer(sessions, rule, now));
  }
  return results;
}

const STATUS_RANK: Record<'green' | 'amber' | 'red', number> = { red: 0, amber: 1, green: 2 };

/** Worst-of ordering: red < amber < green. */
export function worstStatus(
  statuses: readonly ('green' | 'amber' | 'red')[],
): 'green' | 'amber' | 'red' | null {
  if (statuses.length === 0) return null;
  return statuses.reduce((worst, s) => (STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst));
}

export interface OverallBarometer {
  statuses: WeaponGroupBarometer[];
  overall: 'green' | 'amber' | 'red' | null;
}

/**
 * Aggregate barometer across every weapon group requested (typically: every
 * group the shooter's firearms hold). Overall = worst status among the
 * matched rules; empty input never fabricates a status.
 */
export function computeOverallBarometer(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  weaponGroups: readonly string[],
  now: Date = new Date(),
): OverallBarometer {
  const seenRules = new Set<WeaponGroupComplianceRule>();
  const statuses: WeaponGroupBarometer[] = [];
  for (const group of weaponGroups) {
    const rule = ruleForWeaponGroup(profile, group);
    if (!rule || seenRules.has(rule)) continue;
    seenRules.add(rule);
    statuses.push(computeRuleBarometer(sessions, rule, now));
  }
  return { statuses, overall: worstStatus(statuses.map((s) => s.status)) };
}
