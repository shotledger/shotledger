// License activity over sessions (never series — an activity = one
// session, extra_rounds never create one). Spec: m6-compliance-spec.md
// "Behaviors — license-activity.ts", amended by
// compliance-shooter-level-activity-spec.md.
import { subtractMonthsUtc } from './months';
import { statusFor } from './status';
import type {
  ComplianceRule,
  ComplianceSession,
  JurisdictionProfile,
  LicenseActivity,
} from './types';

function weightFor(rule: ComplianceRule, session: ComplianceSession): number {
  return session.type === 'training' ? rule.countsAs.training : rule.countsAs.competition;
}

/** Whether this rule counts this session at all — scope only, never the date. */
function ruleCountsSession(rule: ComplianceRule, session: ComplianceSession): boolean {
  if (rule.scope === 'shooter') return true;
  return rule.weaponGroups.includes(session.weaponGroup ?? '');
}

/** Computes one rule's license activity over its own window, ending at `now`. */
export function computeRuleLicenseActivity(
  sessions: readonly ComplianceSession[],
  rule: ComplianceRule,
  now: Date = new Date(),
): LicenseActivity {
  const windowStart = subtractMonthsUtc(now, rule.windowMonths);
  const windowStartMs = windowStart.getTime();
  const nowMs = now.getTime();

  let activityCount = 0;
  let countedSessionCount = 0;
  let skippedSessionCount = 0;
  for (const session of sessions) {
    // The window is applied before the scope test, so `skippedSessionCount`
    // counts only sessions a shooter would expect to see in the figure —
    // never the whole history behind it.
    const t = new Date(session.startedAt).getTime();
    if (t < windowStartMs || t > nowMs) continue;
    if (!ruleCountsSession(rule, session)) {
      skippedSessionCount += 1;
      continue;
    }
    countedSessionCount += 1;
    activityCount += weightFor(rule, session);
  }

  return {
    scope: rule.scope,
    weaponGroups: rule.scope === 'weaponGroups' ? rule.weaponGroups : [],
    windowMonths: rule.windowMonths,
    requiredActivities: rule.requiredActivities,
    activityCount,
    countedSessionCount,
    skippedSessionCount,
    status: statusFor(activityCount, rule.requiredActivities),
    windowStartIso: windowStart.toISOString(),
  };
}

/**
 * The rules that apply to a shooter holding `weaponGroups`, deduplicated and
 * in profile order.
 *
 * A `shooter`-scope rule is always in the list — it is a requirement on the
 * person, so it applies whether or not any firearm has a vapengrupp on file,
 * and whether or not `weaponGroups` is empty. That is what makes license
 * activity appear after an import that created no firearm_groups rows (#319).
 */
function rulesFor(profile: JurisdictionProfile, weaponGroups: readonly string[]): ComplianceRule[] {
  const groups = new Set(weaponGroups);
  return profile.rules.filter(
    (rule) => rule.scope === 'shooter' || rule.weaponGroups.some((g) => groups.has(g)),
  );
}

/** License activity for a single weapon group, or `null` if no rule covers it. */
export function computeLicenseActivityForWeaponGroup(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  weaponGroup: string,
  now: Date = new Date(),
): LicenseActivity | null {
  const rule = rulesFor(profile, [weaponGroup])[0];
  if (!rule) return null;
  return computeRuleLicenseActivity(sessions, rule, now);
}

/**
 * License activity for a firearm: every rule that applies to the shooter,
 * plus any rule tied to the weapon groups this firearm holds. Never matched
 * on `session.firearm_id` — no rule modeled here is per-firearm. (The two
 * that are, PM 551.24's "ytterligare enhandsvapen" and "förnyelse av
 * tidsbegränsat tillstånd", are still unmodeled; see #329.)
 *
 * A firearm with no weapon groups recorded still gets the shooter-level
 * status rather than nothing.
 */
export function computeFirearmLicenseActivity(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  firearmWeaponGroups: readonly string[],
  now: Date = new Date(),
): LicenseActivity[] {
  return rulesFor(profile, firearmWeaponGroups).map((rule) =>
    computeRuleLicenseActivity(sessions, rule, now),
  );
}

const STATUS_RANK: Record<'green' | 'amber' | 'red', number> = { red: 0, amber: 1, green: 2 };

/** Worst-of ordering: red < amber < green. */
export function worstStatus(
  statuses: readonly ('green' | 'amber' | 'red')[],
): 'green' | 'amber' | 'red' | null {
  if (statuses.length === 0) return null;
  return statuses.reduce((worst, s) => (STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst));
}

export interface OverallLicenseActivity {
  statuses: LicenseActivity[];
  overall: 'green' | 'amber' | 'red' | null;
}

/**
 * Aggregate license activity across the shooter: every `shooter`-scope rule,
 * plus every rule tied to a weapon group they hold. Overall = worst status
 * among them; a profile with no applicable rule never fabricates a status.
 */
export function computeOverallLicenseActivity(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile,
  weaponGroups: readonly string[],
  now: Date = new Date(),
): OverallLicenseActivity {
  const statuses = rulesFor(profile, weaponGroups).map((rule) =>
    computeRuleLicenseActivity(sessions, rule, now),
  );
  return { statuses, overall: worstStatus(statuses.map((s) => s.status)) };
}
