# Fältskjutning scoring model — evidence report

Spec: [`docs/specs/falt-scoring-spec.md`](falt-scoring-spec.md) ·
ADR: ADR 0016 ·
Issue: #315 · Tier 3.

**Spec approval: not obtained (autonomous run).** Nobody outside this task
reviewed the spec before the code existed, so the correlation-breaking review
never happened. Claim confidence accordingly: the layers below show the code
satisfies the spec, not that the spec is complete.

**Independent verification: not performed** (declared downgrade, per the
old-coder protocol).

Source state: branch `feat/falt-scoring-model`, rebased on `origin/main`
(`bea8f09`). Toolchain as recorded in the lockfile: node v24.12.0,
pnpm 12.5.0, vitest 5.0.1, Stryker 10.0.0, fast-check 4.10.1, reqstool
0.11.1.dev29. Every command below is a persisted repo script; one entry point
reruns them all: `pnpm gauntlet`.

## Baseline (pre-existing failures, held at zero new)

Measured on `origin/main` itself, in this same worktree, before the change:

| Layer           | `origin/main`                          | This branch                            |
| --------------- | -------------------------------------- | -------------------------------------- |
| `pnpm coverage` | FAIL — branches 99.75 % (1642/1646)    | FAIL — branches 99.76 % (1696/1700)    |
| `pnpm mutation` | FAIL — score 94.79, break threshold 95 | FAIL — score 94.94, break threshold 95 |

Both failures are pre-existing and live in `shared/src/timer/` —
`shot-detector.ts` (4 uncovered branches, mutation 80.48 %) and `pcm.ts`
(1 uncovered branch), from the timer work merged in #376. **This change touches
neither file**, and both global numbers moved the right way. Fixing them is
scope creep and is surfaced here rather than done quietly.

## Scenario → test mapping

Every scenario in the spec, and the test that holds it up. All in
`shared/src/scoring/falt.test.ts` unless stated.

| Spec      | Test                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1–F3     | `F1: an empty round…`, `F2: sums hits…`, `F3: ringedFigurePoints sums only…`                                                                                                    |
| F4        | `F4: poängfält points are hits + figures, never the poängmål ring points`                                                                                                       |
| F5        | `F5: an impossible station throws, naming what is wrong with it`, `F5: the legal extremes are accepted`                                                                         |
| F6–F10    | `F6…` `F7…` `F8…` `F9…` `F10…` (one per SHB särskiljning step)                                                                                                                  |
| F11       | `F11: ranks on hits + figures`, `F11: the points sum decides even when the last station says otherwise`                                                                         |
| F12–F13   | `F12: on equal points, the ringed figure decides`, `F13: then the last station on hits + figures…`                                                                              |
| F14       | `F14: 24 hits in 8 figures loses on hits and wins on points`                                                                                                                    |
| F15       | `F15: the countback reaches the oldest station both rounds shot`, `F15: a countback stops where the shorter round runs out`                                                     |
| F16       | `F16: byFalt sorts best first`                                                                                                                                                  |
| F17       | `F17: the comparator is reflexive and antisymmetric` (fast-check property)                                                                                                      |
| D1–D7, N1 | `shared/src/disciplines/index.test.ts` → `fältskjutning: a hits discipline (issue #315, spec D1-D7 / N1)`                                                                       |
| N2        | `shared/src/scoring/standard-medal.test.ts` → `N2 (#315): fält never earns a computed standardmedalj, at any score`                                                             |
| N3        | `shared/src/scoring/badges.test.ts` → `N3 (#315): fält earns no guldserie…`                                                                                                     |
| N4        | `shared/src/shotlog/tags.test.ts` → `N4 (#315): a fält tag is not a discipline…`; every shipped discipline still parses via `G1`/`G4`                                           |
| N5        | `pnpm licenses:check` — 97 packages, unchanged; no dependency added                                                                                                             |
| N6        | No i18n key and no UI string changed (`pnpm i18n:check`: 1046/1046 keys, 0 issues); the discipline is registered but not offered, so `docs/manual/` has nothing to describe yet |

**Traceability**: the SHB särskiljning order is also recorded as requirement
`SCORE_004` with `SVC_SCORE_004`, annotated on `compareFaltResults` and on a
top-level test (ADR 0015). `pnpm reqstool:status`: **11/11 complete, 0
incomplete, PASS**.

## RED evidence

- The whole `falt.test.ts` suite was run against a stub that threw
  `not implemented`: **18 failed / 18**, each on behavior, not on import.
- `N4` was observed failing once `spsf-falt` joined the registry (the ShotLog
  tag vocabulary matched it) and passing once `matchDiscipline` was scoped to
  ring disciplines.
- `N2`, `N3` passed on first run (pre-existing behavior kept as regression
  armor), so each was proved non-vacuous with a throwaway mutant — see below.

## Negative controls (throwaway mutants, restored after)

| Defence                       | Mutant                                            | Result                   |
| ----------------------------- | ------------------------------------------------- | ------------------------ |
| N2 — fält has no medal table  | `thresholdsFor` treats `spsf-falt` like precision | N2 fails (1 failed / 19) |
| N2 — likewise via milsnabb    | `thresholdsFor` treats `spsf-falt` like milsnabb  | N2 fails (1 failed / 19) |
| N3 — fält earns no guldserie  | `spsf-falt` added to `MARKE_DISCIPLINES`          | N3 fails (1 failed / 37) |
| N4 — ring-only tag vocabulary | `matchDiscipline` iterates `DISCIPLINES` again    | N4 fails (1 failed / 38) |

The first version of the N2 test used a series count no table covers, so it
survived its own control; it now uses counts and scores that clear precision's
and milsnabb's thresholds, and both controls kill it.

`scripts/mutate-schema.mjs` is itself fail-closed: a mutant whose search text
is not found is a hard error. It caught this change — the old mutant list still
looked for `z.literal('rings')` — and was updated rather than silenced.

## Gauntlet, final run (after the last code edit)

| Layer                              | Command                                                                | Result                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite (shared/backend/app-db) | `pnpm check` → `vitest run`                                            | **2307 passed / 2307**, 0 failed                                                                                                                                                                      |
| App suite                          | `pnpm check` → `jest`                                                  | **391 passed / 391**, 35 suites                                                                                                                                                                       |
| Types                              | `pnpm typecheck`, `typecheck:app`                                      | clean, 0 errors                                                                                                                                                                                       |
| Lint + format                      | `eslint .`, `prettier --check .`                                       | clean                                                                                                                                                                                                 |
| i18n / licenses / export schema    | `pnpm i18n:check` etc.                                                 | 1046/1046 keys 0 issues · 97 packages · schemas match                                                                                                                                                 |
| Coverage, changed files            | `pnpm coverage`                                                        | `scoring/falt.ts`, `disciplines/schema.ts`, `disciplines/index.ts`, `shotlog/tags.ts` — **100 % statements/branches/functions/lines** each                                                            |
| Coverage, global threshold         | `pnpm coverage`                                                        | FAIL at 99.76 % branches — **baseline**, `shared/src/timer/` only                                                                                                                                     |
| Mutation, changed files            | `pnpm mutation`                                                        | `falt.ts` **113/113 killed (100 %)**, `schema.ts` **41/41 (100 %)**, `tags.ts` **93/93 (100 %)**; `disciplines/index.ts` 95.61 %, its 5 survivors all on pre-existing lines (136, 153, 162, 206, 233) |
| Mutation, global threshold         | `pnpm mutation`                                                        | FAIL at 94.94 vs 95 — **baseline** (was 94.79 on `main`)                                                                                                                                              |
| Mutation, on-disk zod schemas      | `pnpm mutation:schema`                                                 | **21/21 killed**, including 4 new ones for the `hits` refinements                                                                                                                                     |
| Mutation, webshooter schemas       | `pnpm mutation:webshooter-schema`                                      | **11/11 killed**                                                                                                                                                                                      |
| Property-based                     | fast-check, in `falt.test.ts`                                          | F17: 100 runs, antisymmetry + reflexivity, both modes                                                                                                                                                 |
| Requirement traceability           | `pnpm reqstool:status`                                                 | **11/11 complete, PASS**                                                                                                                                                                              |
| Docs gates (not in `pnpm check`)   | `mkdocs build --strict`, `docs-translation-check`, `docs-anchor-check` | built in 0.58 s · 19 translated pages current · no dangling anchors                                                                                                                                   |
| Supply chain                       | —                                                                      | no dependency added or removed; the diff adds no network, filesystem, subprocess or env access                                                                                                        |
| Real execution                     | —                                                                      | **skipped, deliberately**: there is no UI path to a fält session yet, by design. The module's only consumers today are its tests                                                                      |

Mutation survivors that were fixed rather than excused: 7 in `falt.ts` (three
error-message string literals, a `hits < 0` guard, the countback's `<=` bound,
and the poängfält primary comparison, which two scenarios could not
distinguish from the countback) and 10 in `schema.ts` (issue `code`, `path` and
`message` literals). Each was killed by a stronger assertion, never by removing
the mutant.

## Known limits

- The model is pure; nothing persists a station yet, so nothing here proves a
  fält session round-trips through SQLite, sync, export or the PDF log. Those
  land with the entry UI.
- Särskjutning, a scratched station and a poängmål's ring values are **not
  modelled**, because SHB upplaga 21 does not answer them (#315, open
  questions 1, 4, 7). A comparator that returns 0 means SHB cannot separate the
  two rounds — it does not claim they placed equally at a mästerskap.
- Rounds of different station counts are comparable at all only because the
  countback aligns from the last station (F15). SHB does not contemplate the
  case, since a class shoots one course; the behavior is defined so that
  ranking never reads a station one round did not shoot.
- `F17` proves the comparator is antisymmetric and reflexive, not transitive.
  A countback over unequal lengths is not obviously transitive, and no
  consumer sorts mixed-length rounds today.
