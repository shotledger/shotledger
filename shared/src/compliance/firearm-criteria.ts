// The two criteria PM 551.24 puts under "Intyget avser" — checkboxes a club
// ticks per firearm, not the shooter's standing activity level. Spec:
// docs/specs/compliance-firearm-criteria-spec.md (#329).
//
// These never touch `profile.rules`: 5 §/6 § are requirements on the person
// and count every session whatever it was shot with, while these count only
// sessions attributed to one firearm. Keeping the two apart is what stops a
// firearm's own tally from being read as the shooter's (#319).
import { subtractMonthsUtc } from './months';
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
 * The windows to check, most recent first, tiling backwards from `now` with
 * no gap and no overlap: window n is [now − (n+1)·months, now − n·months].
 */
function windowsFor(rule: FirearmComplianceRule, now: Date): { start: Date; end: Date }[] {
  const windows: { start: Date; end: Date }[] = [];
  for (let n = 0; n < rule.windowCount; n += 1) {
    windows.push({
      start: subtractMonthsUtc(now, rule.windowMonths * (n + 1)),
      end: subtractMonthsUtc(now, rule.windowMonths * n),
    });
  }
  return windows;
}

/** One criterion against one firearm. */
export function computeFirearmCriterion(
  sessions: readonly ComplianceSession[],
  rule: FirearmComplianceRule,
  firearm: FirearmFact,
  now: Date = new Date(),
): FirearmCriterionActivity {
  const windows = windowsFor(rule, now);
  // The whole span the criterion looks at, for the two honesty figures: a
  // session outside every window is not "not counted", it is simply not in
  // the period the form asks about.
  const spanStartMs = subtractMonthsUtc(now, rule.windowMonths * rule.windowCount).getTime();
  const spanEndMs = now.getTime();

  let otherFirearmSessionCount = 0;
  let unattributedSessionCount = 0;
  for (const session of sessions) {
    const t = new Date(session.startedAt).getTime();
    if (t < spanStartMs || t > spanEndMs) continue;
    const id = session.firearmId ?? null;
    if (id === firearm.id) continue;
    if (id === null) unattributedSessionCount += 1;
    else otherFirearmSessionCount += 1;
  }

  const periods: FirearmCriterionPeriod[] = windows.map((window) => {
    const startMs = window.start.getTime();
    const endMs = window.end.getTime();
    let activityCount = 0;
    let countedSessionCount = 0;
    for (const session of sessions) {
      if ((session.firearmId ?? null) !== firearm.id) continue;
      const t = new Date(session.startedAt).getTime();
      // Half-open at the end so consecutive windows cannot both claim a
      // session landing exactly on the boundary; the most recent window is
      // closed at `now` because nothing follows it.
      if (t < startMs) continue;
      if (endMs === spanEndMs ? t > endMs : t >= endMs) continue;
      countedSessionCount += 1;
      activityCount +=
        session.type === 'training' ? rule.countsAs.training : rule.countsAs.competition;
    }
    return {
      startIso: window.start.toISOString(),
      endIso: window.end.toISOString(),
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
