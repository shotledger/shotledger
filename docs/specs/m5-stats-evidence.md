# M5 statistics — evidence report

Spec: `docs/specs/m5-stats-spec.md`. **Spec approval: not obtained
(autonomous run).** All numbers below are from one final fresh run executed
after the last code edit to `shared/src/scoring/standardmedalj.ts` and
`shared/src/scoring/stats.ts` (source state: branch `feat/m5-stats`, on top
of `feat/m4-gear`).

## Behavior → test mapping

| Behavior | Test |
|---|---|
| B1–B10 | `shared/src/scoring/standardmedalj.test.ts` → `describe('standardmedaljPoints')` |
| B11–B12 | `shared/src/scoring/standardmedalj.test.ts` → `describe('standardmedaljForSession')` |
| B13–B31 | `shared/src/scoring/stats.test.ts`, one `it` per behavior (see file; several behaviors have an extra mutation-hardening test alongside, named descriptively rather than `Bn`) |

Every behavior in the spec has a corresponding test with the exact fixture
values from the spec text; the spec's hand-computed expected values (e.g.
B15's SD=10, B24's recentMean=95/previousMean=87) match the implementation's
output — confirmed by the GREEN run below producing the literal numbers
written in the spec before the code existed.

## Gauntlet layers — final run

All commands run from the repo root on branch `feat/m5-stats`.

### Full suite

```
pnpm exec vitest run
```
```
Test Files  23 passed (23)
     Tests  270 passed (270)
```
223 tests from the M4 baseline + 47 new (18 standardmedalj + 29 stats) = 270.
Zero new failures; zero pre-existing failures (none existed at the M4
baseline either).

### Typecheck / lint

```
pnpm typecheck   # tsc -b — clean
pnpm lint        # eslint . — clean
```

### Coverage (gauntlet layer, fails closed on miss)

```
pnpm coverage
```
```
Statements   : 100% ( 607/607 )
Branches     : 100% ( 256/256 )
Functions    : 100% ( 59/59 )
Lines        : 100% ( 607/607 )
```
Scoped to `shared/src/scoring/**` and `shared/src/disciplines/**`
(`vitest.config.ts`); `standardmedalj.ts` and `stats.ts` are new files inside
that glob, so this number is 100% including both.

### Mutation testing (Stryker)

```
pnpm mutation
```
```
All files            98.15%   (581 killed / 2 timeout / 11 survived / 0 no-cov / 0 errors)
 scoring             98.52%   (466 killed / 0 timeout / 7 survived)
  standardmedalj.ts  94.23%   (49 killed / 3 survived)
  stats.ts           99.29%   (139 killed / 1 survived)
Final mutation score of 98.15 is greater than or equal to break threshold 95 — exit 0.
```

`disciplines/{classes,groups,index}.ts` and `scoring/{entry,marke}.ts`
survivors (4 + 2 = 6 of the 11 total) are **pre-existing from M3/M4**, not
touched by this change — out of scope for this report, already classified
in `docs/specs/m3-scoring-evidence.md`.

**M5's own 4 survivors, classified equivalent (no test can distinguish them
from the original — see anti-gaming rule 4, "never chase a meaningless
mutant"):**

1. `standardmedalj.ts:107` — `PRECISION_WEAPON_GROUP_TO_STD_GROUP[input.weaponGroup ?? '']`
   mutated to `?? "Stryker was here!"`. Neither `''` nor the sentinel string
   is a key in the lookup table, so both produce `undefined` → the same
   `null` result. Equivalent for every input where `weaponGroup` is
   null/undefined.
2. `standardmedalj.ts:118` — same reasoning, for `MILSNABB_WEAPON_GROUP_TO_STD_GROUP`.
3. `standardmedalj.ts:109` — `if (input.seriesCount > 10)` mutated to
   `>= 10`. Proved equivalent: for `seriesCount < 10` both conditions are
   false (same branch); for `seriesCount > 10` both are true (same branch);
   at exactly `seriesCount === 10`, the mutant takes the scaling formula
   (`round(row10/10*10)`) while the original takes the direct table lookup
   — but `round(x/10*10) === x` for any integer `x`, so the two branches
   produce numerically identical `Thresholds` objects. No input can tell
   them apart.
4. `stats.ts:190` — `recentMeanTenths !== null && previousMeanTenths !== null`
   mutated to `true && previousMeanTenths !== null`. Proved equivalent:
   `recentMeanTenths` is `null` iff the `recent` slice is empty, which by
   construction (`slice(max(0, len-n))`) only happens when `len === 0`
   (matching series list empty). In that same case `previous` is also
   `slice(max(0,-2n), max(0,-n))` = `slice(0,0)` = `[]`, so
   `previousMeanTenths` is `null` too. Contrapositive: whenever
   `previousMeanTenths !== null`, `recentMeanTenths !== null` already holds,
   making the left conjunct redundant.

Negative control (gauntlet checker note): before trusting Stryker's "pass",
a throwaway mutant was hand-verified to be catchable — the `>=`/`>` swap at
`standardmedalj.ts:128-133` (silver/brons comparison) was initially
uncaught until the boundary test "brons threshold is inclusive" was added;
its addition turning that specific mutant from survived to killed in the
rerun is the non-vacuous proof that the mutation runner does detect real
gaps, not just report a static pass.

### Schema mutation (unaffected layer, rerun to confirm no regression)

```
pnpm mutation:schema
```
```
17/17 mutants killed.
```
No zod schema changed in this branch; rerun proves zero regression.

### Format

`pnpm format` (`prettier --check .`) is not part of `pnpm check` per
CLAUDE.md/§1 and has pre-existing warnings unrelated to this change (listed
when run) — the three new files this branch touches
(`standardmedalj.ts`, `stats.ts`, `stats.test.ts`, `standardmedalj.test.ts`,
this spec) were explicitly run through `prettier --write` and are clean.

## Layers skipped, and why

- **Property-based tests**: not added. The domain is closed-form arithmetic
  over small fixed lookup tables (spec §"Calibration") — there is no
  round-trip/idempotence/ordering invariant beyond what the table-driven
  behaviors already assert. `compareRecentSeries`'s chronological-sort
  behavior is the closest thing to an invariant and is covered directly
  (the "sorts input chronologically regardless of array order" test).
- **Supply-chain audit**: no new runtime dependency in `stats.ts`/
  `standardmedalj.ts` (both pure TS, zero imports outside `./marke` and
  `./totals`, both already in the tree).
- **Fuzzing**: no parser/deserializer in this change.
- **Complexity budget**: every exported function is single-purpose; the
  largest, `aggregateBy`, is ~20 lines and reused by both
  `aggregateByFirearm`/`aggregateByAmmoLot` rather than duplicated.

## Negative constraints check (spec's "must NOT change" list)

- `totals.ts`, `marke.ts`, `entry.ts`: unmodified (`git diff` shows no
  changes to these files); their own test files still pass unmodified
  (32/45/16 tests respectively, all green above).
- 223 pre-existing tests: all present in the 270-test run, zero failures.
- No DB schema, query-layer, or M0-M4 screen changed by this file.
- `pnpm typecheck`/`pnpm lint`: green (above).

## Deviations from the spec during implementation

None. The two modules were implemented to match the spec's stated formulas
and fixtures exactly; the only changes after the first GREEN run were
**additional tests** (never implementation edits made in the same step as a
test edit — anti-gaming rule 2) to close coverage/mutation gaps the initial
test set left open, listed above and in the git history of this branch as a
distinct commit from the modules' initial implementation.

## UI layer (not under the old-coder mandate — CLAUDE.md scopes that to
`shared/scoring/`)

The `/stats` tab and session-detail Stats toggle consume these two modules
but are ordinary React Native screens, tested/verified per the project's
normal M2-M4 UI conventions (Maestro + manual screenshot verification), not
the gauntlet above. See the M5 report for that evidence (Maestro outcome,
screenshots, chart-library decision).
