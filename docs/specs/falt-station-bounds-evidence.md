# Evidence: bound a fält station's point fields (#837)

Spec: `docs/specs/falt-station-bounds-spec.md`. **Spec approved by the
maintainer, 2026-10-14**, after implementation: "1. ok", answering "Approve
the spec for #854". The approval is post hoc, so the code was written against
an unreviewed spec; the spec did not change on approval.

Tier 2 bug fix. Source state: the commit this file lands in, on
`bugfix/837-bound-falt-and-shotlog-counts` from `main` at `f4914ee`. Tools:
Node 24.21.0, pnpm 12.11.2, vitest 5.0.3, Stryker 10.0.0. Isolation: a git
worktree with its own `pnpm i --frozen-lockfile`.

## Behaviour to test

| Spec | Test (`shared/src/scoring/falt-station.test.ts`)                                    | RED before the fix               |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------- |
| B1   | `B1 stationPoints: a digit run over the largest safe integer is invalid, …`         | failed                           |
| B2   | `B2 stationPoints: the largest safe integer still parses`                           | passed (pre-existing); see below |
| B3   | `B3 stationProblem: points that are not a safe integer are impossible`              | failed                           |
| B4   | `B4 stationProblem: a max that is not a non-negative safe integer is impossible, …` | failed                           |
| B5   | `B5 stationProblem: a scratched station keeps whatever was written`                 | passed (pre-existing); see below |
| B6   | `B6 stationPoints: hex and exponent notation stay invalid, …`                       | passed (pre-existing); see below |

B2, B5 and B6 describe behaviour that already held, kept as regression armor.
Each was proved non-vacuous with a throwaway mutant, then restored:

- B2: `isCount` also requiring `value < Number.MAX_SAFE_INTEGER` → B2 failed
  (with B3, B4).
- B5: the scratched early return disabled → B5 failed (with S1).
- B6: the digits pattern loosened to `/\d+$/` → B6 failed.

The one assertion removed: S1's
`stationProblem(station({ pointsMax: -1 }))` → `null`. The spec's B4 replaces
it (a max of `-1` is now a problem, with or without points). It was removed
before the implementation changed, but without a test run between the two
edits; the run after both was green, and B4 was seen RED beforehand.

## Gauntlet (final run, after the last code edit)

| Layer                                           | Command                                                             | Result                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Full suite, types, lint, format, i18n, licenses | `pnpm check`                                                        | exit 0; vitest 240 files passed, jest 1023 tests passed                                    |
| Coverage                                        | `pnpm check` (`vitest run --coverage`)                              | `shared/src/scoring/*.ts` at the 100% gauntlet threshold (the run exits non-zero below it) |
| Mutation                                        | `pnpm exec stryker run --mutate shared/src/scoring/falt-station.ts` | 192 killed, 2 survived, score 98.97% (main: 183 killed, 1 survived, 99.46%)                |
| Property tests                                  | —                                                                   | none added: two parsers with a fixed boundary, pinned at both sides by example tests       |

Both survivors are equivalent mutants:

- `falt-station.ts:56`, `points != null` → `true` in the `points > pointsMax`
  check. With `points` null, `null > pointsMax` compares `0 > pointsMax`, and
  B4 has already refused any `pointsMax` below 0, so it is always false. New
  since this change: before it, `pointsMax: -1` reached this line.
- `falt-station.ts:95`, `points !== null` → `true` in `stationPoints`. Same
  reason: `null > pointsMax` is false for every max `parseCount` returns.
  Survived on main too.

## Not covered

- The ShotLog importer's counts: out of scope, see the spec.
- Rows already stored with an unsafe value: none can exist outside this
  maintainer's own device, and pre-1.0 there is no migration for them (CLAUDE.md
  rule 8).
