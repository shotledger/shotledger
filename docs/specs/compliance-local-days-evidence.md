# License-activity windows in whole local days — evidence report

Spec: [`compliance-local-days-spec.md`](compliance-local-days-spec.md). Issue
[#816](https://github.com/jimisola/shotledger/issues/816).

**Spec approval: approved** by the maintainer on 2026-10-14 ("Ok", in reply to
the request to approve this spec). The two defaults it carries (inclusive start
day, device time zone) were proposed on #816 after checking PM 551.24, SHB 2026
and Lag (1930:173); the maintainer had said he did not know and asked for that
check.

**Tier 2.** Branch `fix/816-local-day-windows`, no worktree (the repo's normal
branch-per-change flow). No new dependency, no schema change.

## Scenario → test

New tests are in `shared/src/compliance/local-days.test.ts` unless noted.

| Spec      | Test                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| Rule 3    | `local-day arithmetic` (5 tests: keep the day, clamp 31 Mar/31 Aug/leap, midnight output, DST)                     |
| D1        | `D1: the start day is inclusive`                                                                                   |
| D2        | `D2: one day later the oldest has left`                                                                            |
| D3        | `D3: on 31 March the window starts 30 September, not 1 October`                                                    |
| D4        | `D4: a session on 29 September is outside it`                                                                      |
| D5        | `D5: a session at 00:30 local belongs to its local day, not the UTC one`                                           |
| D6        | `D6: two sessions on the same day leave on the same day`                                                           |
| D7        | both `D7:` tests (first and last instant of a day; a session later today)                                          |
| D8        | `D8: a DST change inside the window changes nothing`                                                               |
| D9, D10   | `D9:`, `D10:`                                                                                                      |
| Rule 6    | `a session dated after today does not count yet`                                                                   |
| W1–W3     | `W1:`, `W2:`, `W3:`, plus first-day/day-before of the oldest window, month-end clamping on every boundary          |
| L1–L3     | `L1:`, both `L2:`, `L3:`, plus a renewal lapse at a local midnight                                                 |
| S1        | both `S1:` tests                                                                                                   |
| P1–P5     | `P1:` … `P5:` (fast-check; 300, 300, 300, 200 + 200, 500 runs)                                                     |
| COMPL_005 | top-level `counts a window in whole local days, first day included and month ends clamped` (`@SVCs SVC_COMPL_005`) |
| N1        | no profile file touched (`git diff` shows none under `profiles/` or `constants-se.ts`)                             |
| N2        | rewritten tests listed below; every other compliance test unchanged and green                                      |
| N3        | no dependency added; local days from `Date`'s own local getters                                                    |
| N4        | no screen file changed; the ISO fields keep their names and types                                                  |

## RED

37 new tests against stubs that threw: 32 failed. Five passed at once, all
boundary cases where the old instant rule and the new day rule agree (a
future-dated session, W2, a session outside the span, L3, and the second S1);
they are kept as regression armor, and the mutation run below kills mutants in
the code they cover.

Three new tests failed after GREEN because of mistakes in the test data, found
by working the dates by hand, not by changing the code: D8 used a six-month
window for a span that needs twelve; the renewal lapse and S1 expected dates
that ignored the recent year's sessions moving into the older one. Corrected to
the dates the spec's rule gives (2028-01-02 and 2028-01-05).

## Tests rewritten to the new rule (N2)

Each encoded the old instant/UTC/rollover behaviour; each now asserts the same
property at day level. None was deleted or weakened.

- `license-activity.test.ts`: B6, B7 and the top-level "counts only sessions
  inside the window" test now put their boundary sessions at local day edges.
- `firearm-criteria.test.ts`: F4b, F6 (local day edges); F12 now asserts the
  older window's last day is the day before the newer one's first, and adds a
  session on that day before.
- `lapse.test.ts`: every expected lapse is now a local midnight (`lm(…)`). L5's
  three cases now assert the 1930:173 clamp (a session on 1 March stays in
  through 1 April with a one-month window) instead of the old rollover. The
  top-level SVC test title says "first day" instead of "first instant".
- `shortfall.test.ts`: S6, S7 and the SVC test give local midnights; period
  `endIso` is the last day; Q1/Q2 now compare days with today. The old
  "window ending exactly at now" S7 case became "the time of day does not move
  it".
- `app/src/features/compliance/license-check.test.ts`: two expected lapses.

## Gauntlet

Node 24.21.0 (the repo's pin), `TZ=Europe/Stockholm` in both test runners.

| Layer       | Command                                                                | Result                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full suite  | `pnpm check`                                                           | exit 0; vitest 222 files / 3809 tests passed; jest 73 suites / 800 tests passed                                                                                    |
| Types, lint | `pnpm check` (tsc -b, app, web)                                        | clean; eslint and prettier clean                                                                                                                                   |
| Coverage    | `pnpm coverage` (in check)                                             | 100% threshold on the mutate list met (exit 0)                                                                                                                     |
| Mutation    | `pnpm exec stryker run` on `shared/src/compliance/**`                  | 96.72% overall (break 95%); `firearm-criteria.ts` 100%, `lapse.ts` 100%, `license-activity.ts` 98.55%, `months.ts` 92.31%, `scan.ts` 90.91%, `shortfall.ts` 96.97% |
| Docs        | `mkdocs build --strict`, `docs-anchor-check`, `docs-translation-check` | clean                                                                                                                                                              |
| reqstool    | `pnpm reqstool:tags`                                                   | ran; `reqstool:status` needs the Python client, not installed here — left to CI                                                                                    |

### Surviving mutants

- `scan.ts` `day <= horizon` → `<`: equivalent. The horizon is 31 days a month
  plus a day past the newest session, so the lapse is always found before it.
- `shortfall.ts` dropping `.slice(1)`: equivalent. The most recent window's
  last day is the scanned day, which is always tomorrow or later, so it always
  passes the "last day is today or later" test.
- `months.ts:20` (`wholeMonthsBetween`, two mutants) and
  `license-activity.ts:129` (`worstStatus`): in code this change does not
  touch (unchanged lines from before #816).

## Real execution

Not run in the app for this change: the screens are unchanged and read the
same ISO fields. The dates they show move by at most a day at a window edge.
The jest test of the License Check builder covers the screen's data with the
new values.

## Honest limits

- "Local" is the runtime's time zone. A shooter abroad gets that country's
  days; the spec chose device time on purpose (#816).
- The Bilaga 8 "months of activity" figure still counts in UTC (out of scope).
- The day rule is the app's reading of a form that does not state one, aligned
  with Lag (1930:173) as the nearest convention; it is not a ruling by
  Polismyndigheten.
