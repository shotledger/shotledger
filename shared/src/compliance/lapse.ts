// When a met requirement stops being met if nothing more is logged — the date
// behind "log your next session by …" (#795). Spec:
// docs/specs/compliance-next-session-spec.md.
//
// The lapse is defined by the status functions themselves, never by a second
// formula: it is the first instant after `now` at which the same function, on
// the same sessions, no longer says "met". So it inherits their window
// arithmetic exactly, month-end clamping included.
import { computeFirearmCriterion } from './firearm-criteria';
import { applicableRules, computeRuleLicenseActivity } from './license-activity';
import { subtractMonthsUtc } from './months';
import type {
  ComplianceRule,
  ComplianceSession,
  FirearmComplianceRule,
  FirearmFact,
  JurisdictionProfile,
} from './types';

const DAY_MS = 86_400_000;

/**
 * The first instant after `now` at which `met` turns false, or `null` when it
 * is not met at `now` or never turns false.
 *
 * `met` must be true or false by comparing session instants with `t` and with
 * `subtractMonthsUtc(t, k)` for `k` in `edgeMonths`, and must only become
 * truer as sessions are added. Within one UTC day such an edge is that day's
 * month-shifted midnight plus `t`'s time of day, so a session leaves a window
 * exactly one millisecond after the edge reaches it; across midnight the edge
 * can jump forward (May 1 − 1 month is Apr 1, Apr 30 − 1 month is Mar 30).
 * Those instants are the only ones at which a met requirement can lapse, so
 * they are the only ones evaluated.
 *
 * @Requirements COMPL_003
 */
function firstLapse(
  sessions: readonly ComplianceSession[],
  edgeMonths: readonly number[],
  now: Date,
  met: (t: Date) => boolean,
): string | null {
  if (!met(now)) return null;
  const nowMs = now.getTime();
  const times = sessions.map((s) => new Date(s.startedAt).getTime());
  // `edgeMonths[0]` bounds the most recent window, which every requirement of
  // at least one activity needs a session in. That edge is never more than 31
  // days a month behind `t`, so past the horizon the window is empty for good.
  const reachMs = edgeMonths[0]! * 31 * DAY_MS;
  const horizonMs = times.reduce((a, b) => Math.max(a, b), nowMs) + reachMs + DAY_MS;

  const day = new Date(nowMs);
  day.setUTCHours(0, 0, 0, 0);
  for (let dayMs = day.getTime(); dayMs < horizonMs; dayMs += DAY_MS) {
    const candidates = [dayMs];
    for (const k of edgeMonths) {
      const edgeMs = subtractMonthsUtc(new Date(dayMs), k).getTime();
      for (const ms of times) {
        // The edge reaches this session today when it is within a day ahead.
        const offset = ms - edgeMs;
        if (Math.floor(offset / DAY_MS) === 0) candidates.push(dayMs + offset + 1);
      }
    }
    const lapse = candidates
      .filter((ms) => ms > nowMs)
      .sort((a, b) => a - b)
      .find((ms) => !met(new Date(ms)));
    if (lapse !== undefined) return new Date(lapse).toISOString();
  }
  return null;
}

/** When a 5 §/6 § rule stops being green with no further session logged. */
export function computeRuleLapse(
  sessions: readonly ComplianceSession[],
  rule: ComplianceRule,
  now: Date = new Date(),
): string | null {
  return firstLapse(
    sessions,
    [rule.windowMonths],
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
  const edgeMonths = Array.from(
    { length: rule.windowCount },
    (_, n) => rule.windowMonths * (n + 1),
  );
  return firstLapse(
    sessions,
    edgeMonths,
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
