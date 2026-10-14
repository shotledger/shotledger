# License check — evidence report

Spec: [`compliance-license-check-spec.md`](compliance-license-check-spec.md).
Issue [#804](https://github.com/jimisola/shotledger/issues/804).

**Spec approval: approved** by the maintainer on 2026-10-13.

## Scenario → test

| Spec      | Test                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1–S2     | `shared/src/compliance/shortfall.test.ts` `S1`, `S2`                                                                                                           |
| S3–S8     | same file, `S3` … `S8`, plus `S7: a window ending exactly at now cannot take a session logged now`                                                             |
| G1        | `G1: the Swedish criteria are grouped by what the intyg is for` (passed on first run: the purpose data was written before the test; kept as regression armour) |
| Q1–Q3     | `Q1-Q3: the shortfall agrees with computeFirearmCriterion` (fast-check, 300 runs)                                                                              |
| N1        | the existing compliance suite, unchanged and green (two test fixtures gained the new required `purpose` field)                                                 |
| N2        | `shortfall.ts` and `scan.ts` import no constant                                                                                                                |
| N3        | Q1 asserts every window filled by new sessions ends after now; S7 at midnight                                                                                  |
| N4        | the screen renders `check-off` and a link to Compliance when the profile is None                                                                               |
| —         | `app/src/features/compliance/license-check.test.ts`: grouping by purpose, rule shortfall and lapse, criterion shortfall and lapse                              |
| COMPL_004 | top-level `says what a renewal that is not met still needs, and from when it can be met` (`@SVCs SVC_COMPL_004`)                                               |

## Gauntlet

| Layer      | Result                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED        | 10 of 11 new shared tests failed against a throwing stub; G1 passed (see above)                                                                         |
| Tests      | 192 compliance tests green; app jest suites for compliance green                                                                                        |
| Coverage   | 100% on `shared/src/compliance/**`                                                                                                                      |
| Mutation   | Stryker on `shared/src/compliance/**`: 96.68%; `scan.ts` 94.59% (34 killed, 1 timeout, 2 survived), `shortfall.ts` 97.30% (1 survived), `lapse.ts` 100% |
| Types/lint | `tsc -b`, `typecheck:app`, eslint, prettier, i18n check clean                                                                                           |
| Docs       | `mkdocs build --strict`, anchor check clean                                                                                                             |

### Surviving mutants, all equivalent

- `scan.ts` `dayMs < horizonMs` → `<=`: one more day past the horizon, where
  nothing can change.
- `scan.ts` `ms > nowMs` → `>=`: also evaluates `now`; both callers decide
  `now` before scanning (the lapse returns `null` unless met at `now`; the
  shortfall returns before scanning unless it cannot be met at `now`).
- `shortfall.ts` dropping `.slice(1)`: also checks the most recent window,
  which ends at `t > now` and so always qualifies.

## Real execution

Web preview with `/dev` demo data, profile Sweden, one extra pistol added:
Home's status opens License Check. New Purchase shows the 6 § rule (On Track,
next session by Mar 31, 2027), the additional-handgun box per held handgun
(met ones with their date; the new pistol "2 more sessions with this firearm
needed"). Renewal shows each firearm with an end-dated license: the recent year
met, the older year 0 of 4 with "Sessions logged now cannot count towards this
period" and the date it can be met from. Same `Atomics.pause` harness
workaround as #795's evidence. Not yet checked on a phone.
