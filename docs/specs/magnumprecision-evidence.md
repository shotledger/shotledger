# Magnumprecision (SHB Del G) — evidence report

> Old-coder EVIDENCE artifact for `feat/magnumprecision` (issue #83).
> Absolute path:
> `/home/jimisola/cloud/dev/clones/jimisola/github/shotledger/docs/specs/magnumprecision-evidence.md`
> Spec: `docs/specs/magnumprecision-spec.md` (committed at `8cf6dc3`, before
> any implementation file was written — later drift is a `git diff`).
>
> **Spec approval: not obtained (autonomous run).** Confidence is claimed
> accordingly: the gauntlet shows the implementation satisfies the spec, not
> that the spec is complete. Tier 2.
>
> **Independent verification: not performed.** Tier 2, so no apology is owed —
> it is recorded as a declared downgrade rather than implied.

## Source state

All numbers below come from runs executed after the last code edit (the MP14
test widening, which was the last change to any file under test).

## Spec behaviors → tests

| Scenario | Test                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| MP1      | `shared/src/disciplines/index.test.ts` — "MP1: the discipline is registered…"             |
| MP2      | same file — "MP2: declares exactly the nine magnum vapengrupper"                          |
| MP3      | same file — "MP3: the magnum groups become selectable on the firearm form"                |
| MP4      | same file — "MP4: the magnum groups follow the SPSF regulation switch"                    |
| MP5      | same file — "MP5: the program is freeform"                                                |
| MP6      | same file — "MP6: a freeform program pre-creates no series"                               |
| MP7      | same file — "MP7: magnumprecision has no klassindelning (G.2.1 p. 193)"                   |
| MP8      | same file — "MP8: reuses the precision target face rather than adding one"                |
| MP9      | `shared/src/scoring/standard-medal.test.ts` — "MP9: M1-M4 and M8 — silver 282, brons 274" |
| MP10     | same file — "MP10: M5 (frigrupp) — silver 294, brons 288"                                 |
| MP11     | same file — "MP11: M6, M7 and M9 — silver 270, brons 253"                                 |
| MP12     | same file — "MP12: any series count but six yields no threshold at all"                   |
| MP13     | same file — "MP13: a non-magnum weapon group on magnumprecision yields nothing"           |
| MP14     | same file — "MP14: the magnum table never leaks into another discipline"                  |
| MP15     | same file — "MP15: standardMedalForSession routes magnumprecision through the total"      |
| MP16     | the pre-existing B1–B12 suite, unchanged and green                                        |
| MP17/18  | `shared/src/scoring/badges.test.ts` — "MP17/MP18: magnumprecision earns no guldserie…"    |

Negative constraints:

| ID  | How it is held                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------ |
| N1  | `shared/src/target-scoring/targets.ts` is not in the diff; MP8 pins the reuse                          |
| N2  | `shared/src/disciplines/schema.ts` is not in the diff; `pnpm mutation:schema` still 17/17              |
| N3  | `shared/src/disciplines/groups.ts` is not in the diff                                                  |
| N4  | `goldSeriesThreshold`'s body is unchanged (`badges.ts` itself is not in the diff — only its test file) |
| N5  | full suite green, including every precision/milsnabb scenario                                          |
| N6  | manual updated in EN **and** SV in the same commit; all three docs gates run below                     |

## RED — each new test observed failing

- MP1–MP8: 8 failed, 60 passed in `shared/src/disciplines/index.test.ts`
  before the JSON files existed (`Error: Unknown discipline:
spsf-magnumprecision` / `expected undefined to be
'spsf-pistol-25m-precision'`).
- MP9–MP11, MP15: 4 failed before `MAGNUM_THRESHOLDS` existed.
- MP12, MP13, MP14, MP17, MP18 **passed immediately** — they pin
  regulatory absences that the code already honoured. Proven non-vacuous
  rather than assumed:
  - MP17/MP18: a throwaway mutant adding `'spsf-magnumprecision'` to
    `MARKE_DISCIPLINES` and `'spsf:M5' → 'C'` to the badge-group map made
    MP17 fail (`1 failed | 36 passed`); the file was restored from a copy and
    the suite returned to `37 passed`, `git diff` clean.
  - MP12/MP13/MP14: killed by Stryker mutants, below — MP14 in particular was
    widened after a real survivor.

## Gauntlet

| Layer                  | Command                                                         | Result                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite             | `pnpm check` (repo root)                                        | green: `133 files / 2282 tests` (vitest) + `35 suites / 390 tests` (jest)                                                                                                                                  |
| Types                  | in `pnpm check` (`tsc -b`, `tsc --noEmit -p app/tsconfig.json`) | 0 errors                                                                                                                                                                                                   |
| Lint + format          | in `pnpm check` (`eslint .`, `prettier --check .`)              | clean (4 docs files needed `prettier --write` first; rerun clean)                                                                                                                                          |
| i18n                   | in `pnpm check` (`scripts/i18n-check.mjs`)                      | `en.json: 1048 keys, sv.json: 1048 keys, 0 issues`                                                                                                                                                         |
| Licenses               | in `pnpm check`                                                 | `97 packages, invariants hold` (no dependency change)                                                                                                                                                      |
| Coverage               | `vitest run --coverage`                                         | **every changed file 100/100/100/100**: `disciplines/index.ts` 69 stmt / 26 br / 22 fn / 56 ln; `scoring/standard-medal.ts` 40/36/4/35; `scoring/badges.ts` 39/25/6/32. Global gate fails — baseline below |
| Mutation (source)      | `npx stryker run --mutate '<file>'`, per changed file           | `disciplines/index.ts` **95.41%** (102 killed, 2 timeout, 5 survived); `scoring/standard-medal.ts` **93.55%** (58 killed, 4 survived) — every survivor classified below                                    |
| Mutation (zod schemas) | `pnpm mutation:schema`                                          | **17/17 mutants killed**, exit 0                                                                                                                                                                           |
| Docs — build           | `mkdocs build --strict`                                         | built, 0 warnings                                                                                                                                                                                          |
| Docs — translation     | `node scripts/docs-translation-check.mjs`                       | `19 translated page(s) current, 0 not translated yet`                                                                                                                                                      |
| Docs — anchors         | `node scripts/docs-anchor-check.mjs`                            | `no dangling anchors`                                                                                                                                                                                      |

### Coverage baseline — a pre-existing, unrelated failure

`vitest run --coverage` exits nonzero on `Branches 99.75% (1652/1656)`. All
four missing branches are in `shared/src/timer/pcm.ts` (34/35) and
`shared/src/timer/shot-detector.ts` (155/158). **This branch touches no file
and no test under `shared/src/timer/`** (`git diff main --name-only | grep
timer` is empty), so those two files execute identically on `main`. Held at
zero NEW misses; fixing them belongs to whoever owns the timer work, not here.

### Mutation survivors, classified

`disciplines/index.ts` (5 survived, score 95.41 ≥ break 95):

- 3 × `StringLiteral` on the `` `Discipline ${discipline.id}` `` context strings
  passed to `resolveWeaponGroupIds` (lines 146, 190 and one more) — the string
  only ever reaches an `Error` message on a packaging bug that the shipped data
  cannot produce. Pre-existing, in code this change does not touch.
- `OptionalChaining` at line 225 (`structure.groups[0]?.`) — the schema's
  `.min(1)` makes index 0 always present, so the mutant is **equivalent**.
  Pre-existing.
- All pre-existing: none is in the lines this branch added.

`scoring/standard-medal.ts` (4 survived):

- Lines 134, 145 — `input.weaponGroup ?? ''` in the precision and milsnabb
  branches. **Pre-existing**, in code this change does not touch.
- Line 136 — `input.seriesCount > 10` → `>=` in the precision branch.
  **Pre-existing** (10 is a tabulated row, so both readings return the same
  thresholds at 10).
- Line 150 — `input.weaponGroup ?? ''` in the new magnum branch. **Equivalent**:
  no key of `MAGNUM_WEAPON_GROUP_TO_STD_GROUP` is `''` or Stryker's replacement
  string, so both lookups miss and the function returns `null` either way. It
  is the identical idiom to the two pre-existing survivors above, and killing it
  would need a test asserting nothing.

So the new code contributed exactly **one** survivor, and it is equivalent. The
file's standalone score of 93.55 is below the project's break threshold of 95
only because that threshold is applied to the whole `mutate` set in
`stryker.config.json` (89 files, 5307 mutants), never to one file.

### Layer run but not completed, and why

**`pnpm mutation` over the full `stryker.config.json` set was not used for the
numbers above.** That run instruments 89 source files and 5307 mutants —
Stryker's own estimate was ~1 h 20 m — over code this change does not touch.
Mutation was instead run **scoped to each changed source file**, which is the
constraint that matters here (the skill's "changed-line, not global" rule), and
both results are reported verbatim above with every survivor classified.
`pnpm mutation:schema` — the layer `ignoreStatic` would otherwise hide — was run
in full and is 17/17.

### Real execution

Not driven on device or web. The change adds no screen, component or
interaction: the discipline reaches the UI through pickers that already exist
and are covered by MP3, MP7 and the `showClassPicker` / `showGroupPicker`
expressions in `app/src/app/session/new.tsx`, which read exactly the two
functions tested here. Recorded as a gap rather than claimed.

### Suite health

Not run in randomized order — vitest's default here is file-parallel already,
and the suites touched are pure functions over frozen data with no clock,
filesystem or network. No flake observed across the six full-suite runs in this
session.

## Environment changes

None. No dependency added or removed, no system package, no schema, no
migration. `pnpm i` was run once in this worktree to populate its own
`node_modules`.
