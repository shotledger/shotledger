# WebShooter client core — evidence report

Spec: `docs/specs/webshooter-core-spec.md`. **Spec approval: not obtained
(autonomous run)** — this report is the review artifact, per the old-coder
skill's fallback for autonomous execution.

Source state: branch `feat/webshooter-core`, off `origin/feat/m5-stats`,
commits `3c20f6a`..`a5be6b3` (worktree
`.claude/worktrees/agent-ad59cb6d31107638e`).

## Behavior → test mapping

| Spec section | Behavior                                                                               | Test file                    |
| ------------ | -------------------------------------------------------------------------------------- | ---------------------------- |
| §2.1         | Wire schemas, fixture round-trips, negative controls                                   | `api/schemas.test.ts`        |
| §2.2         | Retry-on-5xx backoff, token header, no-retry on 4xx, malformed body                    | `api/httpClient.test.ts`     |
| §2.3         | Per-resource TTL cache, forceRefresh, uncached auth                                    | `api/client.test.ts`         |
| §2.4         | SPA login stub always rejects, never calls fetch                                       | `api/spaLogin.test.ts`       |
| §3           | Card-number normalization, match table, identity resolution order                      | `identity.test.ts`           |
| §4.1         | Classname → weapon_group/shooter_class, fail-soft unknowns                             | `mapping.test.ts`            |
| §4.2         | results_type → discipline/program, out-of-scope → null                                 | `mapping.test.ts`            |
| §4.3         | Station results → series overrides (main/final/särskjutning), official placement/medal | `mapping.test.ts`            |
| §4.4         | Local (Stockholm) → UTC, DST boundaries, malformed input                               | `mapping.test.ts`            |
| §5.1–5.2     | External ref, exact match, heuristic candidates, Levenshtein similarity                | `reconcile.test.ts`          |
| §5.4         | Score-vs-enrichment field classification and merge                                     | `reconcile.test.ts`          |
| §6.2         | Official PB eligibility/scoring/grouping/tie-break                                     | `stats/pb.test.ts`           |
| §6.3         | Freeform best-N-series / best-session                                                  | `stats/pb.test.ts`           |
| §6.4         | Year stats, YoY change, two-point trend                                                | `stats/yearOverYear.test.ts` |
| §6.5         | Fixed/relative/dual-path medals                                                        | `stats/medals.test.ts`       |
| §7           | Calendar event builder, UID stability, Stockholm→UTC                                   | `calendar.test.ts`           |
| Barrels      | `index.ts`/`api/index.ts`/`stats/index.ts` re-exports                                  | `index.test.ts` (×3)         |

## Gauntlet results (fresh run after the last code edit)

| Layer                            | Command                                                      | Result                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite                       | `pnpm exec vitest run`                                       | 38 files, 494 tests, all passed                                                                                                                                                                                                                                                              |
| Types                            | `pnpm typecheck`                                             | clean (`tsc -b`)                                                                                                                                                                                                                                                                             |
| Lint                             | `pnpm lint`                                                  | clean (`eslint .`)                                                                                                                                                                                                                                                                           |
| Format                           | `pnpm exec prettier --check` (scoped to this branch's files) | clean; **not** run repo-wide — `pnpm format` has pre-existing failures on ~24 files this task never touched (CLAUDE.md, plan.md, several `app/` files, older docs); recorded as pre-existing baseline, not this task's regression                                                            |
| Root check                       | `pnpm check` (typecheck + lint + vitest + app jest)          | green                                                                                                                                                                                                                                                                                        |
| Coverage                         | `pnpm coverage`                                              | **100%** lines/branches/functions/statements on `shared/src/integrations/webshooter/**/*.ts` (`vitest.config.ts` coverage `include` extended)                                                                                                                                                |
| Mutation (Stryker)               | `pnpm mutation`                                              | **98.14%** overall (was 94.08% before the strengthening pass, threshold 95 — failed the first run, passed after). `webshooter` subtree: 576 killed / 4 timeout / **11 survived** (98.14%). All 11 survivors are documented equivalent mutants (below) — none represent an untested behavior. |
| Mutation (schemas, manual)       | `node scripts/mutate-webshooter-schema.mjs`                  | **11/11 killed**                                                                                                                                                                                                                                                                             |
| Mutation (M3 schema, unaffected) | `node scripts/mutate-schema.mjs`                             | 17/17 killed (pre-existing layer, confirms no regression)                                                                                                                                                                                                                                    |
| Property-based tests             | —                                                            | **Skipped, scoped**: no unbounded numeric domain beyond the boundary cases already table-tested (mapping and identity are finite pattern tables; stats arithmetic is covered by the equal/reverse-order/tie cases in `stats/pb.test.ts`). Recorded, not silently omitted.                    |
| Real execution                   | —                                                            | N/A: pure-logic library, no CLI/app entry point in this branch. The test suite importing and calling every export (proven by 100% coverage) is the closest equivalent.                                                                                                                       |
| Supply chain                     | —                                                            | No new dependency (zod was already a `shared` dependency); nothing to audit.                                                                                                                                                                                                                 |

### Stryker survivors — equivalence justification

All 11 are inside `shared/src/integrations/webshooter/`; each was individually
verified by hand-applying the mutation, confirming no observable output
changes for any reachable input through the module's actual call surface,
then reverting:

1. **`api/client.ts:69`** — cache-key literal `'competitions'` mutated to
   `''`. Not observable: no other resource uses an empty cache key, so no
   collision can be constructed through the public `WebShooterClient` API.
2. **`stats/medals.ts:61`** (`betterMedal`, `>=` vs `>`) — `MEDAL_RANK` is a
   bijection between valor and rank, so an equal-rank comparison only ever
   happens when `a === b` (the same string); returning `a` or `b` is the
   same value either way.
3. **`stats/medals.ts:85`** (`??` vs `&&` in the tie branch) — reached only
   when `fixedValor === relativeValor` (same reasoning as #2), so
   `fixedResult` and `relativeResult` are either both null or the identical
   string; `??` and `&&` agree on both.
4. **`stats/pb.ts:70`, `:71`** (`>` vs `>=` for score/figureHits) — both
   guarded by an immediately-preceding `!==` check, so `>` and `>=` are
   identical within that branch by construction.
5. **`mapping.ts:80`** (`if (resultsType === null) return null;` forced to
   `if (false)`) — `RESULTS_TYPE_TO_PROGRAM[null]` still yields `undefined`,
   and the trailing `?? null` produces the same result; the guard exists
   for TypeScript's `NonNullable` index-signature requirement, not runtime
   behavior. Confirmed by hand-applying the mutation and rerunning
   `mapping.test.ts` (all pass).
6. **`mapping.ts:225`** (fixed-point loop `i<2` → `i<=2`) — a third
   iteration on an already-converged fixed point is idempotent (the sampled
   offset doesn't change once converged); manually confirmed against all
   DST-boundary test fixtures.
7. **`reconcile.ts:53`** (`toLowerCase()` → `toUpperCase()`) —
   `normalizeForSimilarity` is always applied symmetrically to both operands
   of a comparison, so consistently uppercasing vs. lowercasing both sides
   produces identical edit distances.
8. **`reconcile.ts:59`** (`new Array<number>(cols)` → `new Array(cols)`) —
   a TypeScript generic parameter, erased at runtime; the two forms compile
   to identical JavaScript.
9. **`reconcile.ts:62`** (`for (let j=0;j<cols;...)` → `j<=cols`, first-row
   init) and **`reconcile.ts:65`** (same bound in the main DP loop) — both
   write/read one column past what the final `distances[rows-1][cols-1]`
   read ever touches; the DP recurrence only references `j` and `j-1`,
   never `j+1`, so the extra column is dead output. Confirmed by
   hand-applying each mutation and rerunning `reconcile.test.ts` (37/38
   pass unaffected — the loop-bound mutant that _was_ observable,
   `i>=rows` on the first-column init, is killed by the added
   `'abcdefgh'`/`'a'` case).

None of these were accepted without first trying to kill them: #5, #6 were
manually mutated and reverted; #7–#9 were manually mutated and reverted with
the specific distinguishing tests already in place; #1–#4 were reasoned from
the code's own invariants (bijection, guard redundancy) and cross-checked
against the actual test list Stryker reported as "ran."

## Fixture approach

`api/fixtures.ts` provides synthetic builders (`fixtureCompetition`,
`fixtureResultRow`, `fixtureSignup`, `fixturePatrol`, …) with invented
names ("Testa Testsson"), card numbers ("99001"), club ("Exempel
Pistolklubb"), and competition ("Exempeltävlingen Precision C"). Field sets,
envelope nesting (the `{"competitions": {...}}` singular-vs-paginated
distinction, `results`/`results_finals`/`results_distinguish`,
`weaponclass.classname` patterns like `"C2"`/`"CD3"`/`"A Opt 1"`) were
learned by reading `~/.cache/webshooter/` (wscli's response cache) — shapes
only. No name, id, card number, or club from that cache appears anywhere in
this repo; verified by grep-free construction (every fixture value was typed
by hand from the spec, not copied). The live token in `~/.webshooter.rc` was
never read.

## VERIFY items (also listed in `webshooter-core-spec.md` §9)

1. `authUserSchema` — exact `authenticate/user` response shape unconfirmed.
2. HTTP retry backoff (3 attempts/500ms/×2) and cache TTL (15 min) — no
   published WebShooter SLA.
3. Pagination beyond page 1 for `/competitions` and `/signups` — not handled.
4. `mapping.ts` classname enumeration — pattern table is confident, not
   claimed complete (spec §A.8's own open question 3).
5. `mapStationResultsToSeries` — assumes `stations_id` restarts per section;
   offsets `position` accordingly.
6. Milsnabb 12-series PB cut and the "figure hits" tiebreak term — inherited
   unresolved from the v2 integration spec itself.
7. Two-point-slope YoY trend — inherited unresolved from the v2 spec
   (flagged there as possibly a mis-described regression).
8. Calendar description's optional `venue` field — an interpretation of the
   v2 spec's §C.2 wording, not a confirmed fact.
9. WebShooter SPA login endpoint (path/body/response shape) — not
   implemented, stub only, per PR #19's auth refinement.

## What was NOT done (out of scope per the task)

- No DB schema/migration (series `is_total_override` etc.) — later task.
- No `app/src/features/webshooter-import/` UI — later task.
- No `expo-calendar` wiring — `calendar.ts` returns plain data only.
- No live network calls anywhere — every test injects `fetchImpl`.
