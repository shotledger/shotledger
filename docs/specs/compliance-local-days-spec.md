# License-activity windows in whole local days — executable spec

Scope: `shared/src/compliance/**` (old-coder mandatory per CLAUDE.md). Issue
[#816](https://github.com/jimisola/shotledger/issues/816). Changes how the
windows of [`m6-compliance-spec.md`](m6-compliance-spec.md),
[`compliance-firearm-criteria-spec.md`](compliance-firearm-criteria-spec.md),
[`compliance-next-session-spec.md`](compliance-next-session-spec.md) and
[`compliance-license-check-spec.md`](compliance-license-check-spec.md) are
counted. Their numbers (6 months, 12/6 required, 2 in 6 months, 4 per year for
two years) are unchanged.

**Spec approval: pending.**

**Tier 2.** No new regulatory value. The change is how "de senaste sex
månaderna" is read at day level, which the source does not state.

## Source

- **PM 551.24** (p. 1 and "Förklaringar", p. 3) says "de senaste sex
  månaderna" and "minst fyra gånger per år under de senaste två åren". It names
  no anchor date, no inclusive day and no time of day.
- **SHB 2026** Bilaga 8 (p. 484) has the club's own intyg rules and does not
  refer to FAP 551-3.
- **Lag (1930:173) om beräknande av lagstadgad tid, 1 §**: a period counted in
  months ends on the day with the same number in the end month; "Finnes ej
  motsvarande dag i slutmånaden, varde den månadens sista dag ansedd för
  slutdag." It governs statutory deadlines, not this form, and is used here as
  the nearest Swedish convention.

Maintainer defaults (#816, 2026-10-13, open to his veto): the start day is
inclusive, and days are the device's local calendar days.

## Today's behaviour (what changes)

Windows are instants: `now − N months` in UTC with JavaScript's month rollover
(`subtractMonthsUtc`; 31 March − 6 months = 1 October), and a session counts by
its instant. So the status can change in the evening of 31 March, or at 01:00
or 02:00 local time, and two sessions on the same day can leave the window
hours apart.

## The rule

1. **A session's day** is the local calendar date of its `startedAt`.
2. **Today** is the local calendar date of `now`.
3. **Month arithmetic** `D − k months` keeps the day number. When the target
   month has no such day, it is that month's last day (1930:173), never a
   rollover. 31 March − 6 = 30 September; 31 March − 1 = 28 (29) February;
   31 August − 6 = 28 (29) February.
4. **A rule** (5 §/6 §) counts the sessions whose day `d` satisfies
   `today − N months ≤ d ≤ today`. The start day is inclusive.
5. **A per-firearm criterion** with `windowCount` windows of `N` months:
   window 0 is `[today − N, today]`; window `n ≥ 1` is
   `[today − (n+1)·N, today − n·N)`, the end day belonging to the newer window.
   The windows tile with no gap and no overlap.
6. A session dated after today counts from its own day on.
7. Every instant inside one local day gives the same result. The status can
   change only at local midnight.

### What the outputs carry

The ISO fields keep their names and types, so the screens do not change.

- `windowStartIso` and a period's `startIso` are the local midnight that starts
  the first day of the window.
- A period's `endIso` is the local midnight that starts the **last day** in the
  window. For window 0 that day is today; for the older windows it is the day
  before the newer window starts. A screen showing "from – to" therefore shows
  days that do not overlap.
- **Lapse** (#795) is the local midnight that starts the first day on which
  the requirement is not met. `nextSessionDeadline(lapse) = lapse − 1 ms` falls
  on the last met day, as before.
- **`metFromIso`** (#804) is the local midnight that starts the first day on
  which a short older window has rolled out (or now, as before, when only the
  recent window is short).

### Computing the lapse

Because the status is constant within a day (rule 7), the lapse is found by
evaluating the status at each local midnight from tomorrow up to the horizon:
the last session day or today, whichever is later, plus the largest window
offset, plus one day. Past it every window is empty and a requirement with
`required > 0` is not met. This replaces the instant scan in `scan.ts`.

## Scenarios

Rule: 6 months, 6 required. The tests run with `TZ=Europe/Stockholm`. Local
dates are written `YYYY-MM-DD`.

| #   | Given                                                               | Then                                                                    |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| D1  | today 2027-04-01; 6 sessions, oldest on 2026-10-01                  | green (start day inclusive)                                             |
| D2  | today 2027-04-02; same sessions                                     | amber                                                                   |
| D3  | today 2027-03-31; oldest on 2026-09-30                              | green; window starts 2026-09-30 (clamp, no rollover)                    |
| D4  | today 2027-03-31; oldest on 2026-09-29                              | amber                                                                   |
| D5  | a session at 00:30 local (22:30 UTC the day before)                 | belongs to its local day                                                |
| D6  | two sessions on the same day, 08:00 and 20:00                       | leave the window on the same day                                        |
| D7  | `now` at 00:00:00.000 and at 23:59:59.999 on one local day          | the same status, counts and window                                      |
| D8  | DST change day (2027-03-28, 2027-10-31) inside the window           | counts unchanged; midnights computed locally                            |
| D9  | 1-month rule, today 2027-03-31                                      | window starts 2027-02-28                                                |
| D10 | today 2028-02-29 (leap), 12 months                                  | window starts 2027-02-28                                                |
| W1  | renewal (12 × 2, 4 each), today 2027-10-13; a session on 2026-10-13 | counts in window 0 (start day inclusive), not in window 1               |
| W2  | same; a session on 2026-10-12                                       | window 1                                                                |
| W3  | same                                                                | window 0 ends 2027-10-13, window 1 ends 2026-10-12: no shared day       |
| L1  | exactly 6, oldest on 2026-05-10, today 2026-10-13                   | lapse is local midnight starting 2026-11-11; next session by 2026-11-10 |
| L2  | oldest on 2026-03-31, today 2026-09-15                              | green through 2026-09-30, lapse at the start of 2026-10-01 (clamp)      |
| L3  | not met today                                                       | `null`                                                                  |
| S1  | renewal, window 1 short and already ended                           | `metFromIso` is the local midnight that starts the day it rolls out     |

Properties (fast-check, random sessions across ±3 years, random `now`, random
1–24-month windows):

- **P1** Status at any two instants of the same local day is equal.
- **P2** A session counts in a rule exactly when its local day is in
  `[today − N, today]` with the clamped arithmetic (checked against a
  reference written as a plain date comparison).
- **P3** Criterion windows tile: every day in the span belongs to exactly one
  window.
- **P4** The lapse `L`, if any: met on the day before `L`, not met on the day
  of `L`, met on every day from today to the day before `L`.
- **P5** `addMonthsClamped` never rolls into the next month, and moving back
  `k` months then forward `k` gives a day no later than the start.

## Must not

- **N1** Change any number in a profile, or the 5 §/6 §/criterion structure.
- **N2** Change a status anywhere except near window edges and month ends:
  existing tests whose data sits mid-window pass unchanged. Tests whose
  expected values encode the old rollover or UTC edges are rewritten to the
  new rule and listed in the evidence report, never deleted.
- **N3** Add a dependency or a time-zone database: local dates come from the
  runtime's own `Date` (device time zone on the phone).
- **N4** Change the screens beyond what the outputs above already carry.

## Out of scope

- The Bilaga 8 "months of activity" figure (`wholeMonthsBetween`) still counts
  in UTC. Moving it to local days is a follow-up if wanted.
- A Swedish-time choice for a shooter abroad. Device time is the default chosen
  in #816.
