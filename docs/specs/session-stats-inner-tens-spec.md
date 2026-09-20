# Session Stats — inner tens per series — executable specification

> Old-coder SPEC artifact for `feat/session-stats-inner-tens` (third maintainer
> review, 2026-09-09, Session detail > Stats).
> Absolute path:
> `/home/jimisola/cloud/dev/clones/jimisola/github/shotledger/docs/specs/session-stats-inner-tens-spec.md`
> Evidence report: `docs/specs/session-stats-inner-tens-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** This document is written
> and implemented in the same session, so the correlation-breaking review the
> old-coder loop depends on did not happen. The spec is the artifact the
> maintainer reviews after the fact.

Tier: **2**. One new pure aggregate over data the app already computes; a wrong
value misleads a shooter's reading of a session but cannot corrupt stored data,
scoring, or compliance. `shared/src/scoring/` is nonetheless under CLAUDE.md's
mandatory old-coder rule, so the full loop runs.

Scope of the loop: `shared/src/scoring/totals.ts` only. The three UI changes
(`app/src/app/session/[id]/index.tsx`, the two hooks, i18n) are routine UI work
per CLAUDE.md and get the app's normal checks, not this loop — except
`scripts/i18n-check.mjs`, which is a **checker** and therefore gets the
negative-control treatment (§6).

## 0. Setup plan (what approving this authorizes)

- **Isolation:** branch `feat/session-stats-inner-tens` off `main`, inside this
  agent's pre-existing worktree (its own `pnpm i`'d `node_modules`, installed
  at the start of the run).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths staged,
  no push, no PR, `main` never touched.
- **New dependencies: none.** Reuses vitest, `@vitest/coverage-v8` and Stryker,
  already wired.
- **Files added:** this spec and its evidence report.
- **Files modified:** `shared/src/scoring/totals.ts`,
  `shared/src/scoring/totals.test.ts`, `app/src/features/session/
use-session-detail.ts`, `app/src/features/session/use-session-stats.ts`,
  `app/src/app/session/[id]/index.tsx`, `app/src/i18n/{en,sv}.json`,
  `scripts/i18n-check.mjs`.
- **No schema change, no migration, no new native module.**

## 1. The request (maintainer, verbatim)

1. _"Whole session: 251 points is shown above Series/Stats tab redundant"_
2. _"Under Per series, would be useful with average no of inner tens per series
   (might also fit highest on the view with Total, Avg Points/Series, X (Inner
   Tens) - and then Avg Inner Tens/Series)"_
3. _"perhaps total shot can be in the header of 'Shot Distribution (x shots)'"_

## 2. Domain constraints (spsf-domain)

- **Sighter (provskott/provserie) series are excluded from every score
  statistic** (rule 2). An inner-ten count is a score statistic, so a sighter's
  `(X)`s must not reach either the numerator or the denominator.
- **Final series are included** — a finished championship averages over its
  grundomgång and its final together, exactly as `seriesAverageTenths` does
  (spec A-S4).
- **`isInnerTen` means the shooter pressed `(X)`** (Amendment A1 §A1.1); a plain
  `X` is an ordinary ten and is never counted. This spec adds no new judgement
  about what an inner ten is — it only counts the existing flag.

## 3. The new aggregate

`seriesInnerTenAverage(seriesList: readonly FlaggedSeriesForResults[]): number | null`
in `shared/src/scoring/totals.ts`, beside the other Amendment A1 §A1.2
session-header figures (`seriesAverageTenths`, `sessionInnerTenCount`).

- **Numerator:** the inner-ten count of the qualifying series (`countInnerTens`).
- **Denominator:** the number of qualifying series.
- **Qualifying series** is exactly the set `seriesAverageTenths` averages over —
  non-sighter, and carrying data (a stored `totalOverride`, or at least one
  shot). The two figures must never be computed over different sets; the shared
  predicate is extracted so that stays true by construction.
- **Unit:** a plain count (not tenths). `null` when nothing qualifies —
  undefined, never `0`.

`FlaggedSeriesForResults` gains an optional `totalOverride?: SeriesTotalOverride
| null` field so the predicate can see it. Optional, so every existing caller
still type-checks unchanged.

### Behaviors

| id    | Given                                                                                              | Then                                                                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IT-1  | an empty series list                                                                               | `null`                                                                                                                                                                                                  |
| IT-2  | three scored series with 2, 1 and 0 inner tens                                                     | `1`                                                                                                                                                                                                     |
| IT-3  | a scored series with 1 inner ten and a **sighter** series with 3                                   | `1` — the sighter contributes to neither numerator nor denominator                                                                                                                                      |
| IT-4  | a scored main series with 0 and a **final** series with 2                                          | `1` — finals are included                                                                                                                                                                               |
| IT-5  | a scored series with 1 inner ten and a scored series with **no shots yet**                         | `1` — an empty series is not a zero in the denominator (mirrors A-S5)                                                                                                                                   |
| IT-6  | only sighter series, or only empty scored series                                                   | `null` (mirrors A-S6)                                                                                                                                                                                   |
| IT-7  | scored series where **no** shot is flagged                                                         | `0` — a real zero, distinct from IT-6's `null`                                                                                                                                                          |
| IT-8  | a series whose shots carry **decimal** `valueTenths` (e.g. 109, 104) with the flag set             | counts identically — the flag, never the value, decides                                                                                                                                                 |
| IT-9  | a WS1 **override** series (no shot rows, stored total) alongside a scored series with 2 inner tens | `1` — the override series counts in the denominator with 0 inner tens, exactly as it contributes 0 to `sessionInnerTenCount` and to the card's X tile today, so `X ÷ series = avg` stays true on screen |
| IT-10 | the result of a non-integer division (1 inner ten over 3 series)                                   | the exact quotient `1/3`, unrounded — rounding is the UI's job                                                                                                                                          |

### Invariants that must survive (negative constraints)

| id    | Invariant                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-1 | `seriesAverageTenths` behavior is unchanged by the extracted predicate — its existing tests A-S1..A-S6 and both WS1 cases still pass, untouched |
| INV-2 | No existing exported signature changes. `FlaggedSeriesForResults` only gains an **optional** field                                              |
| INV-3 | `pnpm coverage` stays at 100% statements/branches/functions/lines for `shared/src/{scoring,disciplines}`                                        |
| INV-4 | No new dependency; no schema change                                                                                                             |

## 4. UI changes (normal-tests scope, listed so the spec is the whole contract)

| id   | Change                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-1 | The Stats tab's "Whole Session" block loses its **Total Points** tile (`session-stat-total-points`). It duplicated the result card's `session-total` — the same number by two code paths. Total Shots stays; the card above the tabs stays.                    |
| UI-2 | The **Per Series** block gains a 4th tile, `session-stat-series-inner-tens`, showing `seriesInnerTenAverage` to one decimal, `–` when `null`.                                                                                                                  |
| UI-3 | The result card above the tab selector gains a 4th tile, `session-inner-ten-average`, so the row reads Total · Avg/Series · X (Inner Tens) · Avg X/Series. Backlog §1 asks this card to get _smaller_, so it must not grow taller: four tiles on one line.     |
| UI-4 | The "Shot Distribution" header on the session Stats tab becomes `Shot Distribution (30 shots)` / `Fördelning (30 skott)` via i18next pluralization — interpolated, never concatenated. The Statistics-report screen keeps the plain `stats.distributionTitle`. |

**Revision (during implementation, recorded rather than silently drifted):** the
first draft of this paragraph put the screen+card chrome at ~48 dp. Measured, it
is 64 dp — `Screen` `paddingHorizontal: Spacing.three` (16 each side) plus
`Card` `padding: Spacing.three` (16 each side) — and the tile geometry was
adjusted to the real number below.

Layout budget for UI-3 (why four fit): `metricRow` is `flexWrap: 'wrap'`, tiles
are `flexGrow: 1` over a `flexBasis` that only sets the wrap threshold. Usable
row width is device width − 64 dp: 256 dp at 320 dp, 296 dp at 360 dp. At the
existing `gap: Spacing.three` (16) / `flexBasis: 64`, four tiles need
4 × 64 + 3 × 16 = 304 dp and wrap 3 + 1 on **every** phone — taller, the
opposite of what backlog §1 asks. `gap: Spacing.two` (8) with
`flexBasis: 56` needs 4 × 56 + 3 × 8 = 248 dp, so the row stays single-line down
to 320 dp; `flexGrow` then spreads the tiles to 58 dp (320 dp screen) or 68 dp
(360 dp). `MetricTile` labels also adopt the `adjustsFontSizeToFit` +
`minimumFontScale={0.8}` treatment `StatTile` got in #76, so the longest label
("X (Inner Tens)") shrinks rather than clipping to "X (Inne…". The card with a
final wraps to two rows, as it does today with five tiles.

`session.innerTenCount` is deliberately **not** shortened even though it is the
longest label in the row: `app/src/components/score-keypad.tsx` reuses that
same key as the `(X)` key's label, where "X (Inner Tens)" is the wording the
maintainer asked for.

New i18n keys (en Title Case for labels; sv sentence case throughout):

| key                                      | en                                    | sv                             |
| ---------------------------------------- | ------------------------------------- | ------------------------------ |
| `session.innerTenAverage`                | `Avg X/Series`                        | `Snitt X/serie`                |
| `stats.statsSeriesInnerTens`             | `Avg X`                               | `Snitt X`                      |
| `stats.distributionTitleWithCount_one`   | `Shot Distribution ({{count}} shot)`  | `Fördelning ({{count}} skott)` |
| `stats.distributionTitleWithCount_other` | `Shot Distribution ({{count}} shots)` | `Fördelning ({{count}} skott)` |

The parenthetical count is a data annotation, not part of the header's name, so
it stays lower case — matching the existing `csvImport.tagLabel`
(`"{{tag}} ({{count}} rows)"`). The header itself keeps Title Case.

## 5. `scripts/i18n-check.mjs` — plural-suffix awareness

The gate requires every leaf key to appear literally in `app/src`. i18next
plural keys never do: source says `t('stats.distributionTitleWithCount', {count})`
and the JSON holds `…_one` / `…_other`. The gate gains one rule: a key ending in
a CLDR plural-category suffix (`_zero|_one|_two|_few|_many|_other`) counts as
referenced when its **base** key is referenced. Both languages must still carry
identical key sets, so a missing `_one` in `sv.json` still fails.

This widens what the gate accepts, so §6 proves it did not stop failing.

## 6. Gauntlet plan

| layer                    | command                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full suite               | `pnpm check` from the repo root (typecheck ×2, i18n gate, lint, format, vitest, jest)                                                                                                                                                          |
| coverage                 | `pnpm coverage` — 100% threshold on `shared/src/{scoring,disciplines}`, exits nonzero when missed                                                                                                                                              |
| mutation                 | `pnpm mutation` (Stryker) restricted to the changed file, plus the full-suite score for context                                                                                                                                                |
| checker negative control | three deliberately-broken inputs run through `pnpm i18n:check`, each expected to fail: (a) an sv key deleted, (b) an en-only unused non-plural key added, (c) an en-only unused **plural** key added whose base key is not referenced anywhere |
| real execution           | not run on a device — the maintainer does the on-device pass (task instruction). Recorded as a skipped layer with that reason.                                                                                                                 |

Property-based tests: `totals.test.ts` already uses `fast-check`; the new
aggregate gets one property — for any list of scored series, the result equals
`sessionInnerTenCount ÷ (number of qualifying series)` whenever that denominator
is non-zero, tying the new figure to the one already on screen.
