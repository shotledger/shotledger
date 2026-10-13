# Next-session date — evidence report

Spec: [`compliance-next-session-spec.md`](compliance-next-session-spec.md).
Issue [#795](https://github.com/jimisola/shotledger/issues/795).

**Spec approval: pending** at the time of writing. The PR does not merge until
the maintainer approves the spec.

## Scenario → test

All in `shared/src/compliance/lapse.test.ts` unless noted.

| Spec      | Test                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| L1        | `L1: a requirement not met now has no lapse`                                                                             |
| L2        | `L2: exactly the required count lapses one millisecond after the oldest leaves`                                          |
| L3        | `L3: the sixth-newest session decides; older ones do not move it`                                                        |
| L4        | `L4: a weighted competition keeps it met until the competition itself leaves`                                            |
| L5        | three `L5:` tests: month-end clamping inside a day, the 1 May → 31 Oct case, and a forward jump at midnight              |
| L6        | `L6: a rule requiring nothing never lapses`                                                                              |
| L7        | `L7: sessions the rule does not count do not keep it met`                                                                |
| L8        | `L8: a future-dated session counts from its own instant on`                                                              |
| C1–C4     | `C1` … `C4` (C3 twice: the older year decides; a session moves between years)                                            |
| O1–O2     | `O1`, both `O2` tests, plus a never-lapsing rule next to one that lapses                                                 |
| P1–P3     | `P1-P3: a rule is met until its lapse and not at it` (fast-check, 300 runs)                                              |
| P4        | `P4: a per-firearm criterion is met until its lapse and not at it` (fast-check, 300 runs)                                |
| N1        | the existing compliance suite, unchanged and green                                                                       |
| N2        | `lapse.ts` imports no constant; it reads only the rule passed in (by inspection)                                         |
| N3        | L1, C1, O1 (no date when not met); the screens render nothing for `null`                                                 |
| N4        | the hooks return no lapse when the profile is `null`, and the screens are gated on it                                    |
| —         | `app/src/features/compliance/next-session.test.ts`: the day shown is the last met instant                                |
| COMPL_003 | top-level `gives the first instant a met requirement is no longer met, and nothing when not met` (`@SVCs SVC_COMPL_003`) |

## Gauntlet

| Layer      | Result                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RED        | 26/26 new tests failed against a throwing stub before the implementation                                                                                                                                           |
| Tests      | 177 compliance tests green; full vitest suite green except three `sv-FI` cases in `web/src/fields/date-time-text.test.ts`, which fail identically on `main` in this container (Node 22 ICU; the repo pins Node 26) |
| Jest (app) | 71 suites, 789 tests green                                                                                                                                                                                         |
| Coverage   | 100% lines/branches/functions/statements on `shared/src/compliance/**`, `lapse.ts` included                                                                                                                        |
| Mutation   | Stryker on `shared/src/compliance/**`: 96.60% overall; `lapse.ts` 97.65% (82 killed, 1 timeout, 2 survived)                                                                                                        |
| Types/lint | `tsc -b`, app and web typecheck, eslint, prettier clean                                                                                                                                                            |
| Docs       | `mkdocs build --strict`, anchor check clean                                                                                                                                                                        |

### The two surviving mutants, both equivalent

- `dayMs < horizonMs` → `<=`: one more day scanned past the horizon, where
  nothing counts and the lapse has already been returned.
- `ms > nowMs` → `>=`: also evaluates `now`, which is known to be met by the
  check at the top of the function.

## Real execution

Pending: the web preview could not load demo data in this container (a sync timeout on the browser database), so the screens are to be checked on the device.

## Honest limits

- Exactness rests on the candidate-instant argument in the spec, checked by
  the properties against the status functions on random data, not by proof.
- The date assumes every session the shooter will log counts with the same
  weight as the one it replaces. True for the Swedish profile (every session
  counts 1).
