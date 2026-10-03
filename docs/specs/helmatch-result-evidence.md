# Evidence Report — Nationell helmatch result (Tier 2)

Spec: `docs/specs/helmatch-result-spec.md` (issue #476, slice 4).

- **Spec approval: not obtained (autonomous run).** The maintainer was not
  available synchronously. The spec was committed before any implementation
  file was touched, so later drift is a `git diff` against that commit; it
  is the artifact to review after the fact, and confidence is claimed
  accordingly.
- Source state: `778c77f` (`feat(scoring): helmatch delmoment subtotals, …`),
  branch `feat/helmatch-result`. Every number below is from one fresh run
  after that commit's last code edit.
- Toolchain: the repo's lockfile (`pnpm-lock.yaml`); vitest 5.0.3, Stryker
  10.0.0, Prettier 3.9.9, eslint 10.11.0.
- Entry point: `pnpm check && pnpm coverage` (then `pnpm reqstool:tags &&
pnpm reqstool:status`); mutation with the Stryker command below.
- Independent verification: not performed (Tier 2).

## Spec → test mapping

| Scenario                                          | Test                                                                                                                                                                         | Status |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1 subtotals per stage, sighters excluded         | `shared/src/scoring/stages.test.ts` › S1; top-level SVC_SCORE_008 test                                                                                                       | pass   |
| S2 a stage with no scored series is 0             | `stages.test.ts` › S2                                                                                                                                                        | pass   |
| S3 unstaged or unlisted series move nothing       | `stages.test.ts` › S3                                                                                                                                                        | pass   |
| S4 helmatch skeleton carries A/B/C; seriesStage   | `shared/src/disciplines/index.test.ts` › "program stages" (3 tests)                                                                                                          | pass   |
| T1 helmatch keys are C, then B                    | `stages.test.ts` › T1                                                                                                                                                        | pass   |
| T2 other disciplines have no keys                 | `stages.test.ts` › T2                                                                                                                                                        | pass   |
| T3–T7 ranksAhead                                  | `stages.test.ts` › T3, T4, T5, T6, T7                                                                                                                                        | pass   |
| R1 report best session uses the tie-break         | `shared/src/scoring/analytics.test.ts` › R1                                                                                                                                  | pass   |
| R2 Records best session uses the tie-break        | `shared/src/integrations/webshooter/stats/pb.test.ts` › R2; `app/src/db/queries/webshooter-stats.test.ts` › "helmatch tie-break keys" (2 tests)                              | pass   |
| R3 a precision tie keeps the first seen           | `analytics.test.ts` › R3 and the existing A-R3; `pb.test.ts` › "an exact tie keeps the first-seen session"                                                                   | pass   |
| M1 placement-only discipline set                  | `shared/src/scoring/standard-medal.test.ts` › M1; top-level SVC_SCORE_009 test                                                                                               | pass   |
| M2 no helmatch total computes a medal             | `standard-medal.test.ts` › M2 — passed on first run (pre-existing behaviour); proven non-vacuous with a throwaway mutant routing helmatch to the milsnabb table: M2 went red | pass   |
| M3 Edit Session records the official medal        | Real execution in the web preview (below); no automated UI test                                                                                                              | pass   |
| Must NOT N1: existing skeletons only gain `stage` | `index.test.ts` G7/G8 and the ISSF/SvSF program tests, unchanged except the added `stage: null`                                                                              | pass   |
| Must NOT N2: totals and other rankings unchanged  | full suite (2417 vitest + 553 jest) green; A-R3 and the first-seen PB test unchanged                                                                                         | pass   |
| Must NOT N3: no computed helmatch medal           | M2, SVC_SCORE_009                                                                                                                                                            | pass   |
| Must NOT N4: no sighter in a subtotal             | S1, SVC_SCORE_008, `webshooter-stats.test.ts` (position 6 sighter left out)                                                                                                  | pass   |
| Must NOT N5: no dependency, no migration          | `git diff main -- package.json pnpm-lock.yaml app/src/db/migrations` is empty                                                                                                | pass   |

RED was observed for every new test except M2 (above): the stub
`stages.ts` threw for S1–S3/T1–T7 (10 failed), the S4 tests failed before
`stage` existed, M1 failed with `placementOnlyStandardMedal is not a
function`, and R1/R2/R3 failed before the wiring.

## Gauntlet (final fresh run)

| Layer         | Command                                                                                                                                                                                                             | Result                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tests         | `pnpm check`                                                                                                                                                                                                        | exit 0; vitest 138 files, 2417 passed; jest 50 suites, 553 passed                                                                                                              |
| Types         | `pnpm typecheck`, `pnpm typecheck:app` (in `check`)                                                                                                                                                                 | 0 errors                                                                                                                                                                       |
| Lint + format | `pnpm lint`, `pnpm format` (in `check`)                                                                                                                                                                             | 0 warnings                                                                                                                                                                     |
| Coverage      | `pnpm coverage` (100% threshold, exits nonzero when missed)                                                                                                                                                         | exit 0; statements 2832/2832, branches 1753/1753, functions 653/653, lines 2434/2434                                                                                           |
| Mutation      | `pnpm exec stryker run --mutate "shared/src/scoring/stages.ts,shared/src/scoring/standard-medal.ts,shared/src/scoring/analytics.ts,shared/src/integrations/webshooter/stats/pb.ts,shared/src/disciplines/index.ts"` | 624 killed, 5 timeout, 26 survived — 96.03%, above the 95 break. Survivors classified below                                                                                    |
| Schema mutant | manual: `stage: z.string().min(1)` → `z.string()`                                                                                                                                                                   | killed by "a stage id must not be empty"                                                                                                                                       |
| Property      | —                                                                                                                                                                                                                   | not added: `ranksAhead` is a three-branch comparator fully enumerated by T3–T7                                                                                                 |
| Real exec     | web preview, `/dev` demo data                                                                                                                                                                                       | helmatch Full Match shows A 176 · B 168 · C 180 · Total 524; Edit Session offers None/Bronze/Silver; choosing Bronze and saving shows "Standard Medal: Bronze" under the title |
| Supply chain  | —                                                                                                                                                                                                                   | no dependency change                                                                                                                                                           |
| Suite health  | `pnpm exec vitest run shared/src/scoring shared/src/disciplines shared/src/integrations/webshooter/stats --sequence.shuffle --sequence.seed=476`                                                                    | 613 passed                                                                                                                                                                     |
| Traceability  | `pnpm reqstool:status`                                                                                                                                                                                              | exit 0; 19 SVC tests passed, 0 missing                                                                                                                                         |

### Surviving mutants

In code this slice added, all equivalent:

- `stages.ts` `Math.min` → `Math.max`, `i < shared` → `i <= shared`: an index
  past the shorter key list compares a number with `undefined`, which is
  false either way, so the function still returns "not ahead".
- `stages.ts` `>` → `>=` under a preceding `!==` (twice): the values are
  already known to differ.
- `analytics.ts:284` default tie-break `() => []` → `() => ['…']` and
  `pb.ts:197` `?? []` → `?? ['…']`: the placeholder only ever meets an
  equal placeholder or a shared length of zero, so no comparison changes.
- `disciplines/index.ts` `?? []` → `?? ['…']` in `programSighterCount`,
  `programStages` and `assertProgramFaces`: a string element has no
  `sighterSeries`, `stage` or `targetFace`, so it contributes nothing.

One survivor was a real gap and is now killed: `seriesTargetFace`'s
`position - 1` → `position + 1` (slice 2 code). The added assertion at the
stage boundary (`seriesTargetFace(centre fire, 7)` is the precision face)
kills it; a rerun on that range scored 5/5.

The remaining survivors predate this branch (the analytics date filters, the
weapon-group-key fallbacks in `standard-medal.ts`, `pb.ts`'s official-PB
comparator and `parseStatsGroupKey`, the weapon-group context strings in
`disciplines/index.ts`) and are left as found.

## Layers not run as specified

- **N-A:** supply-chain audit (no dependency change).
- **SUBSTITUTED:** mutation ran on the five changed shared modules rather
  than `pnpm mutation`'s full set; the unchanged modules' scores are not
  re-measured here.
- **Not automated:** M3 (the Edit Session picker and the medal line) is
  verified in the running app only, as the repo's other screens are.

## Known limits

- A series' stage is resolved by position, like its face and time limit; a
  series moved by long-press reorder takes the stage of its new position.
- `bestNSeries` (Records' "Best 5/10") still sums a session's best N series
  across delmoment; it ranks series sums, not sessions, so the C-then-B rule
  does not apply to it.
- The official medal is recorded for helmatch only. Fält is placement-only
  too (C.5.1.2.1) but was not part of #476.
