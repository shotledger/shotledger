// Behaviors D1-D10, W1-W3, L1-L3, S1 and properties P1-P5 of
// docs/specs/compliance-local-days-spec.md. Vitest runs with
// TZ=Europe/Stockholm, so "local" below is Swedish time.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { computeFirearmCriterion } from './firearm-criteria';
import { computeFirearmCriterionLapse, computeRuleLapse } from './lapse';
import { computeRuleLicenseActivity } from './license-activity';
import { addDays, addMonthsClamped, localDayStart } from './months';
import { computeFirearmCriterionShortfall } from './shortfall';
import type {
  ComplianceRule,
  ComplianceSession,
  FirearmComplianceRule,
  FirearmFact,
} from './types';

const GUN = 'firearm-1';

/** A local wall-clock instant. */
function local(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min);
}

/** The ISO instant of local midnight starting the given day. */
function midnight(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d).toISOString();
}

function session(when: Date, overrides: Partial<ComplianceSession> = {}): ComplianceSession {
  return {
    id: `${when.getTime()}-${Math.random()}`,
    startedAt: when.toISOString(),
    type: 'training',
    firearmId: GUN,
    ...overrides,
  };
}

function rule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
  return {
    scope: 'shooter',
    windowMonths: 6,
    requiredActivities: 6,
    countsAs: { training: 1, competition: 1 },
    ...overrides,
  } as ComplianceRule;
}

function renewal(overrides: Partial<FirearmComplianceRule> = {}): FirearmComplianceRule {
  return {
    criterionId: 'renewal',
    purpose: 'renewal',
    windowMonths: 12,
    windowCount: 2,
    requiredActivities: 4,
    countsAs: { training: 1, competition: 1 },
    appliesTo: () => true,
    ...overrides,
  };
}

function firearm(): FirearmFact {
  return { id: GUN, weaponType: 'pistol', isOwn: true, hasTimeLimitedPermit: true };
}

/** Six sessions: the oldest on `oldest`, five more in the last week before `today`. */
function sixWithOldest(oldest: Date, today: Date): ComplianceSession[] {
  return [
    session(oldest),
    ...Array.from({ length: 5 }, (_, i) => session(addDays(localDayStart(today), -(i + 1)))),
  ];
}

describe('local-day arithmetic', () => {
  it('localDayStart is local midnight of the same local day', () => {
    expect(localDayStart(local(2027, 3, 31, 23, 59)).toISOString()).toBe(midnight(2027, 3, 31));
    expect(localDayStart(local(2027, 4, 1, 0, 30)).toISOString()).toBe(midnight(2027, 4, 1));
  });

  it('addMonthsClamped keeps the day number when it exists', () => {
    expect(addMonthsClamped(local(2027, 4, 1, 0), -6).toISOString()).toBe(midnight(2026, 10, 1));
    expect(addMonthsClamped(local(2026, 10, 13, 0), 12).toISOString()).toBe(midnight(2027, 10, 13));
  });

  it('addMonthsClamped clamps to the last day of a shorter month (1930:173)', () => {
    expect(addMonthsClamped(local(2027, 3, 31, 0), -6).toISOString()).toBe(midnight(2026, 9, 30));
    expect(addMonthsClamped(local(2027, 3, 31, 0), -1).toISOString()).toBe(midnight(2027, 2, 28));
    expect(addMonthsClamped(local(2028, 3, 31, 0), -1).toISOString()).toBe(midnight(2028, 2, 29));
    expect(addMonthsClamped(local(2027, 8, 31, 0), -6).toISOString()).toBe(midnight(2027, 2, 28));
  });

  it('addMonthsClamped returns local midnight whatever the time of day', () => {
    expect(addMonthsClamped(local(2027, 4, 1, 18, 45), -6).toISOString()).toBe(
      midnight(2026, 10, 1),
    );
  });

  it('addDays moves whole local days across a DST change', () => {
    expect(addDays(local(2027, 3, 27, 0), 1).toISOString()).toBe(midnight(2027, 3, 28));
    expect(addDays(local(2027, 3, 28, 0), 1).toISOString()).toBe(midnight(2027, 3, 29));
    expect(addDays(local(2027, 10, 31, 0), -1).toISOString()).toBe(midnight(2027, 10, 30));
  });
});

describe('a rule counts whole local days', () => {
  it('D1: the start day is inclusive', () => {
    const today = local(2027, 4, 1);
    const sessions = sixWithOldest(local(2026, 10, 1, 9), today);
    const activity = computeRuleLicenseActivity(sessions, rule(), today);
    expect(activity.activityCount).toBe(6);
    expect(activity.status).toBe('green');
    expect(activity.windowStartIso).toBe(midnight(2026, 10, 1));
  });

  it('D2: one day later the oldest has left', () => {
    const sessions = sixWithOldest(local(2026, 10, 1, 9), local(2027, 4, 1));
    expect(computeRuleLicenseActivity(sessions, rule(), local(2027, 4, 2)).status).toBe('amber');
  });

  it('D3: on 31 March the window starts 30 September, not 1 October', () => {
    const today = local(2027, 3, 31);
    const sessions = sixWithOldest(local(2026, 9, 30, 20), today);
    const activity = computeRuleLicenseActivity(sessions, rule(), today);
    expect(activity.status).toBe('green');
    expect(activity.windowStartIso).toBe(midnight(2026, 9, 30));
  });

  it('D4: a session on 29 September is outside it', () => {
    const today = local(2027, 3, 31);
    const sessions = sixWithOldest(local(2026, 9, 29, 20), today);
    expect(computeRuleLicenseActivity(sessions, rule(), today).status).toBe('amber');
  });

  it('D5: a session at 00:30 local belongs to its local day, not the UTC one', () => {
    const today = local(2027, 4, 1);
    // 00:30 in Stockholm on 1 October is 22:30 UTC on 30 September.
    const sessions = sixWithOldest(local(2026, 10, 1, 0, 30), today);
    expect(computeRuleLicenseActivity(sessions, rule(), today).status).toBe('green');
  });

  it('D6: two sessions on the same day leave on the same day', () => {
    const r = rule({ requiredActivities: 2 });
    const sessions = [session(local(2026, 10, 1, 8)), session(local(2026, 10, 1, 20))];
    expect(computeRuleLicenseActivity(sessions, r, local(2027, 4, 1, 23, 59)).activityCount).toBe(
      2,
    );
    expect(computeRuleLicenseActivity(sessions, r, local(2027, 4, 2, 0, 0)).activityCount).toBe(0);
  });

  it('D7: the first and last instant of a day give the same result', () => {
    const sessions = sixWithOldest(local(2026, 10, 1, 9), local(2027, 4, 1));
    const early = computeRuleLicenseActivity(sessions, rule(), new Date(2027, 3, 1, 0, 0, 0, 0));
    const late = computeRuleLicenseActivity(
      sessions,
      rule(),
      new Date(2027, 3, 1, 23, 59, 59, 999),
    );
    expect(late).toEqual(early);
  });

  it('D7: a session later today counts from the start of today', () => {
    const r = rule({ requiredActivities: 1 });
    const sessions = [session(local(2027, 4, 1, 20))];
    expect(computeRuleLicenseActivity(sessions, r, local(2027, 4, 1, 8)).activityCount).toBe(1);
  });

  it('D8: a DST change inside the window changes nothing', () => {
    const r = rule({ windowMonths: 12, requiredActivities: 2 });
    const sessions = [session(local(2027, 3, 28, 1)), session(local(2027, 10, 31, 23))];
    expect(computeRuleLicenseActivity(sessions, r, local(2027, 10, 31)).activityCount).toBe(2);
    expect(computeRuleLicenseActivity(sessions, r, local(2028, 3, 28)).windowStartIso).toBe(
      midnight(2027, 3, 28),
    );
  });

  it('D9: a one-month window on 31 March starts 28 February', () => {
    const activity = computeRuleLicenseActivity([], rule({ windowMonths: 1 }), local(2027, 3, 31));
    expect(activity.windowStartIso).toBe(midnight(2027, 2, 28));
  });

  it('D10: twelve months back from 29 February is 28 February', () => {
    const activity = computeRuleLicenseActivity([], rule({ windowMonths: 12 }), local(2028, 2, 29));
    expect(activity.windowStartIso).toBe(midnight(2027, 2, 28));
  });

  it('a session dated after today does not count yet', () => {
    const r = rule({ requiredActivities: 1 });
    const sessions = [session(local(2027, 4, 2, 0, 5))];
    expect(computeRuleLicenseActivity(sessions, r, local(2027, 4, 1, 23)).activityCount).toBe(0);
  });
});

describe('criterion windows tile whole local days', () => {
  const today = local(2027, 10, 13);

  it('W1: the day twelve months back belongs to the recent year', () => {
    const result = computeFirearmCriterion(
      [session(local(2026, 10, 13, 9))],
      renewal(),
      firearm(),
      today,
    );
    expect(result.periods.map((p) => p.activityCount)).toEqual([1, 0]);
  });

  it('W2: the day before it belongs to the older year', () => {
    const result = computeFirearmCriterion(
      [session(local(2026, 10, 12, 23))],
      renewal(),
      firearm(),
      today,
    );
    expect(result.periods.map((p) => p.activityCount)).toEqual([0, 1]);
  });

  it('W3: each window ends on its own last day, with no shared day', () => {
    const result = computeFirearmCriterion([], renewal(), firearm(), today);
    expect(result.periods.map((p) => [p.startIso, p.endIso])).toEqual([
      [midnight(2026, 10, 13), midnight(2027, 10, 13)],
      [midnight(2025, 10, 13), midnight(2026, 10, 12)],
    ]);
  });

  it('the first day of the oldest window counts; the day before does not', () => {
    const sessions = [session(local(2025, 10, 13, 0, 10)), session(local(2025, 10, 12, 23, 50))];
    const result = computeFirearmCriterion(sessions, renewal(), firearm(), today);
    expect(result.periods.map((p) => p.activityCount)).toEqual([0, 1]);
  });

  it('a session outside the span is not counted as another firearm', () => {
    const sessions = [session(local(2025, 10, 12, 23, 50), { firearmId: 'other' })];
    const result = computeFirearmCriterion(sessions, renewal(), firearm(), today);
    expect(result.otherFirearmSessionCount).toBe(0);
  });

  it('a session later today counts in the recent window', () => {
    const result = computeFirearmCriterion(
      [session(local(2027, 10, 13, 22), { firearmId: 'other' }), session(local(2027, 10, 13, 22))],
      renewal(),
      firearm(),
      local(2027, 10, 13, 6),
    );
    expect(result.periods[0]!.activityCount).toBe(1);
    expect(result.otherFirearmSessionCount).toBe(1);
  });

  it('month-end clamping applies to every boundary', () => {
    const result = computeFirearmCriterion(
      [],
      renewal({ windowMonths: 6, windowCount: 2 }),
      firearm(),
      local(2027, 8, 31),
    );
    expect(result.periods.map((p) => [p.startIso, p.endIso])).toEqual([
      [midnight(2027, 2, 28), midnight(2027, 8, 31)],
      [midnight(2026, 8, 31), midnight(2027, 2, 27)],
    ]);
  });
});

describe('the lapse is a local midnight', () => {
  it('L1: lapses at the start of the day after the oldest leaves', () => {
    const today = local(2026, 10, 13);
    const sessions = sixWithOldest(local(2026, 5, 10, 9), today);
    expect(computeRuleLapse(sessions, rule(), today)).toBe(midnight(2026, 11, 11));
  });

  it('L2: a session on 31 March is still in on 30 September and gone on 1 October', () => {
    const today = local(2026, 9, 15);
    const sessions = sixWithOldest(local(2026, 3, 31, 9), today);
    expect(computeRuleLapse(sessions, rule(), today)).toBe(midnight(2026, 10, 1));
  });

  it('L2: from 31 August the window start clamps to 28 February', () => {
    const r = rule({ requiredActivities: 1 });
    const sessions = [session(local(2027, 2, 28, 9))];
    // 31 August − 6 months = 28 February, so the session is still in on 31 August.
    expect(computeRuleLapse(sessions, r, local(2027, 8, 20))).toBe(midnight(2027, 9, 1));
  });

  it('L3: not met today has no lapse', () => {
    expect(computeRuleLapse([], rule(), local(2026, 10, 13))).toBeNull();
  });

  it('a renewal criterion lapses at a local midnight', () => {
    const today = local(2027, 10, 13);
    const sessions = [
      ...[1, 2, 3, 4].map((d) => session(local(2027, 1, d))),
      ...[1, 2, 3, 4].map((d) => session(local(2026, 1, d))),
    ];
    // On 2028-01-02 the older year starts after 2026-01-01 and the recent one
    // after 2027-01-01, so each holds three.
    expect(computeFirearmCriterionLapse(sessions, renewal(), firearm(), today)).toBe(
      midnight(2028, 1, 2),
    );
  });
});

describe('the shortfall gives a local day', () => {
  it('S1: metFrom is the start of the first day the short older year can be met', () => {
    const today = local(2027, 10, 13);
    // Recent year full; the older year [2025-10-13, 2026-10-12] has none.
    const sessions = [1, 2, 3, 4].map((d) => session(local(2027, 1, d)));
    const shortfall = computeFirearmCriterionShortfall(sessions, renewal(), firearm(), today);
    expect(shortfall.olderPeriods).toHaveLength(1);
    // On 2028-01-05 the older year is [2026-01-05, 2027-01-04] and holds the
    // four sessions of 2027-01-01..04; before that it has ended short.
    expect(shortfall.metFromIso).toBe(midnight(2028, 1, 5));
  });

  it('S1: an older year ending today can still take a session today', () => {
    const today = local(2027, 10, 13);
    const sessions = [session(local(2025, 10, 13, 9))];
    // Older year [2025-10-13, 2026-10-12] has 1; it has ended, so no.
    const shortfall = computeFirearmCriterionShortfall(sessions, renewal(), firearm(), today);
    expect(Date.parse(shortfall.metFromIso!)).toBeGreaterThan(today.getTime());
  });
});

// ---------------------------------------------------------------- properties

const dayArb = fc.integer({ min: -3 * 366, max: 3 * 366 });
const minuteArb = fc.integer({ min: 0, max: 24 * 60 - 1 });
const BASE = local(2027, 1, 15, 0);

function instant(day: number, minute: number): Date {
  const d = addDays(BASE, day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minute);
}

const sessionsArb = fc.array(
  fc.record({ day: dayArb, minute: minuteArb, competition: fc.boolean() }),
  { maxLength: 12 },
);

function build(raw: { day: number; minute: number; competition: boolean }[]): ComplianceSession[] {
  return raw.map((s) =>
    session(instant(s.day, s.minute), { type: s.competition ? 'competition' : 'training' }),
  );
}

/** Plain calendar-date reference for "today − k months, clamped". */
function referenceStart(today: Date, months: number): [number, number, number] {
  const total = today.getFullYear() * 12 + today.getMonth() - months;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  const last = new Date(y, m + 1, 0).getDate();
  return [y, m, Math.min(today.getDate(), last)];
}

function ymd(d: Date): [number, number, number] {
  return [d.getFullYear(), d.getMonth(), d.getDate()];
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

describe('properties', () => {
  it('P1: every instant of a local day gives the same status', () => {
    fc.assert(
      fc.property(
        sessionsArb,
        dayArb,
        minuteArb,
        minuteArb,
        fc.integer({ min: 1, max: 24 }),
        (raw, day, m1, m2, months) => {
          const sessions = build(raw);
          const r = rule({ windowMonths: months, requiredActivities: 2 });
          const a = computeRuleLicenseActivity(sessions, r, instant(day, m1));
          const b = computeRuleLicenseActivity(sessions, r, instant(day, m2));
          expect(b).toEqual(a);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('P2: a session counts exactly when its local day is in [today − N, today]', () => {
    fc.assert(
      fc.property(
        dayArb,
        minuteArb,
        dayArb,
        minuteArb,
        fc.integer({ min: 1, max: 24 }),
        (sd, sm, td, tm, months) => {
          const when = instant(sd, sm);
          const now = instant(td, tm);
          const r = rule({ windowMonths: months, requiredActivities: 1 });
          const counted = computeRuleLicenseActivity([session(when)], r, now).activityCount === 1;
          const day = ymd(when);
          const expected = cmp(day, referenceStart(now, months)) >= 0 && cmp(day, ymd(now)) <= 0;
          expect(counted).toBe(expected);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('P3: criterion windows tile the span, each session in at most one', () => {
    fc.assert(
      fc.property(
        sessionsArb,
        dayArb,
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 3 }),
        (raw, td, months, count) => {
          const sessions = build(raw);
          const now = instant(td, 600);
          const r = renewal({ windowMonths: months, windowCount: count, requiredActivities: 1 });
          const result = computeFirearmCriterion(sessions, r, firearm(), now);
          for (let n = 0; n + 1 < result.periods.length; n += 1) {
            const newer = result.periods[n]!;
            const older = result.periods[n + 1]!;
            expect(addDays(new Date(older.endIso), 1).toISOString()).toBe(newer.startIso);
          }
          const spanStart = Date.parse(result.periods.at(-1)!.startIso);
          const today = localDayStart(now).getTime();
          const inSpan = sessions.filter((s) => {
            const d = localDayStart(new Date(s.startedAt)).getTime();
            return d >= spanStart && d <= today;
          }).length;
          const total = result.periods.reduce((sum, p) => sum + p.countedSessionCount, 0);
          expect(total).toBe(inSpan);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('P4: met through the day before the lapse, not met on its day', () => {
    fc.assert(
      fc.property(
        sessionsArb,
        dayArb,
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 1, max: 4 }),
        (raw, td, months, required) => {
          const sessions = build(raw);
          const now = instant(td, 720);
          const r = rule({ windowMonths: months, requiredActivities: required });
          const met = (t: Date) => computeRuleLicenseActivity(sessions, r, t).status === 'green';
          const lapse = computeRuleLapse(sessions, r, now);
          if (!met(now)) {
            expect(lapse).toBeNull();
            return;
          }
          expect(lapse).not.toBeNull();
          const lapseDay = new Date(lapse!);
          expect(lapseDay.toISOString()).toBe(localDayStart(lapseDay).toISOString());
          expect(met(lapseDay)).toBe(false);
          for (let d = localDayStart(now); d < lapseDay; d = addDays(d, 1)) {
            expect(met(d)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('P4: the same for a per-firearm criterion', () => {
    fc.assert(
      fc.property(
        sessionsArb,
        dayArb,
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 3 }),
        (raw, td, months, count) => {
          const sessions = build(raw);
          const now = instant(td, 720);
          const r = renewal({ windowMonths: months, windowCount: count, requiredActivities: 1 });
          const met = (t: Date) => computeFirearmCriterion(sessions, r, firearm(), t).met;
          const lapse = computeFirearmCriterionLapse(sessions, r, firearm(), now);
          if (!met(now)) {
            expect(lapse).toBeNull();
            return;
          }
          const lapseDay = new Date(lapse!);
          expect(met(lapseDay)).toBe(false);
          expect(met(new Date(lapseDay.getTime() - 1))).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('P5: clamping never rolls into the next month, and back-and-forth never overshoots', () => {
    fc.assert(
      fc.property(dayArb, fc.integer({ min: -36, max: 36 }), (day, k) => {
        const start = addDays(BASE, day);
        const moved = addMonthsClamped(start, k);
        const months = start.getFullYear() * 12 + start.getMonth() + k;
        expect(moved.getFullYear() * 12 + moved.getMonth()).toBe(months);
        expect(moved.toISOString()).toBe(localDayStart(moved).toISOString());
        const back = addMonthsClamped(moved, -k);
        expect(back.getTime()).toBeLessThanOrEqual(start.getTime());
      }),
      { numRuns: 500 },
    );
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_COMPL_005
 */
it('counts a window in whole local days, first day included and month ends clamped', () => {
  const one = rule({ requiredActivities: 1 });
  const onFirstDay = [session(local(2026, 9, 30, 0, 5))];
  const dayBefore = [session(local(2026, 9, 29, 23, 55))];
  const morning = new Date(2027, 2, 31, 0, 0);
  const evening = new Date(2027, 2, 31, 23, 59, 59, 999);
  for (const now of [morning, evening]) {
    expect(computeRuleLicenseActivity(onFirstDay, one, now).windowStartIso).toBe(
      midnight(2026, 9, 30),
    );
    expect(computeRuleLicenseActivity(onFirstDay, one, now).activityCount).toBe(1);
    expect(computeRuleLicenseActivity(dayBefore, one, now).activityCount).toBe(0);
  }
});
