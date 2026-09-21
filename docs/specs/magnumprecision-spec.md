# Magnumprecision (SHB Del G) — executable specification

> Old-coder SPEC artifact for `feat/magnumprecision` (issue #83).
> Absolute path:
> `/home/jimisola/cloud/dev/clones/jimisola/github/shotledger/docs/specs/magnumprecision-spec.md`
> Evidence report: `docs/specs/magnumprecision-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** Spec and implementation
> are written in the same session, so the correlation-breaking review the
> old-coder loop depends on did not happen. The spec is the artifact the
> maintainer reviews after the fact, and confidence is claimed accordingly.

Tier: **2**. A new discipline is data plus two small pure additions
(`shooterClassesForDiscipline`, `standardMedalPoints`). It cannot corrupt
stored rows — no schema change, no migration — but `shared/src/disciplines/`
and `shared/src/scoring/` are under CLAUDE.md's mandatory old-coder rule, so
the full loop runs.

## 0. Setup plan (what approving this authorizes)

- **Isolation:** branch `feat/magnumprecision` off `main`, inside this agent's
  pre-existing worktree (its own `pnpm i`'d `node_modules`).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths
  staged, `main` never touched, PR opened but never merged.
- **New dependencies: none.**
- **Files added:** `shared/src/disciplines/definitions/spsf-magnumprecision.json`,
  `shared/src/disciplines/programs/spsf-magnumprecision.json`, this spec, the
  evidence report.
- **Files modified:** `shared/src/disciplines/index.ts`,
  `shared/src/disciplines/index.test.ts`, `shared/src/scoring/standard-medal.ts`,
  `shared/src/scoring/standard-medal.test.ts`,
  `shared/src/scoring/badges.test.ts`, `app/src/i18n/{en,sv}.json`,
  `docs/reference/spsf-shb-2026.md`, `docs/implementation-plan.md`,
  `docs/manual/reference/weapon-group-and-class{,.sv}.md`.
- **No schema change, no migration, no new native module, no new target face.**

## 1. Domain facts — every value with its SHB 2026 citation

Nothing below is inferred from the 25 m precision discipline. Each line was
read out of the PDF (upplaga 21; printed page = PDF page).

| Fact                        | Value                                                                                                                                                           | Citation                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| What it is                  | bana, grovkalibriga vapen, pistoltavla, **50 m**                                                                                                                | G.1.1 p. 192                       |
| Tävlingsformer              | "Ej tillämpligt" — no round/final format of its own                                                                                                             | G.1.2 p. 192                       |
| Klassindelning              | **none** — "I magnumprecision tillämpas ingen klassindelning"                                                                                                   | G.2.1 p. 193                       |
| Who may shoot               | from the calendar year the shooter turns **18**; Pistolskyttekortet for anything above a föreningstävling                                                       | G.2.2 p. 193                       |
| Vapengrupper                | **M1–M9** (SA/DA .41–.44 Magnum, SA/DA .357, frigrupp, pistol, revolver ≤165 mm, .38 Spl/.45 class, service pistol)                                             | G.4.1–G.4.1.9 pp. 196–197          |
| SM vapengrupper             | M1–M7 only                                                                                                                                                      | C.3.6.2.3 p. 56                    |
| Omfattning                  | "i regel **minst sex (6) serier om fem (5) skott** vardera"                                                                                                     | G.6.1 p. 199                       |
| Shots per series            | **5**                                                                                                                                                           | G.6.4 p. 200                       |
| Time per series             | **5 min** (dispensation to 6 min possible at SM/landsdel/krets)                                                                                                 | G.6.5 p. 200, G.7.3 p. 206         |
| Förberedelsetid             | 3 min, no loading                                                                                                                                               | G.6.6.1 p. 200                     |
| Sighter (inskjutning)       | **one series of 5 provskott within 5 minutes**, before the competition                                                                                          | G.6.6.2 p. 200                     |
| Target face                 | **Pistoltavla 25 m precision** — the same face                                                                                                                  | G.7.1 p. 205                       |
| Ring diameters              | X 25 · 10 50 · 9 100 · 8 150 · 7 200 · 6 250 · 5 300 · 4 350 · 3 400 · 2 450 · 1 500 mm; black over 7–10 (200 mm); ring line 0.2–0.5 mm; min visible 550×550 mm | G.7.1 p. 205                       |
| Distance                    | **50 m** (the face is the 25 m one, shot at 50 m)                                                                                                               | G.7.2 p. 206                       |
| Scoring rule                | higher value as soon as the ring's outer edge is tangented                                                                                                      | G.6.10.1 p. 201                    |
| Ties                        | countback (X count, then last series backwards), then **särskjutning** — no final                                                                               | G.6.11.2.1 p. 204, G.6.11.3 p. 204 |
| Standardmedalj omfattning   | **6 serier om vardera 5 skott**                                                                                                                                 | C.5.1 p. 69                        |
| Standardmedalj grouping     | "Samtliga deltagare beräknas vapengruppsvis"                                                                                                                    | C.5.1.1.5 p. 70                    |
| Standardmedalj fixed points | **M1–M4, M8: silver 282 / brons 274 · M5: silver 294 / brons 288 · M6–M7, M9: silver 270 / brons 253**                                                          | C.5.1.2.4 p. 71                    |
| Pistolskyttemärket          | precision series at **25 m**, vapengrupp **A/B/C only** — no M row                                                                                              | Bilaga 1 mom 5.1.1.1 p. 452        |

Two consequences that are _derived from an absence_, and are called out here so
they are reviewable rather than buried:

1. **No märke ("guldserie") for magnumprecision.** Bilaga 1 mom 5.1.1.1 defines
   the märke precision series as 25 m against Pistoltavla 25 m precision under
   the F.8 rules, with rows for A, B and C. There is no M row and no 50 m
   variant, and the only magnum mention in the märke chapter is the
   _årtalsmärke_ substitution (Bilaga 1 mom 5.1.2.4 p. 454), which is a v2+
   concern. So `goldSeriesThreshold()` must stay `null` here — which it already
   is, twice over (non-precision discipline, and no badge row for M groups).
   This spec adds the regression test rather than the behaviour.
2. **`supportsFinal: false`.** Part G has no final: G.1.2 is "Ej tillämpligt",
   and a tie at a championship is resolved by särskjutning (G.6.11.3), which is
   out of v1.

### `VERIFY:` — what Part G does not say

- **`VERIFY:` What fixed standardmedalj threshold applies to a magnumprecision
  competition of more than six series.** C.5.1.2.4 prints one unlabelled
  silver/brons pair per vapengrupp with no series-count column, and — unlike
  precision's C.5.1.2.3 — states no scaling rule. C.5.1 p. 69 fixes the
  tävlingsomfattning at 6 series, so the table is read as the 6-series row and
  nothing else. **Implemented as: fixed thresholds apply at exactly 6 scored
  series, `null` otherwise.** Inventing precision's ÷10× rule here would be a
  guessed regulatory value, which hard rule 4 forbids.
- **`VERIFY:` The English name.** SHB has no English name for the discipline.
  Per CLAUDE.md rule 9's carve-out (a federation's own discipline name keeps
  its spelling), both locales get **"Magnumprecision"**. Flipping English to
  "Magnum Precision" is a one-line i18n change if the maintainer prefers it.

## 2. Behaviors

Named test list. IDs are used verbatim in the evidence mapping.

### `shared/src/disciplines` — registry (`index.test.ts`)

- **MP1** `getDiscipline('spsf-magnumprecision')` resolves, federation `SPSF`,
  `targetFace` `spsf-pistol-25m-precision`, `defaultSeriesLength` 5,
  `scoring` `rings`, `allowsDecimal` false.
- **MP2** `weaponGroupsForDiscipline('spsf-magnumprecision')` is exactly
  `spsf:M1 … spsf:M9`, in order, and contains no A/B/C/R group.
- **MP3** `selectableWeaponGroups()` now contains all nine M groups — the
  #82 mechanism, asserted rather than assumed.
- **MP4** `weaponGroupsForRegulations(['spsf'])` contains the M groups; with
  SPSF off it contains none of them.
- **MP5** `programsForDiscipline('spsf-magnumprecision')` is the one program:
  `shotsPerSeries` 5, `scoring` `integer`, `supportsFinal` false, and **no**
  `structure` (G.6.1 says _minst_ six series — freeform, like precision).
- **MP6** `buildProgramSkeleton()` of that program returns `[]`.
- **MP7** `shooterClassesForDiscipline('spsf-magnumprecision')` is `[]`
  (G.2.1), while `spsf-precision` and `spsf-milsnabb` keep the nine SPSF
  klasser — the negative half is the point.
- **MP8** (existing invariant, must survive) every discipline's `targetFace`
  resolves to a shipped target-face definition; magnumprecision reuses the
  precision face and adds no new one.

### `shared/src/scoring/standard-medal.ts`

- **MP9** M1/M2/M3/M4/M8 at 6 series: silver 282, brons 274. Boundary cases —
  282 → `silver`, 281 → `brons`, 274 → `brons`, 273 → `null`.
- **MP10** M5 at 6 series: silver 294, brons 288. 294 → `silver`, 293 →
  `brons`, 288 → `brons`, 287 → `null`.
- **MP11** M6/M7/M9 at 6 series: silver 270, brons 253. 270 → `silver`, 269 →
  `brons`, 253 → `brons`, 252 → `null`.
- **MP12** A series count other than 6 (5, 7, 10, 12) returns `NO_RESULT` —
  no thresholds invented for an untabulated count.
- **MP13** A non-M weapon group on magnumprecision (`spsf:C`, `null`) returns
  `NO_RESULT`.
- **MP14** An M weapon group on `spsf-precision` or `spsf-milsnabb` returns
  `NO_RESULT` — the magnum table must not leak into another discipline.
- **MP15** `standardMedalForSession` with `hasFinal: false` routes
  magnumprecision through the total (6 series, tenths ÷ 10).
- **MP16** (invariant) precision and milsnabb thresholds are unchanged.

### `shared/src/scoring/badges.ts`

- **MP17** `goldSeriesThreshold({ disciplineId: 'spsf-magnumprecision',
weaponGroup: 'spsf:M1'…'spsf:M9', seriesLength: 5 })` is `null` for every M
  group, at any age. Pre-existing behaviour, pinned as regression armor
  because the reason it is null is a regulatory fact (no M märke row), not an
  accident of the current discipline allow-list.
- **MP18** `badgeGroupForWeaponGroup('spsf:M5')` is `null`.

### Negative constraints (must NOT happen)

- **N1** No new target face in `shared/src/target-scoring/targets.ts`
  (G.7.1 is the F.7.1 face, digit for digit).
- **N2** No schema change to `disciplineSchema` / `programSchema`.
- **N3** No change to `shared/src/disciplines/groups.ts` — M1–M9 already exist
  there.
- **N4** No change to `goldSeriesThreshold`'s implementation.
- **N5** `spsf-precision` and `spsf-milsnabb` behaviour unchanged everywhere
  (covered by the existing suites staying green).
- **N6** `docs/manual/` updated in the same PR, EN **and** SV, since the app
  now offers a discipline and nine weapon groups it previously refused.

## 3. Gauntlet

`pnpm check` · `pnpm coverage` (100% threshold on
`shared/src/{scoring,disciplines}`) · `pnpm mutation` + `pnpm mutation:schema`
· `mkdocs build --strict` · `node scripts/docs-translation-check.mjs` ·
`node scripts/docs-anchor-check.mjs`. Results in the evidence report.
