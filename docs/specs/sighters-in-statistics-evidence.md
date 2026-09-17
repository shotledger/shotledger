# Sighters in the Statistics tab — evidence report

> Old-coder EVIDENCE artifact for `feat/sighters-in-statistics`.
> Absolute path:
> `/home/jimisola/cloud/dev/clones/jimisola/github/shotledger/docs/specs/sighters-in-statistics-evidence.md`
> Spec: `docs/specs/sighters-in-statistics-spec.md`.
>
> **Spec approval: NOT OBTAINED (autonomous run).** Spec and implementation
> were authored by the same agent in one session, so the correlation-breaking
> review did not happen. Confidence is claimed accordingly: the gauntlet shows
> the code does what the spec says, not that the spec says the right thing.
> Spec §2 records the three questions the maintainer's sentence did not settle;
> he confirmed §2.1 and §2.2 and corrected §2.3 on 2026-09-17.

## Source state

|                          |                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline (`origin/main`) | `cfeecb2` — `fix(npm): update dependency zod to v4.6.4 (#271)`. The branch was later rebased onto `da1181f` (two Renovate bumps) and every number below re-measured there; the baseline figures are the ones from `cfeecb2` |
| Branch                   | `feat/sighters-in-statistics`                                                                                                                                                                                               |
| Tree                     | this agent's git worktree, `pnpm i` run at the start (a fresh worktree carries no `node_modules`)                                                                                                                           |
| Node                     | 24.12.0 · pnpm 12.4.1                                                                                                                                                                                                       |
| vitest                   | 5.0.0 · `@vitest/coverage-v8` 5.0.0 · fast-check 4.10.0                                                                                                                                                                     |
| Stryker                  | `@stryker-mutator/core` 10.0.0 + `@stryker-mutator/vitest-runner` 10.0.0                                                                                                                                                    |

Every command below exists in the repo (`package.json` scripts,
`stryker.config.json`, `scripts/`); nothing was run from a scratch directory.
`pnpm gauntlet` reruns every layer except the two docs gates, which CI's
_Build (strict)_ job owns.

**Worktree vs landing tree:** the two differ only by gitignored content
(`node_modules`, `coverage/`, `site/`). No `.env` or build output participates
in any layer below.

## Baselines measured on `origin/main` first

Both repo-wide gates are **already red on `origin/main`**, so the constraint
held here is _zero new_ failures, not _green_.

`pnpm coverage` on `cfeecb2`:

```
Statements   : 99.87% ( 2421/2424 )
Branches     : 99.38% ( 1445/1454 )
Functions    : 100% ( 568/568 )
Lines        : 99.9% ( 2095/2097 )
ERROR: Coverage for lines (99.9%) does not meet global threshold (100%)
```

Files below 100% on `cfeecb2` (the pre-existing debt, untouched by this change):

| file                                                   | S     | B     | L     |
| ------------------------------------------------------ | ----- | ----- | ----- |
| `shared/src/disciplines/index.ts`                      | 98.48 | 96.15 | 100   |
| `shared/src/integrations/webshooter/api/httpClient.ts` | 100   | 92.30 | 100   |
| `shared/src/integrations/webshooter/api/spaLogin.ts`   | 98.03 | 89.13 | 97.91 |
| `shared/src/scoring/heatmap.ts`                        | 100   | 94.44 | 100   |
| `shared/src/timer/mic-diagnostics.ts`                  | 99.07 | 100   | 98.92 |

`pnpm exec stryker run --mutate 'shared/src/scoring/stats.ts,shared/src/scoring/analytics.ts,shared/src/export/json-log.ts'` on `cfeecb2`:

```
All files      |  99.42 |   99.42 |      340 killed |  0 timeout |  2 survived |  0 no cov |  0 errors
  json-log.ts  | 100.00 |       — |       23 |  0 |  0 |
  analytics.ts |  98.70 |       — |      152 |  0 |  2 |
  stats.ts     | 100.00 |       — |      165 |  0 |  0 |
```

The two baseline survivors are both in `filterAnalyticsSeries`, a function this
change does not touch:

```
[Survived] ConditionalExpression  shared/src/scoring/analytics.ts:93:9
-   if (filter.fromIso !== null && series.startedAt < filter.fromIso) return false;
+   if (true && series.startedAt < filter.fromIso) return false;

[Survived] ConditionalExpression  shared/src/scoring/analytics.ts:94:9  (same shape, toIso)
```

Both are **equivalent mutants**: with the bound `null`, the surviving
comparison is `string < null`, which JavaScript evaluates by coercing `null` to
`0` and the string to `NaN`, so it is `false` — exactly what the removed
null-guard produced. No test can distinguish them, and per the old-coder
equivalent-mutant rule they are classified rather than chased.

## Spec behaviors → tests

All in `shared/src/scoring/sighter-scope.test.ts` unless noted. Test names carry
the `SS-n` tag.

| id           | test                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| SS-1         | `stats.ts — SighterScope > SS-1: scoredSeries defaults to the in-session scope`                            |
| SS-2         | `SS-2: an explicit includeSighters:false is the same as omitting it`                                       |
| SS-3         | `SS-3: includeSighters:true keeps every series, in input order`                                            |
| SS-4         | `SS-4: an empty list stays empty in the cross-session scope`                                               |
| SS-5         | `SS-5: scoredShots pools the sighter shots in the cross-session scope`                                     |
| SS-6         | `SS-6: scoredShots defaults to the non-sighter shots`                                                      |
| SS-7         | `SS-7: volumeShotCount has no scope argument — it always counts sighters`                                  |
| SS-8         | `SS-8: guldserieCount always counts a sighter, in either scope`                                            |
| SS-9         | `SS-9: the cross-session scope returns a copy, not the caller’s array`                                     |
| SS-10        | `analytics.ts — SighterScope > SS-10: analyticsSessionPoints without a scope is unchanged`                 |
| SS-11        | `SS-11: analyticsSessionPoints in the cross-session scope counts the sighter`                              |
| SS-12        | `SS-12: a sighter-only session yields a real point in the cross-session scope`                             |
| SS-13        | `SS-13: a sighter-only session still yields an empty point by default`                                     |
| SS-14        | `SS-14: analyticsTotals without a scope is unchanged`                                                      |
| SS-15        | `SS-15: analyticsTotals in the cross-session scope counts the sighter`                                     |
| SS-16        | `SS-16: volume and session count are identical in both scopes`                                             |
| SS-17        | `SS-17: an empty sighter series carries no score and is counted in neither scope`                          |
| SS-18        | `SS-18: a WS1 override sighter contributes its stored total, not shot figures`                             |
| SS-19        | `SS-19: records follow the cross-session scope`                                                            |
| SS-20        | `SS-20: records are unchanged in the default scope`                                                        |
| SS-P1        | `SighterScope properties > SS-P1: "included" equals "as if never marked sighter"` (fast-check)             |
| SS-P2        | `SS-P2: the default scope never counts more shots, and volume is scope-free` (fast-check)                  |
| SS-21, SS-22 | `shared/src/export/json-log.test.ts > SS-21/SS-22: the echo says which sighter scope produced the numbers` |

### Negative constraints

| id    | how it is discharged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-1 | **Partially superseded by the 2026-09-17 ruling.** `analytics.test.ts` and every other existing suite are untouched; `json-log.test.ts` gained one additive fixture field (`includeSighters: true`, required by the new type). The one existing **assertion** edited is `stats.test.ts` B28, `2` → `3`, because the maintainer's guldserie ruling changed the contract it encodes (§2.3) — declared here rather than hidden, and the spec and `m5-stats-spec.md` B28 were amended in the same commit. Every other baseline assertion passes unedited. |
| INV-2 | `git diff --stat` touches no in-session file: `use-session-stats.ts`, `totals.ts`, `marke.ts`, `standardmedalj.ts` are unchanged. The `pnpm check` jest run (361 app tests) covers the session screens.                                                                                                                                                                                                                                                                                                                                               |
| INV-3 | `pnpm typecheck` + `pnpm typecheck:app` both clean. Every new parameter is `scope: SighterScope = {}`; the one required field (`AnalyticsReportJsonFilter.includeSighters`) has its only producer updated in the same commit, which is why the typecheck passes.                                                                                                                                                                                                                                                                                      |
| INV-4 | SS-7, SS-8, SS-16, SS-P2. `volumeShotCount` is unchanged; `guldserieCount` has one unconditional change (§2.3) and, like volume, no scope parameter at all — so neither can vary with the filter, by construction, and the tests pin both positions.                                                                                                                                                                                                                                                                                                  |
| INV-5 | Coverage run below: `stats.ts` and `analytics.ts` are 100/100/100/100.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| INV-6 | Mutation run below: same two survivors as the baseline, zero new.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| INV-7 | `package.json`/`pnpm-lock.yaml` unchanged; no `drizzle` migration added; `pnpm licenses:check` passes unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| INV-8 | `decodeAnalyticsFilter` spreads `DEFAULT_ANALYTICS_FILTER` before the parsed object, so a param string written before this change gets `includeSighters: true`. Exercised by every existing report-route test and by the app's own decode tests.                                                                                                                                                                                                                                                                                                      |

## Gauntlet — all numbers from one fresh run after the last edit

| layer              | command                                                                                                                                                                                                                                                                                                                                     | result                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full suite         | `pnpm check`                                                                                                                                                                                                                                                                                                                                | **green.** typecheck ✓, typecheck:app ✓, schema:check ✓, i18n:check ✓ (1036 keys each in en/sv, 0 issues), licenses:check ✓, eslint ✓, prettier ✓, vitest **128 files / 2064 tests passed**, jest **37 suites / 361 tests passed**                                                                          |
| coverage           | `pnpm coverage`                                                                                                                                                                                                                                                                                                                             | 99.87% S / 99.38% B / 100% F / 99.9% L — **identical to the baseline**, same five files below 100%, none of them touched here. `shared/src/scoring/stats.ts` **100/100/100/100**; `shared/src/scoring/analytics.ts` **100/100/100/100**                                                                     |
| mutation           | `pnpm exec stryker run --mutate 'shared/src/scoring/stats.ts,shared/src/scoring/analytics.ts,shared/src/export/json-log.ts'`                                                                                                                                                                                                                | **348 killed, 2 survived, 0 timeout, 0 errors, 99.43%** (baseline 340/2/99.42). `stats.ts` 100.00, `json-log.ts` 100.00, `analytics.ts` 98.76. The 2 survivors are byte-for-byte the baseline's two equivalent mutants — **zero new survivors**; the 8 additional killed mutants are the new scope branches |
| property-based     | SS-P1 / SS-P2 in the suite above                                                                                                                                                                                                                                                                                                            | pass (fast-check default 100 runs each)                                                                                                                                                                                                                                                                     |
| docs gates         | `mkdocs build --strict`                                                                                                                                                                                                                                                                                                                     | exit 0, "Documentation built in 1.57 seconds", 19 nav elements translated to sv                                                                                                                                                                                                                             |
| docs gates         | `node scripts/docs-translation-check.mjs`                                                                                                                                                                                                                                                                                                   | exit 0 — "16 translated page(s) current, 0 not translated yet"                                                                                                                                                                                                                                              |
| complexity         | reviewed, no new function longer than 6 lines; `isScoredSeries` gained one parameter and one clause                                                                                                                                                                                                                                         | n/a                                                                                                                                                                                                                                                                                                         |
| supply chain       | dependency set unchanged (`package.json`, `pnpm-lock.yaml` untouched), so no audit re-run is warranted; no new network/filesystem/env capability in the diff; no secret in the diff                                                                                                                                                         | n/a                                                                                                                                                                                                                                                                                                         |
| suite health       | the suite is deterministic by construction here (pure functions, no clock, no I/O in the new tests); `pnpm check`'s vitest run was executed twice during the run with identical results                                                                                                                                                     | n/a                                                                                                                                                                                                                                                                                                         |
| **real execution** | **SKIPPED.** UI verification is the maintainer's, per the task instruction: no emulator was started, no Metro, no Maestro flow. **The new Sighters filter control has never been seen rendering**, and the report's new echo line has never been seen on screen. The evidence for the UI is therefore typecheck + lint + the i18n gate only | skipped                                                                                                                                                                                                                                                                                                     |

## RED evidence

`pnpm exec vitest run shared/src/scoring/sighter-scope.test.ts` before any
implementation edit:

```
Test Files  1 failed (1)
     Tests  8 failed | 14 passed (22)
```

The 8 failures are exactly the cross-session-scope behaviors (SS-3, SS-5,
SS-11, SS-12, SS-15..SS-18 and the two properties collapsed into their
assertions) — each observed failing on an assertion, not on an import error,
because both modules already existed. The 14 that passed on the first run are
the **default-scope** assertions (SS-1, SS-2, SS-4, SS-6..SS-10, SS-13, SS-14,
SS-19, SS-20): they are pre-existing behaviour kept deliberately as regression
armour for INV-1, and they are not vacuous — the mutation run kills 166 mutants
in `stats.ts` and 159 in `analytics.ts`, including the new branch, which is the
same proof a throwaway mutant would give for each.

## What failed along the way

- `prettier --check` failed on three new/edited files on the first `pnpm check`
  (`app/src/app/(tabs)/stats.tsx`, the spec, the new test file). Fixed with
  `prettier --write`; nothing about the assertions changed.
- `SegmentedControl` is generic over `T extends string`, so the first draft of
  the filter control, which passed `true`/`false` as option values, did not
  typecheck. Changed to `'include' | 'exclude'` mapped to the boolean at the
  edge. Caught by `pnpm typecheck:app`, not by review.

- **A domain fact was read wrong and the maintainer corrected it (2026-09-17),
  after the first push.** `guldserieCount` had been left excluding sighters on
  a carve-out argument; his ruling is that a sighter always counts towards a
  guldserie. Fixed in `stats.ts` (it no longer calls `scoredSeries` at all),
  with SS-8 and the existing B28 assertion corrected, the spec's §2.3 rewritten
  to record the ruling in place of the reading, the manual corrected in both
  languages, and — the actual root cause — spsf-domain rule 2 rewritten. The
  gauntlet did not catch this and could not: the tests agreed with the spec,
  and the spec was wrong. It is what spec approval exists for.

Nothing was weakened to reach green: no test edited to pass, no assertion
broadened, no threshold moved, no skip added. The one existing assertion
changed (B28, `2` → `3`) was changed **because the contract changed**, on the
maintainer's ruling, with the spec amended in the same commit — and it is a
tighter assertion, not a looser one.

## Known limits

1. **No UI has been seen.** See the skipped layer above.
2. **The spec was not independently approved**, so the two remaining
   boundaries in spec §2 — volume never following the toggle (§2.1) and
   records following it (§2.2) — were this agent's readings of one sentence
   from the maintainer. He **confirmed both on 2026-09-17**, the
   session-screen mismatch in §2.2 explicitly accepted with the filter as the
   escape hatch. The third reading was wrong and has been corrected; see the
   next item.
3. **The guldserie carve-out was wrong and is gone.** The first draft had
   `guldserieCount` skipping sighters as a conservative award-eligibility
   carve-out. Maintainer, 2026-09-17: _"I sighter always counts towards
   guldserie. I told you this before."_ `guldserieCount` now counts sighters
   unconditionally — no scope, no filter dependence. The root cause was
   `.claude/skills/spsf-domain/SKILL.md` rule 2 ("excluded from every score
   and score statistic"), which is rewritten in this PR to state the
   in-session, cross-session, volume and guldserie cases separately. Existing
   assertion `stats.test.ts` B28 changed from `2` to `3` as a direct
   consequence of the ruling — a corrected contract, not a weakened test, and
   `m5-stats-spec.md` B28 is amended with it.
4. **`compareRecentSeries`, `sessionTrend`, `aggregateByFirearm` and
   `aggregateByAmmoLot` still exclude sighters** and gained no toggle (spec
   §2.4). The last three have no app caller today; `compareRecentSeries` is
   shown inside a session.
5. The JSON report format stayed at **version 1** with an added filter field.
   A consumer that validates v1 with `additionalProperties: false` would now
   reject the file — no such published schema exists for this format (only the
   sessions export has one), but it is the reason the field is documented as
   additive rather than as a silent change.
