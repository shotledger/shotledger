# Fältskjutning scoring model — executable spec

**Spec approval: not obtained (autonomous run).** This document is the
artifact to review after the fact, per `.claude/skills/old-coder/SKILL.md`.
Written before implementation; append-only during the task.

Issue: #315, step 3 (implementation), after #327 landed the SHB Del D facts.

## Scope

The **scoring model and the discipline definition** — the layer everything
else about fältskjutning depends on. Deliberately not the whole feature; see
"Out of scope" for what is left, and why each piece is left.

Three code areas:

1. `shared/src/disciplines/schema.ts` — a second scoring model, `hits`,
   alongside `rings`, and `targetFace` becoming a rings-only field.
2. `shared/src/disciplines/definitions/spsf-falt.json` — the fält discipline,
   registered but **not offered** in the new-session picker yet (no station
   entry UI exists).
3. `shared/src/scoring/falt.ts` — new pure module: a fält round's result, its
   two result modes, and SHB's särskiljning (countback) order.

Both 1 and 3 are under the repo's mandatory `old-coder` rule
(`shared/scoring/`, `shared/disciplines/`).

## Domain facts this rests on

Every value below is already verified with a citation in
`docs/reference/spsf-shb-2026.md` (section "Fältskjutning"); nothing here is
inferred, and no regulatory value is invented.

1. A fält round is **6–10 skjutstationer, exactly six shots at each**
   (D.6.1 p. 88; D.6.4 p. 91 "skall antalet skott vara sex (6)"). The station
   count is a property of the competition, never of the discipline.
2. **Nothing is scored per shot.** A station yields hits (0–6), figures hit,
   and — only where the arrangör designated a ringad figur / poängmål — points
   (D.6.10.1–2 p. 93).
3. **Vanlig fält**: the result is "antal träff i antal figurer" — two numbers.
   **Poängfält**: one sum, where _every hit gives one point and every hit
   figure gives one point_ (D.6.11 p. 95). The poängmål's ring points are a
   separate, tie-break-only quantity; they are **not** part of the poängfält
   sum.
4. **Särskiljning, vanlig fält** (D.6.11.2.1.1 p. 95), on equal hits:
   (a) most figures hit; (b) highest points in the ringade figurer the
   förutsättningar designate for särskiljning; (c) most hits on the last
   station, then the next-to-last, and so on.
5. **Särskiljning, poängfält** (D.6.11.2.1.2 p. 96), on equal points:
   (a) highest points in the designated ringed figure; (b) highest points
   (hits + figures) on the last station, then the next-to-last, and so on.
6. Shooters who still cannot be separated **share the same placement**
   (D.6.11.2.1.1–2); särskjutning applies to the medal places.
7. **Fält has no provskott at all** (D.6.6 p. 91). The sighter rules do not
   generalise here.
8. **Standardmedalj in fält is placement-only** (C.5.1.2 / C.5.1.2.1 p. 70) —
   there is no fixed-points table. The app must never compute one.
9. **Vapengrupper in fält are A, A optisk, B, C and R** (D.4 pp. 82–86;
   C.5.1.1.2 p. 69).
10. A fält figure has **no single target face** — Del D ships a whole figure
    catalogue (D.7.1 pp. 99–109), and the arrangör picks per station.
11. **Magnumfält is a separate discipline** (Del E from p. 127), not a fält
    variant. Out of scope here.

## Out of scope, and why

- **Persistence** (the five per-station columns on `series`, the Drizzle
  migration) and **station entry UI**. A migration adding columns nothing
  writes, or a screen with no model behind it, is half a feature either way.
  The pure model lands first, as the issue's sequencing asks.
- **Särskjutning (shoot-off) stations.** Open `VERIFY:` — whether a
  särskjutning's result enters the recorded score or only the placement is not
  answerable from SHB upplaga 21 (issue #315, open question 4). Modelling it
  either way would encode a guess into scoring, which hard rule 4 forbids.
- **A scratched station.** Open `VERIFY:` (question 7) — SHB Del D has no such
  concept; D.6.9 p. 92 prescribes omskjutning, not annulment.
- **`pointsMax` / poängmål ring values.** Open `VERIFY:` (question 1) — SHB
  names poängmål throughout Del D but defines no ring scheme. Points are
  therefore a number the shooter **records** from the station's
  förutsättningar, never one the app derives.
- **Fältskyttemärket** (Bilaga 1 mom 5.7.1) — per competition, thresholds by
  vapengrupp and station count, with open question 10 (A optisk) unanswered.
- **WebShooter fält import**, CSV/JSON export, statistics and personal bests
  for hits sessions — all consumers of this model, none buildable before it.
- **`OptR`** as a vapengrupp — open `VERIFY:` (question 9); SHB defines no
  optics variant of R.

## Setup plan

- **Isolation:** branch `feat/falt-scoring-model` in an agent worktree; `pnpm i`
  run there so the gauntlet runs in the tree that produced the diff.
- **Files added**, by path:
  - `shared/src/scoring/falt.ts`, `shared/src/scoring/falt.test.ts`
  - `shared/src/disciplines/definitions/spsf-falt.json`
  - `docs/specs/falt-scoring-spec.md` (this file),
    `docs/specs/falt-scoring-evidence.md`
  - `docs/adr/0016-hits-scoring-model-for-falt.md`
- **Files changed:** `shared/src/disciplines/schema.ts`,
  `shared/src/disciplines/index.ts`, `shared/src/disciplines/index.test.ts`,
  `shared/src/shotlog/tags.ts`, `app/src/app/session/new.tsx`,
  `app/src/app/dev/shotlog-import.tsx`, `docs/implementation-plan.md`,
  `docs/reference/spsf-shb-2026.md` (pointer only).
- **New dependencies:** none.
- **Git:** DCO-signed commits (`git commit -s`), spec committed first, then
  implementation; no session trailers (repo CLAUDE.md).
- **Gauntlet composition:** `pnpm check`, `pnpm coverage` (100 % threshold
  already covers `shared/src/scoring/**` and `shared/src/disciplines/**`),
  `pnpm mutation` (Stryker already globs `shared/src/scoring/*.ts`).

## Calibration

**Tier 3.** Scoring is the app's high-stakes domain and the maintainer does not
read this code. Failure model for this specific change:

| Failure mode                                                                                        | Layer that catches it                                                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A wrong tie-break order silently mis-ranks a competition                                            | F6–F17 scenarios, one per SHB step, plus a property that the comparator is a total preorder |
| Poängfält's sum quietly includes poängmål ring points                                               | F3, F12 (distinct quantities asserted separately)                                           |
| A hits discipline leaks into a rings code path (ring keypad, ShotLog import, märke, standardmedalj) | N1–N3 regression tests                                                                      |
| An invalid station (7 hits, figures > hits) scores rather than failing loudly                       | F5 — fails closed, throws                                                                   |
| Existing rings disciplines change shape                                                             | N4 + the whole existing suite                                                               |

## Behaviors — `shared/src/scoring/falt.ts`

`FaltStation = { hits, figuresHit, points }`, `points: number | null`
(null = this station had no poängmål).

- **F1** `faltResult([])` → `{ stationCount: 0, hits: 0, figuresHit: 0,
ringedFigurePoints: null }`.
- **F2** `faltResult` sums hits, figures and station count:
  `[{6,2,null},{4,3,null},{0,0,null}]` → `{ stationCount: 3, hits: 10,
figuresHit: 5, ringedFigurePoints: null }`.
- **F3** `ringedFigurePoints` is the sum of the stations that carry points, and
  stays `null` when none does: `[{6,2,13},{4,3,null}]` → `13`.
- **F4** `poangfaltPoints(result)` = hits + figuresHit (D.6.11 p. 95):
  hits 10, figures 5 → 15. It never includes `ringedFigurePoints`:
  the same stations with `points: 13` still give 15.
- **F5** Validation fails closed — `faltResult` throws `RangeError` for:
  `hits` < 0, `hits` > 6, `figuresHit` < 0, `figuresHit > hits`,
  `hits > 0 && figuresHit === 0`, negative `points`, and any non-integer among
  the three.
- **F6** `compareFaltResults(a, b, 'falt')` — more hits ranks first
  (negative when `a` ranks ahead): 40 hits vs 38 hits → `< 0`.
- **F7** Equal hits → more figures hit ranks first (step a).
- **F8** Equal hits and figures → higher `ringedFigurePoints` ranks first
  (step b); a `null` counts as 0, so a station-less-poängmål round does not
  jump ahead of one that scored points.
- **F9** Equal hits, figures and points → countback on the **last station's
  hits**, then the next-to-last, and so on (step c).
- **F10** Identical on every term → `0` (shared placement, D.6.11.2.1.1). The
  function never falls through to särskjutning; that is out of scope.
- **F11** `'poangfalt'` mode ranks on hits + figuresHit first
  (D.6.11.2.1.2 p. 96).
- **F12** Poängfält tie → higher `ringedFigurePoints` (step a).
- **F13** Poängfält tie after points → countback on the last station's
  **hits + figures**, then the next-to-last (step b) — a different quantity
  from F9's.
- **F14** The two modes can order the same pair differently: 24 hits in 8
  figures (32) vs 25 hits in 6 figures (31) — `'falt'` puts the 25-hit round
  first, `'poangfalt'` the 24-hit one.
- **F15** Countback over rounds of different station counts aligns from the
  **last** station and stops when the shorter round runs out, returning `0`
  rather than ranking on a station the other round does not have.
- **F16** `[...rounds].sort(byFalt('falt'))` puts the best round first
  (integration over F6–F10).
- **F17 (property, fast-check)** For random valid rounds, `compareFaltResults`
  is antisymmetric (`sign(cmp(a,b)) === -sign(cmp(b,a))`) and reflexive
  (`cmp(a,a) === 0`) in both modes.

## Behaviors — discipline definition and schema

- **D1** `disciplineSchema` accepts `scoring: 'hits'`; `targetFace` is optional.
- **D2** A `rings` discipline **without** `targetFace` is rejected (every
  shipped rings definition keeps one).
- **D3** A `hits` discipline **with** a `targetFace` is rejected — fält has a
  figure catalogue, not one face (D.7.1).
- **D4** A `hits` discipline with `allowsDecimal: true` is rejected — there is
  no decimal ring value to allow.
- **D5** `spsf-falt` parses and is registered: federation SPSF,
  `defaultSeriesLength: 6` (D.6.4), `scoring: 'hits'`, `allowsDecimal: false`,
  weapon groups exactly `A, A-opt, B, C, R` in that order (D.4; C.5.1.1.2),
  name `{ sv: 'Fältskjutning', en: 'Fältskjutning' }` — hard rule 9's carve-out
  names this discipline explicitly: a federation's own name keeps its spelling,
  because inventing an English one would misname the event.
- **D6** `spsf-falt` ships **no program**: a program's `shotsPerSeries` /
  `structure` describe a ring course, and the station count is the
  competition's, not the discipline's (§6.3 freeform rule, ADR 0002).
- **D7** `ringScoringDisciplines(list)` returns the `rings` members of `list`
  in order, defaulting to the full registry.

## Negative constraints (must survive)

- **N1** The new-session picker offers exactly what it offered before: for each
  regulation, `ringScoringDisciplines(disciplinesForRegulations([id]))` equals
  the pre-change `disciplinesForRegulations([id])`. Fält is registered but not
  enterable until a station entry UI exists (#315 follow-up).
- **N2** `standardMedalForSession` / `standardMedalPoints` return no grade for
  `spsf-falt` at any score (C.5.1.2.1 — placement only).
- **N3** `goldSeries`/märke logic yields nothing for `spsf-falt`
  (fältskyttemärket is a separate, per-competition märke — Bilaga 1 mom 5.7.1).
- **N4** Every existing shipped discipline parses unchanged, `targetFace`
  included, and the ShotLog tag vocabulary keeps mapping only ring
  disciplines — a ShotLog import cannot produce a fält session.
- **N5** No new dependency; `pnpm licenses:check` unchanged.
- **N6** No UI string and no user-visible behavior changes, so `docs/manual/`
  gets no page in this PR: nothing a user can see or do differs yet. The
  manual page lands with the entry UI, in that PR.
