// The two criteria PM 551.24 puts under "Intyget avser" — checkboxes a club
// ticks per firearm, not the shooter's standing activity level. Spec:
// docs/specs/compliance-firearm-criteria-spec.md (#329).
//
// These never touch `profile.rules`: 5 §/6 § are requirements on the person
// and count every session whatever it was shot with, while these count only
// sessions attributed to one firearm. Keeping the two apart is what stops a
// firearm's own tally from being read as the shooter's (#319).
import { addDays, addMonthsClamped, localDayStart } from './months';
import { statusFor } from './status';
import type {
  ComplianceSession,
  FirearmComplianceRule,
  FirearmCriterionActivity,
  FirearmCriterionPeriod,
  FirearmFact,
  JurisdictionProfile,
} from './types';

/**
 * The windows to check, most recent first, as whole local days tiling back from
 * today with no gap and no overlap (#816): window n runs from today − (n+1)·N
 * months to the day before today − n·N months, and window 0 to today itself.
 */
function windowsFor(rule: FirearmComplianceRule, today: Date): { first: Date; last: Date }[] {
  const windows: { first: Date; last: Date }[] = [];
  for (let n = 0; n < rule.windowCount; n += 1) {
    windows.push({
      first: addMonthsClamped(today, -rule.windowMonths * (n + 1)),
      last: n === 0 ? today : addDays(addMonthsClamped(today, -rule.windowMonths * n), -1),
    });
  }
  return windows;
}

/** Local midnight of the day a session was shot, as ms. */
function sessionDayMs(session: ComplianceSession): number {
  return localDayStart(new Date(session.startedAt)).getTime();
}

/** One criterion against one firearm. */
export function computeFirearmCriterion(
  sessions: readonly ComplianceSession[],
  rule: FirearmComplianceRule,
  firearm: FirearmFact,
  now: Date = new Date(),
): FirearmCriterionActivity {
  const today = localDayStart(now);
  const windows = windowsFor(rule, today);
  // The whole span the criterion looks at, for the two honesty figures: a
  // session outside every window is not "not counted", it is simply not in
  // the period the form asks about.
  const spanStartMs = addMonthsClamped(today, -rule.windowMonths * rule.windowCount).getTime();
  const spanEndMs = today.getTime();

  let otherFirearmSessionCount = 0;
  let unattributedSessionCount = 0;
  for (const session of sessions) {
    const day = sessionDayMs(session);
    if (day < spanStartMs || day > spanEndMs) continue;
    const id = session.firearmId ?? null;
    if (id === firearm.id) continue;
    if (id === null) unattributedSessionCount += 1;
    else otherFirearmSessionCount += 1;
  }

  const periods: FirearmCriterionPeriod[] = windows.map((window) => {
    const firstMs = window.first.getTime();
    const lastMs = window.last.getTime();
    let activityCount = 0;
    let countedSessionCount = 0;
    for (const session of sessions) {
      if ((session.firearmId ?? null) !== firearm.id) continue;
      const day = sessionDayMs(session);
      if (day < firstMs || day > lastMs) continue;
      countedSessionCount += 1;
      activityCount +=
        session.type === 'training' ? rule.countsAs.training : rule.countsAs.competition;
    }
    return {
      startIso: window.first.toISOString(),
      endIso: window.last.toISOString(),
      activityCount,
      countedSessionCount,
      met: activityCount >= rule.requiredActivities,
    };
  });

  // The worst window decides: "fyra gånger per år under de senaste två åren"
  // is satisfied by each year, not by their total.
  const worstCount = periods.reduce((worst, p) => Math.min(worst, p.activityCount), Infinity);

  return {
    criterionId: rule.criterionId,
    firearmId: firearm.id,
    windowMonths: rule.windowMonths,
    windowCount: rule.windowCount,
    requiredActivities: rule.requiredActivities,
    periods,
    activityCount: worstCount,
    met: periods.every((p) => p.met),
    status: statusFor(worstCount, rule.requiredActivities),
    otherFirearmSessionCount,
    unattributedSessionCount,
  };
}

/**
 * Every criterion in the profile that covers this firearm, in profile order.
 * A firearm the proxies do not cover gets an empty list rather than a
 * fabricated "not applicable" result.
 */
export function computeFirearmCriteria(
  sessions: readonly ComplianceSession[],
  profile: JurisdictionProfile | null,
  firearm: FirearmFact,
  now: Date = new Date(),
): FirearmCriterionActivity[] {
  if (!profile) return [];
  return profile.firearmCriteria
    .filter((rule) => rule.appliesTo(firearm))
    .map((rule) => computeFirearmCriterion(sessions, rule, firearm, now));
}
