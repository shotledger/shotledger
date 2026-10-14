# License check: met or not, and what is still needed — executable spec

Scope: `shared/src/compliance/**` (old-coder mandatory per CLAUDE.md) and a new
phone screen. Issue [#804](https://github.com/jimisola/shotledger/issues/804).
Builds on [`compliance-next-session-spec.md`](compliance-next-session-spec.md)
(#795), whose lapse it reuses, and on the specs that one builds on. The source,
the numbers and the windows are unchanged.

**Amended by [`compliance-local-days-spec.md`](compliance-local-days-spec.md)
(#816):** windows count whole local days, so the lapse and the first day a
criterion can be met are local midnights, and a period's end is its last day.
The scan below is replaced by a day-by-day one.

**Spec approval: approved** by the maintainer on 2026-10-13.

**Tier 2.** No new regulatory value: every number is read from the rules the
profile already declares (PM 551.24 p. 3).

**Setup plan:** no new dependency, no schema change. Files by path:

- `shared/src/compliance/types.ts` — `FirearmComplianceRule.purpose`
- `shared/src/compliance/profiles/se.ts` (+ test) — the two criteria's purposes
- `shared/src/compliance/lapse.ts` — the scan generalized to "first instant
  where", reused by the shortfall
- `shared/src/compliance/shortfall.ts` (new) + test
- `app/src/features/compliance/license-check.ts` and `use-license-check.ts` (new)
- `app/src/app/compliance.tsx` (new screen), `app/src/app/_layout.tsx`,
  `app/src/app/(tabs)/index.tsx` (the Home status opens it)
- `app/src/i18n/{en,sv}.json`, `docs/manual/guides/license-activity{,.sv}.md`,
  `docs/manual/explanation/license-activity{,.sv}.md`
- `docs/reqstool/*`, `docs/implementation-plan.md`

## What the shooter sees

One **License Check** screen, opened by tapping the status on Home, groups the
requirements by what the föreningsintyg is for:

**New Purchase**

- The 5 § / 6 § rule for the shooter's case.
- "Ytterligare enhandsvapen" for each handgun they hold (the existing proxy: a
  pistol or revolver marked My Own). None held: one line saying the box does
  not apply.

**Renewal**

- "Förnyelse av tidsbegränsat tillstånd" for each firearm whose license has an
  end date (the existing proxy). None: one line saying no firearm has a
  time-limited permit on file.

Each requirement shows met or not met and then exactly one of:

| State                             | Line                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Met                               | "Next session by _D_ …" (the #795 date)                                                                                           |
| Not met, fixable by shooting now  | "N more sessions needed" (with this firearm, for a per-firearm criterion)                                                         |
| Not met, an earlier year is short | "The year _A_ to _B_ has _x_ of _4_. Sessions logged now cannot count towards it. If you keep logging, this can be met from _D_." |

The firearm detail keeps what it shows today plus the #795 date; the new screen
is the one place that answers "where do I stand" for both purposes.

## Shared behaviour

`FirearmComplianceRule.purpose: 'purchase' | 'renewal'` is profile data: in `se`
the additional-handgun criterion is `purchase` and the renewal criterion is
`renewal`. 5 § / 6 § rules are always `purchase` (they are the activity
requirement for acquiring a handgun).

### Rule shortfall

`ruleShortfall(activity)` = `max(0, required − activityCount)`, in activities.
Logging that many counted sessions now makes the rule green now (sessions logged
now are inside the window ending now).

### Criterion shortfall

`computeFirearmCriterionShortfall(sessions, rule, firearm, now)` returns:

- `recentNeeded`: `max(0, required − count)` of the most recent window.
- `olderPeriods`: each earlier window whose count is below `required`, with its
  start, end, count and `needed`.
- `metFromIso`: `null` when the criterion is met now; `now` when only the
  recent window is short; otherwise the **first instant `t > now` at which it
  can be met if the shooter logs enough sessions with this firearm from now
  on**.

"Can be met at `t`" means: for every window `n` at `t`, either the sessions
already logged give it `required`, or the window ends after `now` — so a
session logged from now on can still land in it. The most recent window ends
at `t` and always qualifies. This is decided by the same window arithmetic
`computeFirearmCriterion` uses, scanned at the same candidate instants as the
lapse (with `now` added as a candidate instant, since a window's end passing
`now` is what lets new sessions count).

## Scenarios

`now = 2026-10-13T12:00Z`; renewal = 12 months × 2, 4 each; additional = 6
months, 2.

| #   | Given                                                                     | Then                                                                                                                                  |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | rule 6 required, 4 counted                                                | shortfall 2                                                                                                                           |
| S2  | rule met                                                                  | shortfall 0                                                                                                                           |
| S3  | additional: 1 session with the firearm                                    | `recentNeeded` 1, no older periods, `metFromIso` = now                                                                                |
| S4  | renewal met                                                               | 0, none, `null`                                                                                                                       |
| S5  | renewal: recent year 2, older 4                                           | `recentNeeded` 2, none, now                                                                                                           |
| S6  | renewal: recent year 6, older year 1 (all older sessions in Jan–Mar 2025) | `recentNeeded` 0, older period short by 3, `metFromIso` = the first instant three recent-year sessions have moved into the older year |
| S7  | renewal: no sessions at all                                               | `recentNeeded` 4, older short by 4, `metFromIso` = the first instant the older year's end passes `now` (12 months on)                 |
| S8  | sessions with another firearm                                             | do not count                                                                                                                          |
| G1  | `se` purposes                                                             | additional handgun → purchase, renewal → renewal                                                                                      |

Properties (fast-check, random sessions, `now`, 1–24 months, 1–3 windows):

- **Q1** If `metFromIso` is `t`, adding `required` sessions with the firearm at
  `max(now, window start)` for every short window at `t` makes
  `computeFirearmCriterion(…, t).met` true.
- **Q2** If `metFromIso` is `t > now`, at `t − 1 ms` some window is short and
  ends at or before `now`, so no session logged from now on can fill it.
- **Q3** `metFromIso` is `null` exactly when the criterion is met now, and
  `now` exactly when no older window is short.

## Must not

- **N1** Change any existing result; existing tests pass unchanged.
- **N2** Introduce a regulatory value.
- **N3** Claim a session logged now can fill a window that has already ended.
- **N4** Show anything when the profile is None (the screen says the license
  check is off and links to Settings → Compliance).
