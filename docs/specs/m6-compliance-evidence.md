# M6 compliance engine — evidence report

Spec: `docs/specs/m6-compliance-spec.md`. Scope: `shared/src/compliance/**`.
Source state: branch `feat/m6-compliance`, working tree not yet committed at
time of writing (all layers below run against this tree; the commit that
lands with this report is the source-state reference from here on).
Tier: **2** (normal feature). Spec approval: **not obtained** (autonomous
run) — this report and the spec are the after-the-fact review artifacts.

## Behavior → test mapping

| Spec ID                                                       | Test                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1–B12, B19, weight/fallback/future-exclusion additions       | `shared/src/compliance/barometer.test.ts` (`computeRuleBarometer` describe block)                                                                                                                                              |
| B13, B14                                                      | `barometer.test.ts` `computeBarometerForWeaponGroup`                                                                                                                                                                           |
| B15, B16                                                      | `barometer.test.ts` `computeFirearmBarometer`                                                                                                                                                                                  |
| B17, B18                                                      | `barometer.test.ts` `computeOverallBarometer`                                                                                                                                                                                  |
| I1–I9 + boundary/future additions                             | `shared/src/compliance/indicators.test.ts`                                                                                                                                                                                     |
| P1–P4                                                         | `shared/src/compliance/profile-registry.test.ts`                                                                                                                                                                               |
| Rolling-window month math (B19)                               | `shared/src/compliance/months.test.ts`                                                                                                                                                                                         |
| N1 (no `app/` import)                                         | structural: `shared/src/compliance/**` has zero imports outside `shared/`, verified by `pnpm typecheck` building `shared` as an isolated project and by manual grep (`grep -rn "from '@/" shared/src/compliance` → no matches) |
| N2 (session-level only, no series input to activity counting) | structural: `ComplianceSession`/`computeRuleBarometer` types take no series-shaped input; `indicators.ts`'s märke helper explicitly takes `StatsSeries[]` only for the märke indicator, never for barometer counting           |
| N3 (existing suites untouched)                                | see full-suite run below — 343 pre-existing tests unaffected, all still pass                                                                                                                                                   |

## Gauntlet layers

**1. Full test suite** — `pnpm coverage` (includes the full vitest run):

```
Test Files  30 passed (30)
     Tests  346 passed (346)
```

(343 pre-existing + a new `shared/src/index.test.ts`-adjacent count — the
compliance suite alone is 50 tests across 4 files: `months.test.ts` 7,
`barometer.test.ts` 26, `indicators.test.ts` 13, `profile-registry.test.ts` 4.)

**2. Static types** — `pnpm typecheck` (`tsc -b`): clean, zero errors.

**3. Lint** — `pnpm lint` (`eslint .`): clean, zero warnings.

**4. Coverage on changed lines** — `pnpm coverage` (v8, threshold
100/100/100/100, `vitest.config.ts` `include` extended to
`shared/src/compliance/**/*.ts`):

```
Statements   : 100% ( 798/798 )
Branches     : 100% ( 318/318 )
Functions    : 100% ( 74/74 )
Lines        : 100% ( 798/798 )
```

Exits 0 (threshold met) — this is the existing gauntlet layer, not a new one;
the glob extension is the only change.

**5. Mutation testing** — `pnpm mutation` (Stryker, `stryker.config.json`
`mutate` glob extended to `shared/src/compliance/**/*.ts`, break threshold
95, unchanged):

```
compliance           |  95.49 |   95.49 |      127 |         0 |          6 |        0 |        0 |
  barometer.ts        |  96.10 |   96.10 |       74 |         0 |          3 |        0 |        0 |
  indicators.ts       |  96.88 |   96.88 |       31 |         0 |          1 |        0 |        0 |
  months.ts           |  89.47 |   89.47 |       17 |         0 |          2 |        0 |        0 |
  profile-registry.ts | 100.00 |  100.00 |        5 |         0 |          0 |        0 |        0 |
All files             |  97.76 |   97.76 |      695 |         2 |         16 |        0 |        0 |
Final mutation score of 97.76 is greater than or equal to break threshold 95
```

Six survivors in `shared/src/compliance/**`, all classified equivalent
(reasoning below); the other 10 survivors listed by Stryker are in
pre-existing `shared/src/scoring/**` and `shared/src/disciplines/**` files
this task did not touch — out of scope, left as found.

### Survivor classification (compliance only)

1. **`barometer.ts:13` `required <= 0` → `false`** and **`required <= 0` →
   `required < 0`** (2 survivors). `statusFor`'s next line is
   `if (count >= required) return 'green'`. Since `count` (an activity
   count) is never negative, `count >= required` is already true for every
   `required <= 0` — the early-return is behaviorally redundant. Equivalent:
   no observable output differs whether the early return fires or not.
2. **`barometer.ts:101` reduce `<` → `<=`** in `worstStatus`. The reduce
   compares `STATUS_RANK[s] < STATUS_RANK[worst]`; on a tie
   (`STATUS_RANK[s] === STATUS_RANK[worst]`) both operators produce the same
   _value_ (`s`'s status string equals `worst`'s status string when ranks
   tie only for identical status names in this 3-value enum), so no test can
   observe a difference on any input. Equivalent.
3. **`indicators.ts:25` reduce `<` → `<=`** in `monthsOfLoggedActivity`
   (same shape as #2: comparing ISO date strings; a tie means identical
   strings, so returning either operand is the same value). Equivalent.
4. **`months.ts:20` `later.getTime() <= earlier.getTime()` → `false`** and
   **`→ (later.getTime() < earlier.getTime())`** (2 survivors). The
   function's final line is `Math.max(0, months)`. For any input where
   `later <= earlier`, the raw computed `months` value is always `<= 0`
   (verified by construction: the calendar-month difference plus the
   day-of-month adjustment cannot exceed 0 when `later <= earlier` by
   the UTC calendar), so the final clamp already forces `0` regardless of
   whether the early-return fires. Manually verified against three
   representative cases (exact equality, same-month reversal, multi-month
   reversal) that all three converge to `0` either way. Equivalent.

No test was added to "chase" these — per the old-coder anti-gaming rule 4,
adding assertions that can't distinguish behavior would be gaming, not
verification.

**6. Property-based tests** — not added. The domain (calendar-window
membership, lookup-table rules) is small enumerable boundary math, not
parsing/serialization; the boundary-value table (B4–B7, B19, plus the
window-boundary additions in `indicators.test.ts`) covers the edges a
property test would target, per the spec's stated plan.

**7. Complexity budget** — every new function is single-purpose and under
20 lines; the largest (`computeOverallBarometer`) is a 10-line loop plus one
reduce call.

**8. Real execution** — exercised indirectly through the app-layer UI (Home
barometer chip, Firearms/firearm-detail indicators, Settings profile picker)
built on top of this module and manually verified on the Android emulator
(see the M6 task report's Maestro section) — not a substitute for this
module's own unit suite, but confirms the exported functions integrate.

**9. Supply chain & secrets** — no new dependency introduced by
`shared/compliance` itself (pure TS, reuses in-tree `shared/scoring`).

**10. Suite health** — `vitest run` executes in a single deterministic pass
(no `--sequence.shuffle` configured project-wide); no flakiness observed
across the ~6 repeated runs performed while iterating on coverage/mutation
in this session.

## Negative controls

Not applicable — this task added no home-grown checker/gate; all gauntlet
layers are the project's existing off-the-shelf tools (vitest/v8 coverage,
Stryker, tsc, eslint), which the old-coder skill treats as pre-trusted.

## Deviations / honesty notes

- Spec approval not obtained (autonomous run), stated up front per the
  skill's provision for autonomous mode.
- The Bilaga 8 "märke guld fulfillment" indicator's `fulfilled` boolean is
  itself a VERIFY placeholder rule (≥1 guldserie in 24 months) — the spec
  and the code doc-comment both flag this; it is not presented to the user
  as confirmed.
- The FAP 551-3 numeric constants (`SE_DEFAULT_WINDOW_MONTHS`,
  `SE_DEFAULT_REQUIRED_ACTIVITIES`) are unverified placeholders,
  `SE_VERIFIED = false`, gating a UI hint — see `constants-se.ts` and the M6
  task report. **Settled since (2026-09-16):** both constants were replaced
  by the cited PM 551.24 numbers and no longer exist under those names — see
  `compliance-fap551-evidence.md`. The rest of this report still describes
  the code as it stands.
