# Next-session date for a met requirement — executable spec

Scope: `shared/src/compliance/**` (old-coder mandatory per CLAUDE.md) and the
phone screens that show licence activity. Issue
[#795](https://github.com/jimisola/shotledger/issues/795). Builds on
[`m6-compliance-spec.md`](m6-compliance-spec.md),
[`compliance-fap551-spec.md`](compliance-fap551-spec.md) and
[`compliance-firearm-criteria-spec.md`](compliance-firearm-criteria-spec.md);
the source, the numbers, the windows and the banding they settle are
unchanged and not restated.

**Amended by [`compliance-local-days-spec.md`](compliance-local-days-spec.md)
(#816):** windows count whole local days, so the lapse and the first day a
criterion can be met are local midnights, and a period's end is its last day.
The scan below is replaced by a day-by-day one.

**Spec approval: approved** by the maintainer on 2026-10-13. Issue #795 is the
maintainer's statement of what to build ("once a requirement has been met, show
the date by which you need to complete your next shooting session to maintain
your current status").

**Tier 2** (normal feature). No money, auth, concurrency or data loss. No new
regulatory value: the date is derived entirely from the rules and windows the
profile already declares.

**Setup plan:** no new dependency (`fast-check` is already a dev dependency),
no schema change, no new tooling. Files touched by path:

- `shared/src/compliance/lapse.ts` (new) + `lapse.test.ts`
- `shared/src/compliance/index.ts` — export it
- `app/src/features/compliance/use-license-activity.ts` — the Home lapse
- `app/src/features/firearms/use-firearm-detail.ts` — per-rule and
  per-criterion lapses
- `app/src/app/(tabs)/index.tsx`, `app/src/app/firearms/[id]/index.tsx`
- `app/src/i18n/{en,sv}.json`
- `docs/manual/guides/license-activity{,.sv}.md`,
  `docs/manual/explanation/license-activity{,.sv}.md`
- `docs/reqstool/requirements.yml`, `software_verification_cases.yml`
- `docs/implementation-plan.md` — the checkbox

The web app shows no licence activity at all today, so there is nothing for the
date to sit on there. That gap is filed as
[#796](https://github.com/jimisola/shotledger/issues/796), which carries this
date with it.

## The definition

Every status the app shows is a function of the logged sessions and the instant
it is evaluated at: `computeRuleLicenseActivity(sessions, rule, t)` and
`computeFirearmCriterion(sessions, rule, firearm, t)`. With no further session
logged, sessions only age out of the windows, so a met requirement eventually
stops being met.

> **The lapse** of a met requirement is the first instant `L > now` at which,
> evaluated with the same sessions and the same function, it is no longer met.

- For a 5 §/6 § rule "met" is `status === 'green'` (count ≥ required).
- For a per-firearm criterion "met" is `met` (every window ≥ required).
- A requirement not met at `now` has no lapse: `null`. The feature shows the
  date only once the requirement is met.
- A requirement that can never lapse (`requiredActivities <= 0`) has no lapse:
  `null`.

Because the lapse is defined by the existing functions rather than by a second
formula, it inherits their window arithmetic exactly, including the
calendar-month clamping `subtractMonthsUtc` documents (Mar 29 − 1 month is
Mar 1 in a non-leap year, and Mar 31 − 1 month is Mar 3). The app never shows a
date it does not itself act on.

**Shown as:** "Log your next session by _D_", where _D_ is the local calendar
date of `L − 1 ms`, the last instant the requirement is still met. A session
logged on or before _D_ that the rule counts keeps it met past `L`.

**Home** shows one date under the overall chip when the overall status is
green: the earliest lapse among the rules that apply. That is the first moment
the chip would change colour.

## How it is computed (and why it is exact)

Brute force over every millisecond is not possible; the computation evaluates
the real function only at the instants where its answer can change.

Within one UTC day, `subtractMonthsUtc(t, k)` is that day's month-shifted
midnight plus `t`'s time of day, because `setUTCMonth` keeps the time of day and
normalizes only the date. So between midnights each window edge moves in step
with `t`, and every comparison the functions make (`session < edge`,
`session > t`, `session >= edge`) can flip only where the two sides become equal
or one millisecond after. The candidates are therefore:

1. `now + 1 ms`;
2. every UTC midnight after `now` up to the horizon;
3. for each session `s`, each window-edge offset `k` (months) the requirement
   uses and each day `D`: the instant where `edge_k(t) = s` inside `D`, and one
   millisecond after;
4. each session's own instant and one millisecond after (a future-dated session
   entering the window).

Between two consecutive candidates every comparison is constant, so the status
is constant; the first candidate that is not met is the lapse. The **horizon**
is the latest of `now` and the newest session, plus the largest offset in days
counted as 31 per month, plus one day: past it every session is older than every
window edge, the count is 0, and a requirement with `required > 0` is not met.

Edge offsets: `[windowMonths]` for a rule; `windowMonths × n` for
`n = 1 … windowCount` for a criterion (the edges between its windows).

## Scenarios

Rule: 6 months, 6 required, both weights 1, `now = 2026-10-13T12:00Z` unless
stated.

| #   | Given                                                                    | Then                                                                            |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| L1  | 5 sessions in the window (amber)                                         | `null`                                                                          |
| L2  | exactly 6, oldest `2026-05-01T10:00Z`                                    | `2026-11-01T10:00:00.001Z`                                                      |
| L3  | 9 sessions; the 6th newest at `2026-07-02T08:00Z`                        | `2027-01-02T08:00:00.001Z`; the three older ones do not move it                 |
| L4  | weights training 1 / competition 2, required 2, one competition          | lapses when that competition leaves, not before                                 |
| L5  | 1 month, required 1, one session `2026-03-01T12:00Z`, `now` `2026-03-15` | `2026-03-29T12:00:00.001Z` — the clamping, as `computeRuleLicenseActivity` does |
| L6  | `requiredActivities: 0`                                                  | `null`                                                                          |
| L7  | weapon-group rule; sessions in another group                             | they do not keep it met                                                         |
| L8  | met now, and a future-dated session                                      | the future session counts from its instant on, exactly as the function does     |
| C1  | criterion not met                                                        | `null`                                                                          |
| C2  | additional handgun (6 mo, 2): two sessions with the firearm              | the older one's exit                                                            |
| C3  | renewal (12 mo × 2, 4 each): 4 sessions per year                         | the first instant either year drops below 4                                     |
| C4  | sessions with another firearm                                            | do not keep it met                                                              |
| O1  | overall not green                                                        | `null`                                                                          |
| O2  | two applicable rules, both green                                         | the earlier of their lapses                                                     |

Properties (fast-check, random sessions across ±3 years, random `now`, random
1–24-month windows):

- **P1** If the lapse is `L`: met at `L − 1 ms`, not met at `L`, and met at
  every one of 200 random instants in `(now, L)`.
- **P2** If met at `now` with `required > 0`, the lapse is not `null`.
- **P3** If not met at `now`, the lapse is `null`.
- **P4** The same three for a per-firearm criterion with 1–3 windows.

## Must not

- **N1** Change any existing compliance result: every existing test passes
  unchanged.
- **N2** Introduce a regulatory value: the code reads only the rule passed in.
- **N3** Show a date for a requirement that is not met (amber/red, or a
  criterion not met).
- **N4** Show a date when the compliance profile is None.
