// What a requirement that is not met still needs (#804). Spec:
// docs/specs/compliance-license-check-spec.md.
import { computeFirearmCriterion } from './firearm-criteria';
import { firstInstantWhere } from './scan';
import type {
  ComplianceSession,
  FirearmComplianceRule,
  FirearmFact,
  LicenseActivity,
} from './types';

/** An earlier window below the requirement. */
export interface ShortPeriod {
  startIso: string;
  endIso: string;
  activityCount: number;
  needed: number;
}

export interface FirearmCriterionShortfall {
  /** Activities with this firearm still missing from the most recent window. */
  recentNeeded: number;
  /**
   * Earlier windows below the requirement. Sessions logged from now on cannot
   * count towards a window that has already ended.
   */
  olderPeriods: ShortPeriod[];
  /**
   * `null` when met now; now when logging `recentNeeded` sessions would meet
   * it; otherwise the first instant it can be met if the shooter keeps
   * logging sessions with this firearm.
   */
  metFromIso: string | null;
}

/** Activities a 5 §/6 § rule still needs: logging that many now makes it green. */
export function ruleShortfall(activity: LicenseActivity): number {
  return Math.max(0, activity.requiredActivities - activity.activityCount);
}

/**
 * @Requirements COMPL_004
 */
export function computeFirearmCriterionShortfall(
  sessions: readonly ComplianceSession[],
  rule: FirearmComplianceRule,
  firearm: FirearmFact,
  now: Date = new Date(),
): FirearmCriterionShortfall {
  const nowMs = now.getTime();
  const current = computeFirearmCriterion(sessions, rule, firearm, now);
  const [recent, ...older] = current.periods;
  const olderPeriods = older
    .filter((period) => !period.met)
    .map((period) => ({
      startIso: period.startIso,
      endIso: period.endIso,
      activityCount: period.activityCount,
      needed: rule.requiredActivities - period.activityCount,
    }));
  const shortfall = {
    recentNeeded: Math.max(0, rule.requiredActivities - recent!.activityCount),
    olderPeriods,
  };
  if (current.met) return { ...shortfall, metFromIso: null };
  if (olderPeriods.length === 0) return { ...shortfall, metFromIso: now.toISOString() };

  // Every earlier window at `t` either has what it needs already, or ends
  // after now so that a session logged from now on can still land in it. The
  // most recent window ends at `t` itself and always can.
  const canBeMet = (t: Date) =>
    computeFirearmCriterion(sessions, rule, firearm, t)
      .periods.slice(1)
      .every((period) => period.met || Date.parse(period.endIso) > nowMs);
  const edgeMonths = Array.from(
    { length: rule.windowCount },
    (_, n) => rule.windowMonths * (n + 1),
  );
  const times = [nowMs, ...sessions.map((s) => new Date(s.startedAt).getTime())];
  return { ...shortfall, metFromIso: firstInstantWhere(times, edgeMonths, nowMs, canBeMet) };
}
