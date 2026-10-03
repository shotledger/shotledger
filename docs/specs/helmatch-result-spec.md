# SPEC — Nationell helmatch result: delmoment subtotals, C-then-B tie-break, official standardmedalj

> Old-coder SPEC artifact for `feat/helmatch-result` (issue #476, slice 4).
> Evidence report: `docs/specs/helmatch-result-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** The maintainer was not
> available synchronously; spec and implementation are written in the same
> session. This file is the artifact to review after the fact, and the
> evidence report claims confidence accordingly.

- Tier: **2**. Pure functions in `shared/src/scoring/` and
  `shared/src/disciplines/`, plus app wiring. No schema change, no
  migration, no stored row is rewritten.
- Setup plan:
  - Tools to install: none (vitest, v8 coverage and Stryker are already
    the repo's gauntlet).
  - Git: branch `feat/helmatch-result` stacked on `feat/helmatch-disciplines`;
    Conventional Commits, `git commit -s`, explicit paths only.
  - Files added: `shared/src/scoring/stages.ts`,
    `shared/src/scoring/stages.test.ts`, this spec, the evidence report.
  - Files modified: `shared/src/disciplines/{schema,index}.ts` (+ tests),
    `shared/src/disciplines/programs/spsf-helmatch.json`,
    `shared/src/scoring/{stats,analytics}.ts` (+ tests),
    `shared/src/integrations/webshooter/stats/pb.ts` (+ tests),
    `app/src/db/queries/{stats,webshooter-stats}.ts`,
    `app/src/features/session/use-session-detail.ts`,
    `app/src/app/session/[id]/{index,edit}.tsx`, i18n, manual, reqstool.
  - New dependencies: none.

## Domain facts (SHB 2026, upplaga 21)

| Fact                                                                | Citation             |
| ------------------------------------------------------------------- | -------------------- |
| Three delmoment A, B, C; max 200 each, 600 in all                   | I.6.1 p. 258         |
| Tie: higher C first, then higher B; then särskjutning or lottning   | I.6.11.2.1 p. 265    |
| Särskjutning is in C, 5-shot series                                 | I.6.11.2.3 p. 265    |
| Standardmedalj pooled per vapengrupp A/B/C, regardless of klass     | C.5.1.1.7 p. 70      |
| Silver best 1/9, brons best 1/3, rounded down; no fixed-points path | C.5.1.2, C.5.1.2.3–6 |

## Model

- A program group may carry a `stage` id (`"A"`, `"B"`, `"C"`). Helmatch's
  groups are `A`, `B`, `C`, `C`, `C`, `C`. A series' stage is its skeleton
  entry's stage, by position (the same rule as its face and time limit); a
  series past the skeleton, or in a program without stages, has none.
- A **stage subtotal** is the sum of the stage's non-sighter series totals.
  Sighters never count in a delmoment result, whatever the report's
  Sighters filter says — the subtotal is SHB's delmoment result.
- **Tie-break keys** for a discipline: helmatch → `[C, B]` subtotals; every
  other discipline → `[]`.
- **Ranking**: `a` ranks ahead of `b` when its total is higher, or the totals
  are equal and the first differing tie-break key (compared over the keys
  both have) is higher. Equal on everything → neither ranks ahead, and the
  caller's existing "first seen keeps it" rule stands.

## Scenarios

```gherkin
Feature: Delmoment subtotals
  Scenario: S1 subtotals per stage, sighters excluded
    Given stages [A, B, C]
    And series (A sighter 45), (A 48), (A 47), (B sighter 40), (B 44), (C 46), (C 42)
    When  stageSubtotals is computed
    Then  it is [A 95, B 44, C 88] in tenths x10, in the stages' order

  Scenario: S2 a stage with no scored series is 0, not absent
    Given stages [A, B, C] and only A series
    Then  B and C are 0

  Scenario: S3 a series without a stage, or with a stage not listed, is ignored
    Given a series with stage null and one with stage "D"
    Then  no subtotal moves

  Scenario: S4 helmatch skeleton carries stages A, B, C
    Given program spsf-helmatch
    Then  positions 1–5 are A, 6–10 are B, 11–14 are C
    And   programStages is [A, B, C]
    And   seriesStage(spsf-helmatch, 15) and seriesStage(null, 1) are null

Feature: C-then-B tie-break (I.6.11.2.1)
  Scenario: T1 helmatch keys are C then B
    Given a helmatch session with B 180 and C 190
    Then  tieBreakTenths is [1900, 1800]

  Scenario: T2 other disciplines have no keys
    Then  tieBreakTenths('spsf-precision', …) is []

  Scenario: T3 higher total ranks ahead regardless of keys
  Scenario: T4 equal totals: higher C ranks ahead even with lower B
  Scenario: T5 equal totals and C: higher B ranks ahead
  Scenario: T6 equal total, C and B: neither ranks ahead (A never breaks a tie)
  Scenario: T7 keys of unequal length compare over the shared prefix only

Feature: Every place sessions are ranked uses it
  Scenario: R1 report "best session" — two helmatch sessions on 560, the later one with higher C wins
  Scenario: R2 Records "best session" (freeform PB) — same input, same winner
  Scenario: R3 a precision tie still keeps the first seen (no regression)

Feature: Official standardmedalj is recordable
  Scenario: M1 placementOnlyStandardMedal('spsf-helmatch') is true; precision, milsnabb, magnumprecision, figurskjutning false
  Scenario: M2 standardMedalPoints for helmatch returns no thresholds (no computed medal)
  Scenario: M3 (app) a helmatch competition's Edit Session offers Official Standard Medal (None/Bronze/Silver), saved to official_standardmedalj and shown on the session
```

## Must NOT

- N1: change any existing program's skeleton beyond adding `stage: null`
  (positions, sighters, times, faces stay as slices 2–3 left them).
- N2: change a session total, a series total, or any non-helmatch ranking.
- N3: compute a helmatch standardmedalj from points (there are no thresholds).
- N4: count a sighter in a delmoment subtotal.
- N5: add a dependency or a Drizzle migration.

## Revisions

- (none yet)
