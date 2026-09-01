# M3 scoring — executable specification

> Old-coder SPEC artifact for milestone M3 (score entry).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/m3-scoring-spec.md`
> Evidence report: `docs/specs/m3-scoring-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** The maintainer did not
> review this spec before implementation, so the correlation-breaking review
> the old-coder loop depends on did not happen. Confidence claims in the
> evidence report are bounded accordingly. This document is the artifact the
> maintainer reviews after the fact.

Tier: **3** (public-facing scoring math; a wrong total is silently wrong data
in a logbook that feeds märke/standardmedalj/compliance decisions later).
Scope of the old-coder loop: everything under `shared/src/` — the keypad state
machine, märke thresholds, totals/result model, and the discipline/program
data layer. App UI (`app/src/`) is routine UI work per CLAUDE.md and gets
normal tests plus the Maestro flow, not this loop.

## 0. Setup plan (what approving this authorizes)

- **Isolation:** a branch, `feat/m3-score-entry`, based on `feat/m2-shell`.
  No worktree: the gauntlet needs the repo's installed `node_modules` and a
  fresh worktree would not have them (see old-coder "Setup" trap).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths
  staged, branch pushed, no PR opened, `main` never touched.
- **New runtime dependency:** `zod` in `shared/` — required by §6.2/§6.3 of
  the implementation plan ("validated by zod schema `disciplineSchema`") and
  already fixed in §2's library table. No other runtime dependency in
  `shared/`.
- **New app dependency:** `expo-image-picker` — §4 M3 names it explicitly
  ("Attach photo to series (expo-image-picker; camera or library)"). It is
  part of the Expo SDK family that §2 already commits to.
- **New dev tooling:** `@vitest/coverage-v8` (coverage gauntlet layer, must
  exit nonzero on threshold miss), `fast-check` (the Tier-3 property layer,
  §3.8/§5 T8), and `@stryker-mutator/core` +
  `@stryker-mutator/vitest-runner` (mutation layer). If Stryker cannot be made
  to run in this workspace within a reasonable budget, the mutation layer is
  recorded in EVIDENCE as _skipped with reason_ and replaced by a persisted,
  fail-closed manual mutation runner — never silently omitted.
- **Files the gauntlet adds, by path:** `vitest.config.ts` (coverage config),
  `stryker.config.json` (or `scripts/mutate-m3.mjs` for the fallback),
  `docs/specs/m3-scoring-spec.md`, `docs/specs/m3-scoring-evidence.md`.

## 1. Modules under specification

| Module                                    | Responsibility                                           |
| ----------------------------------------- | -------------------------------------------------------- |
| `shared/src/scoring/entry.ts`             | keypad state machine (both scoring modes, edit flows)    |
| `shared/src/scoring/marke.ts`             | pistolskyttemärke per-series thresholds ("guldserie")    |
| `shared/src/scoring/totals.ts` (extended) | series totals, X counts, beforeFinal/final/total results |
| `shared/src/disciplines/schema.ts`        | zod `disciplineSchema`, `programSchema`                  |
| `shared/src/disciplines/index.ts`         | validated registry + lookups + program skeleton + naming |
| `shared/src/disciplines/groups.ts`        | federation-scoped vapengrupper, per-discipline validity  |
| `shared/src/disciplines/classes.ts`       | federation-scoped klasser, display formatting            |

## 2. Domain invariants that must survive (negative constraints)

Each is mapped in EVIDENCE to a test, a gauntlet layer, or a
skipped-with-reason line.

- **N1** Sighter (`is_sighter`) series contribute to no score and no score
  statistic; they still count as shots (volume). (§6.3, skill rule 2)
- **N2** At most one sighter per section (main / final). Already enforced in
  `app/src/db/queries/series.ts::addSeries`; M3 must not weaken it, and the UI
  must disable the toggle once used.
- **N3** `value_tenths` is the single storage for both modes, range 0–109
  inclusive; all sums are integer arithmetic (no float drift).
- **N4** Vapengrupp and klass are orthogonal fields, never one string.
- **N5** Mästerskap is a flag on a level, never a level.
- **N6** When final series exist: `total = beforeFinal + finalScore`.
- **N7** All 62 pre-existing vitest tests and the 1 jest test keep passing;
  no existing public signature in `shared/src/index.ts` changes meaning
  (`sumValueTenths`, `tenthsToScore` keep their exact behaviour).
- **N8** No hard-coded UI strings: every string added under `app/src/` goes
  through i18n with real Swedish and English.
- **N9** `shared/` stays free of React Native imports.

## 3. `shared/src/scoring/entry.ts` — keypad state machine

### 3.1 Types

```ts
type ScoringMode = 'integer' | 'decimal';
type KeypadKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'X' | '(X)' | 'backspace';

interface EntryShot {
  valueTenths: number; // 0–109
  isInnerTen: boolean; // X
  isInnerTenDecimal: boolean; // (X) — VERIFY, see 3.5
}

interface KeypadState {
  mode: ScoringMode;
  seriesLength: number; // >= 1
  shots: readonly (EntryShot | null)[]; // length === seriesLength
  cursor: number; // 0..seriesLength (=== length ⇒ series full)
  pending: PendingRing | null; // decimal mode only
  innerTenDecimalEnabled: boolean; // gates the '(X)' key — VERIFY
}
```

### 3.2 Public API

- `createKeypadState(options): KeypadState`
- `pressKey(state, key): KeypadState` — pure, returns a new state
- `selectShot(state, index): KeypadState` — edit: re-select a chip
- `visibleKeys(state): readonly KeypadKey[]` — what the UI renders
- `seriesTotalTenths(state): number` — running total
- `isSeriesComplete(state): boolean`
- `enteredShots(state): readonly EntryShot[]` — filled chips, in order, for persistence

### 3.3 Scenarios — integer mode

| #   | Given                          | When          | Then                                                   |
| --- | ------------------------------ | ------------- | ------------------------------------------------------ |
| I1  | empty 5-shot series            | press `9`     | shots[0] = {90, false, false}; cursor 1; total 90      |
| I2  | empty series                   | press `0`     | shots[0] = {0, false, false} (miss); cursor 1; total 0 |
| I3  | empty series                   | press `X`     | shots[0] = {100, **true**, false}; cursor 1; total 100 |
| I4  | empty series                   | press `(X)`   | state unchanged — `(X)` is not a key in integer mode   |
| I5  | 5-shot series, keys 9,10,8,7,X | —             | total 440 tenths (44.0), 1 inner ten, complete         |
| I6  | full 5-shot series             | press `7`     | state unchanged (series full, cursor === seriesLength) |
| I7  | any state                      | `visibleKeys` | `1..9,0,X,backspace` — no `(X)`                        |

### 3.4 Scenarios — decimal mode

Decimal entry is **two taps**: a ring tap, then a tenth tap.

| #   | Given                   | When                | Then                                                          |
| --- | ----------------------- | ------------------- | ------------------------------------------------------------- |
| D1  | empty 10-shot series    | `1` then `0`        | shots[0].valueTenths = 10 (1.0); cursor 1                     |
| D2  | empty series            | `9` then `7`        | 97 (9.7)                                                      |
| D3  | empty series            | `0` then `0`        | 0 (a miss)                                                    |
| D4  | empty series            | `X` then `9`        | 109, isInnerTen true (the plan's "X ⇒ 10.9 + is_inner_ten")   |
| D5  | empty series            | `X` then `3`        | 103, isInnerTen true (user's choice is honoured, not clamped) |
| D6  | flag on, empty series   | `(X)` then `9`      | 109, isInnerTenDecimal true                                   |
| D7  | flag off                | press `(X)`         | state unchanged; `(X)` not in `visibleKeys`                   |
| D8  | pending ring set        | press `X`/`(X)`     | ignored — the second tap must be a digit                      |
| D9  | pending ring set        | `backspace`         | pending cleared; no shot written; cursor unchanged            |
| D10 | mid-entry (pending set) | `seriesTotalTenths` | counts only completed shots — a half-entered shot adds 0      |
| D11 | any state, flag on      | `visibleKeys`       | `1..9,0,X,(X),backspace`                                      |

**Ring semantics (decimal):** `0`–`9` are rings 0–9; `X` is ring 10 and marks
`isInnerTen`; `(X)` is ring 10 and marks `isInnerTenDecimal`. `value_tenths =
ring × 10 + tenth`, so the range is 0–109 exactly as §3 of the plan requires.

### 3.5 Open VERIFY items (carried into the code)

- **V1 — `(X)` semantics.** The implementation plan itself marks
  `is_inner_ten_decimal` / `(X)` as `VERIFY: exact SPSF/ISSF meaning`. It is
  implemented behind the clearly named flag `innerTenDecimalEnabled`,
  **default `false`**, with the plan's stated interpretation (a decimal-mode
  inner ten distinct from `X`). No UI path enables it in M3, so no data is
  written with the flag until the maintainer confirms the meaning.
- **V2 — the "10" key in decimal mode.** §4 M3 writes the decimal example as
  `"10" then "9" ⇒ 10.9` while the key list is `1–9, 0, X, (X)`. There is no
  free `10` key: `0` is needed for ring 0 (a decimal miss, D3). This spec
  therefore assigns ring 10 to `X`, which also satisfies the plan's other two
  decimal statements (D4, D6) exactly. Recorded as an interpretation for the
  maintainer to confirm.
- **V3 — A-family märke mapping.** See §4.

### 3.6 Editing and backspace

| #   | Given                                   | When            | Then                                                                       |
| --- | --------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| E1  | 3 of 5 filled                           | `selectShot(1)` | cursor 1; pending cleared; shots unchanged                                 |
| E2  | after E1                                | press `5`       | shots[1] overwritten with 50; cursor jumps to the **first empty chip** (3) |
| E3  | full series, `selectShot(0)`, press `8` | —               | shots[0] = 80; cursor === seriesLength (no empty chip remains)             |
| E4  | 3 of 5 filled, cursor 3 (empty)         | `backspace`     | shots[2] cleared; cursor 2                                                 |
| E5  | cursor on a filled chip (after E1)      | `backspace`     | that chip is cleared; cursor stays on it                                   |
| E6  | empty series, cursor 0                  | `backspace`     | state unchanged                                                            |
| E7  | `selectShot(-1)` / `selectShot(len)`    | —               | throws `RangeError`                                                        |
| E8  | any completed entry                     | —               | invariant: cursor === index of first empty chip, or `seriesLength` if full |

### 3.7 Construction and errors

| #   | Given                                    | Then                                                       |
| --- | ---------------------------------------- | ---------------------------------------------------------- |
| C1  | `createKeypadState({seriesLength: 0})`   | throws `RangeError`                                        |
| C2  | `createKeypadState({seriesLength: 2.5})` | throws `RangeError` (must be a positive integer)           |
| C3  | `createKeypadState({shots: [...]})`      | seeds an existing series for editing; cursor = first empty |
| C4  | seeded shots longer than `seriesLength`  | throws `RangeError`                                        |
| C5  | seeded shot out of 0–109                 | throws `RangeError`                                        |
| C6  | any `pressKey` / `selectShot`            | never mutates the input state (frozen-input property)      |

### 3.8 Properties (fast-check)

- **P1** For any key sequence in either mode, every produced shot satisfies
  `0 <= valueTenths <= 109` and `Number.isInteger(valueTenths)`. (N3)
- **P2** `seriesTotalTenths(state) === sum(enteredShots(state).valueTenths)`
  after any key sequence.
- **P3** `enteredShots(state).length <= seriesLength` always, and
  `cursor === firstEmptyIndex ?? seriesLength` always (E8).
- **P4** Integer mode round-trip: for any digit sequence, the state after
  applying it equals the state built by seeding those shots directly.
- **P5** `pressKey` never mutates its input (structural equality of a deep
  clone taken before the call).

## 4. `shared/src/scoring/marke.ts`

SHB Bilaga 1 mom 5.1.1.1 p. 452 — per 5-shot precision series, by vapengrupp:

| Valör  | A   | B   | C   |
| ------ | --- | --- | --- |
| Brons  | 32  | 33  | 34  |
| Silver | 38  | 39  | 40  |
| Guld   | 43  | 45  | 46  |

Age reduction: −1 point/series from the year **after** turning 55; −2 from the
year after turning 65.

| #   | Given                                              | Then                                                                                           |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M1  | group C, guld, no birth year                       | 46                                                                                             |
| M2  | group A/B, guld                                    | 43 / 45                                                                                        |
| M3  | brons/silver rows                                  | exactly the table above                                                                        |
| M4  | born 1970, year 2025 (turns 55 in 2025)            | reduction 0 — the reduction starts the year _after_                                            |
| M5  | born 1970, year 2026 (age 56)                      | reduction 1 → guld C = 45                                                                      |
| M6  | born 1960, year 2025 (turns 65)                    | reduction 1 (55-rule still, 65-rule not yet)                                                   |
| M7  | born 1960, year 2026 (age 66)                      | reduction 2 → guld C = 44                                                                      |
| M8  | `isGuldserie(46, C)` / `isGuldserie(45, C)`        | true / false — the threshold is inclusive                                                      |
| M9  | weapon group `spsf:R`, `spsf:M1`, `generic:airgun` | `null` — no märke threshold, UI hides the badge                                                |
| M10 | weapon group `spsf:AM`/`AP`/`AG`/`A-opt`           | maps to the **A** row (V3 — sub-groups of A; SHB prints "A/A-opt" together for standardmedalj) |
| M11 | series length ≠ 5, or discipline ≠ precision       | `null` — the threshold is defined per 5-shot precision series                                  |
| M12 | `null`/unknown weapon group                        | `null`                                                                                         |
| M13 | birth year in the future / absurd (<1900)          | throws `RangeError` (never silently mis-scores)                                                |

Reported score is in **points**, not tenths: the caller divides. Märke applies
to integer precision scoring only, so tenths ÷ 10 is exact.

## 5. `shared/src/scoring/totals.ts` (extension)

| #   | Given                                      | Then                                                                      |
| --- | ------------------------------------------ | ------------------------------------------------------------------------- |
| T1  | `sumValueTenths` / `tenthsToScore`         | unchanged behaviour (N7 — existing tests keep passing)                    |
| T2  | `countInnerTens(shots)`                    | counts `isInnerTen` only (not `isInnerTenDecimal`)                        |
| T3  | `sessionResults([])`                       | `{beforeFinalTenths: 0, finalTenths: 0, totalTenths: 0, hasFinal: false}` |
| T4  | series: 3 scored main                      | beforeFinal = sum; final 0; total = beforeFinal; hasFinal false           |
| T5  | series: 2 main + 1 final                   | beforeFinal = main sum; final = final sum; total = both; hasFinal true    |
| T6  | a **sighter** main series with shots       | excluded from beforeFinal and from total (N1)                             |
| T7  | a **final sighter** (isSighter && isFinal) | excluded from finalScore and total (N1)                                   |
| T8  | any input                                  | `total === beforeFinal + final` (N6, property)                            |
| T9  | `shotVolume(series)`                       | counts **all** shots including sighters (N1's other half)                 |

## 6. `shared/src/disciplines/*`

| #   | Given                                             | Then                                                                                  |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| G1  | every shipped discipline JSON                     | parses against `disciplineSchema` (zod) at module load                                |
| G2  | every shipped program JSON                        | parses against `programSchema`                                                        |
| G3  | a malformed discipline object                     | `disciplineSchema.parse` throws (negative control for G1)                             |
| G4  | v1 discipline set                                 | exactly `spsf-precision`, `spsf-milsnabb`, `generic-rings` (§6.2, SPSF-only v1)       |
| G5  | `programsForDiscipline('spsf-precision')`         | `[spsf-precision]`; free training is the absence of a program, not an entry           |
| G6  | `spsf-precision` program                          | 5 shots/series, integer, supportsFinal true, **no** structure (freeform)              |
| G7  | `spsf-milsnabb` program                           | 5 shots/series, integer, supportsFinal false, structure 1 sighter + 4/4/4 at 10/8/6 s |
| G8  | `buildProgramSkeleton(milsnabb)`                  | 13 entries: position 1 sighter (10 s), then 12 scored — 4×10 s, 4×8 s, 4×6 s          |
| G9  | `buildProgramSkeleton(precision)`                 | `[]` — freeform programs pre-create nothing (skill rule 1)                            |
| G10 | `weaponGroupsForDiscipline('spsf-precision')`     | A, AM, AP, AG, A-opt, B, C — **no R** (SHB F.4.4)                                     |
| G11 | `weaponGroupsForDiscipline('spsf-milsnabb')`      | A, B, C, **R**                                                                        |
| G12 | `shooterClassesForDiscipline('spsf-*')`           | 1, 1u, 1b, 1s, 2, 3, Jun, Dam1-3, VetY, VetÄ                                          |
| G13 | `formatGroupAndClass('spsf:C', '2')`              | `'C 2'` (SHB F.2.6–F.2.7 display convention, N4)                                      |
| G14 | `formatShooterClass('Dam1'/'VetY'/'2')`           | `'Dam 1'` / `'Vet Y'` / `'2'`                                                         |
| G15 | `defaultSessionName` competition                  | `'KM Precision C'` from level label + program label + group code (§6.3)               |
| G16 | `defaultSessionName` training                     | `'<discipline> — <date>'`                                                             |
| G17 | `defaultSessionName` with blank parts             | no double spaces, no dangling separator                                               |
| G18 | `allowsDecimal` false + program scoring `integer` | `decimalAllowed()` false — the UI toggle is unavailable (§4 M3)                       |

## 7. App-layer acceptance (normal tests + Maestro, not the old-coder loop)

- **A1** `/session/new` creates a session and routes to `/session/[id]`.
- **A2** `/session/[id]` lists series with per-shot chips and per-series totals;
  shows Before final / Final / Total only when a final exists.
- **A3** Sighter toggle disabled once the current section has a sighter (N2).
- **A4** "Start final" appears only when the program `supportsFinal` and ≥1
  scored series exists.
- **A5** A milsnabb session pre-creates its skeleton with time-limit labels.
- **A6** Guldserie badge + "Guld vid N" shown when a threshold exists; hidden
  when the weapon group has none or the birth year is unknown (M9/M11/M12).
- **A7** Photo attach per series via expo-image-picker, stored as a local URI.
- **A8 (Maestro `app/e2e/m3-entry.yaml`)** Create a C-precision session, enter
  five 5-shot series by tapping the keypad, assert the computed session total
  on the detail screen; screenshots to the scratchpad `m3/` directory.

## 8. Out of scope for M3

Statistics (M5), standardmedalj markers (M5), särskjutning, photo target
scoring (v2), round-counter increments (M4), CSV (M7).

---

# Amendment A1 — X/(X) semantics, session-header stats, unscored extra rounds

> **Append-only amendment** to the M3 spec (old-coder: the spec is never
> rewritten in place). Everything above this line records what M3 shipped and
> stays as the historical contract; where A1 contradicts it, **A1 wins** and the
> contradiction is named explicitly below.
>
> Date: **2026-09-01**.
> Branch: `feat/score-x-semantics`, based on `feat/theme-purple-rain`.
> Evidence: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/m3-scoring-evidence.md` §A1.
>
> **Approval status: maintainer-directed-by-message.** The three changes below
> — including the resolution of V1 and V2 — were dictated by the maintainer in
> the task message, so the *semantics* are the maintainer's, not the agent's.
> The maintainer did **not** review this amendment document before the code was
> written (autonomous run), so the correlation-breaking spec review still did
> not happen for the scenario tables, the invariants, or the mapping. Confidence
> is claimed accordingly in the evidence report.

Tier: **3**, unchanged — this changes the meaning of already-recorded scoring
data (`is_inner_ten`) and adds a column that feeds the firearm round counter.

## A1.0 Setup plan (what this amendment authorizes)

- **Isolation:** branch `feat/score-x-semantics` (not a worktree — the gauntlet
  needs the repo's installed `node_modules`; same reason as §0).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths staged,
  branch pushed, no PR, `main` untouched.
- **No new dependencies** — runtime or dev. Explicitly stated by the maintainer.
- **Schema:** one new nullable column, `sessions.extra_rounds INTEGER NULL`,
  added by a **new Drizzle migration** (`0001_*`). Migration `0000` is never
  edited. No column is dropped — see A1.1.4.
- **Files the gauntlet adds, by path:** `app/src/db/migrations/0001_*.sql` +
  its `meta/` snapshot (drizzle-kit generated), and the screenshots under the
  session scratchpad `x-semantics/`.

## A1.1 Change 1 — X and (X) semantics (resolves V1 and V2)

### A1.1.1 Maintainer ruling

**V1 — `(X)` semantics: RESOLVED (maintainer, 2026-09-01).**
**V2 — the "10" key in decimal mode: RESOLVED (maintainer, 2026-09-01).**

| Key   | Meaning                                    | `value_tenths` (integer mode) | `is_inner_ten` |
| ----- | ------------------------------------------ | ----------------------------- | -------------- |
| `X`   | an **ordinary ten**                        | 100                           | 0              |
| `(X)` | an **inner ten** (centrumtia)              | 100                           | 1              |

Both keys are visible and usable in **both** scoring modes. In decimal mode both
are ring-10 keys resolving V2 (there is still no free `10` key, because `0` is
ring 0 — a decimal miss):

| Key   | Decimal meaning                                                   |
| ----- | ----------------------------------------------------------------- |
| `X`   | ring 10, **no** inner-ten flag; the following digit is the tenth  |
| `(X)` | ring 10 **plus** the inner-ten flag; the following digit is the tenth |

So `X` then `9` ⇒ `value_tenths` 109, `is_inner_ten` 0; `(X)` then `9` ⇒ 109,
`is_inner_ten` 1.

### A1.1.2 What this contradicts above (named explicitly)

- §3.1: `EntryShot.isInnerTenDecimal` and `KeypadState.innerTenDecimalEnabled`
  are **removed** from the types. `PendingRing.isInnerTenDecimal` likewise.
- §3.3 I3: `X` in integer mode now yields `{100, isInnerTen: **false**}`.
- §3.3 I4 / I7: `(X)` is now a first-class integer-mode key and appears in
  `visibleKeys`.
- §3.4 D4 / D5: `X` in decimal mode no longer sets `isInnerTen`.
- §3.4 D6 / D7 / D11: the `innerTenDecimalEnabled` gate is gone; `(X)` is
  always visible and always sets `isInnerTen`.
- §5 T2: `countInnerTens` still counts `isInnerTen` only — but that flag now
  means "the shooter pressed `(X)`", i.e. a centrumtia, not "the shooter
  pressed `X`".

### A1.1.3 Revised scenario tables

**Integer mode (replaces §3.3).** `visibleKeys` is
`1..9, 0, X, (X), backspace` in **both** modes.

| #    | Given                            | When          | Then                                                          |
| ---- | -------------------------------- | ------------- | ------------------------------------------------------------- |
| A-I1 | empty 5-shot series              | press `9`     | shots[0] = {90, isInnerTen false}; cursor 1; total 90         |
| A-I2 | empty series                     | press `0`     | shots[0] = {0, false} (miss); cursor 1; total 0               |
| A-I3 | empty series                     | press `X`     | shots[0] = {100, **false**} — an ordinary ten; total 100      |
| A-I4 | empty series                     | press `(X)`   | shots[0] = {100, **true**} — a centrumtia; total 100          |
| A-I5 | keys `9,X,8,7,(X)`               | —             | total 440 tenths; **1** inner ten (the `(X)`); complete       |
| A-I6 | full 5-shot series               | press `7`     | state unchanged                                               |
| A-I7 | any state                        | `visibleKeys` | `1..9,0,X,(X),backspace`                                      |

**Decimal mode (replaces §3.4).**

| #     | Given                | When            | Then                                                    |
| ----- | -------------------- | --------------- | ------------------------------------------------------- |
| A-D1  | empty 10-shot series | `1` then `0`    | 10 (1.0); cursor 1                                      |
| A-D2  | empty series         | `9` then `7`    | 97 (9.7)                                                |
| A-D3  | empty series         | `0` then `0`    | 0 (a miss)                                              |
| A-D4  | empty series         | `X` then `9`    | 109, isInnerTen **false**                               |
| A-D5  | empty series         | `X` then `3`    | 103, isInnerTen false (not clamped)                     |
| A-D6  | empty series         | `(X)` then `9`  | 109, isInnerTen **true**                                |
| A-D7  | empty series         | `(X)` then `3`  | 103, isInnerTen true (not clamped)                      |
| A-D8  | pending ring set     | press `X`/`(X)` | ignored — the second tap must be a digit                |
| A-D9  | pending ring set     | `backspace`     | pending cleared; no shot written; cursor unchanged      |
| A-D10 | mid-entry            | total           | counts only completed shots                             |
| A-D11 | any state            | `visibleKeys`   | `1..9,0,X,(X),backspace` — same list as integer mode    |

§3.6 (editing), §3.7 (construction) and §3.8 (properties) carry over unchanged
except that `innerTenDecimalEnabled` disappears from every construction option
and every property's arbitrary.

New property:

- **A-P6** For any key sequence in either mode, a shot has `isInnerTen === true`
  **iff** the `(X)` key produced it — equivalently, `isInnerTen` implies
  `valueTenths >= 100`.

### A1.1.4 Schema: `is_inner_ten_decimal` is DEPRECATED, not dropped

The column `shots.is_inner_ten_decimal` **stays in the schema and in migration
`0000`**. Rationale (maintainer's, recorded here so the next reader does not
"clean it up"): a destructive column-drop migration on an existing local-first
database is riskier than an always-zero unused column. The change is:

- No code writes a non-zero value to it any more; `AddShotInput` no longer
  accepts it and the app never passes it.
- §3 of the implementation plan and `app/src/db/schema.ts` mark it
  `DEPRECATED (2026-09-01)` in comments, with the reason.
- **Invariant A-N10:** after this change, every row written by the app has
  `is_inner_ten_decimal = 0`. Historical rows: none exist, because M3 shipped
  the flag defaulted off and no UI path ever enabled it (see V1 above) — so
  there is no data migration to perform.

### A1.1.5 Display (app layer, ordinary tests + Maestro)

- A chip for an inner ten renders **`(X)`** in integer mode (ShotLog's
  convention), and the parenthesised value **`(10.9)`** in decimal mode — the
  parentheses are the inner-ten marker in both modes.
- An ordinary ten renders `10` in integer mode and `10.9` in decimal.
- Statistics labels that used to say "X" now say **`(X)`** / "inner tens" /
  sv **"centrumtior"**, consistently, because the metric now counts centrumtior.

## A1.2 Change 2 — session header stats

The session-detail header card (the one with Total and "Guld vid N") gains two
values. The per-shot average stays where it is, in the Stats toggle.

New pure functions in `shared/src/scoring/totals.ts`:

| #    | Given                                                      | Then                                                                            |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A-S1 | `seriesAverageTenths([])`                                  | `null` (undefined, never 0)                                                     |
| A-S2 | 3 scored main series 430/440/450 tenths                    | 440 — the mean of the **series** totals, in tenths                              |
| A-S3 | a sighter series among them                                | excluded from the mean (N1)                                                     |
| A-S4 | a **final** series present                                 | included — the mean is over all scored series, main and final                   |
| A-S5 | a scored series with **no shots yet** (an empty new chip row) | excluded — an unentered series must not drag the average toward 0             |
| A-S6 | only sighters / only empty series                          | `null`                                                                          |
| A-S7 | `sessionInnerTenCount(series)`                             | count of `isInnerTen` shots in scored (non-sighter) series — sighter X's excluded |

i18n: sv `snitt/serie` + `centrumtior`, en `avg/series` + `inner tens (X)`.

## A1.3 Change 3 — unscored extra rounds

`sessions.extra_rounds INTEGER NULL` — rounds fired in a session that were never
scored (FAP/ammo-volume bookkeeping: fouling shots, function checks, plinking
after the match).

**Semantics (maintainer-directed):**

| #    | Concern                          | Rule                                                                                   |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------- |
| A-X1 | firearm round counter            | **included** — the M4 delta path adds `extra_rounds` for firearm-linked sessions        |
| A-X2 | ammo-lot usage                   | **included** in the lot's `shotCount`                                                   |
| A-X3 | volume metrics (shots logged)    | **included** — Home's shots-logged total and the Stats tab's total shots                |
| A-X4 | every score statistic            | **excluded** — mean, SD, X count/rate, best/worst series, trend, guldserie, comparison, standardmedalj, session total |
| A-X5 | series / shot structures         | **excluded entirely** — no `series` row, no `shots` row is ever created for them        |
| A-X6 | edit from N to M                 | round counter and lot usage move by the **delta** `M − N`, never by `M` (same rule the M4 shot path already uses) |
| A-X7 | `NULL` vs `0`                    | both mean "no extra rounds"; the field is nullable so "never entered" stays distinguishable in the data |
| A-X8 | negative / non-integer input     | rejected (`RangeError`) — never silently mis-counts a round counter                     |

**Migration:** generated with `drizzle-kit generate`, applied by the existing
expo migrator on app start. **A-X9:** the migration applies cleanly on a database
already at `0000` with rows in it, and existing sessions read back
`extra_rounds = NULL`.

**UI:** a numeric field on the new-session form and on session detail —
en "Extra rounds (not scored)", sv "Extra skott (räknas ej i statistik)".

## A1.4 Negative constraints for this amendment

- **A-N10** every newly written shot row has `is_inner_ten_decimal = 0` (A1.1.4).
- **A-N11** `value_tenths` stays 0–109 and integer; all sums stay integer.
- **A-N12** the 273 pre-existing vitest tests and 1 jest test keep passing,
  except where a test's **expectation** encodes the old X/(X) semantics — those
  are updated to the maintainer's ruling and **each one is listed individually
  in the evidence report**. No test is deleted, skipped, or broadened.
- **A-N13** coverage thresholds and Stryker thresholds are never lowered.
- **A-N14** no new dependency, runtime or dev.
- **A-N15** every new UI string goes through i18n with real sv + en.
- **A-N16** `shared/` stays free of React Native imports.

---

# Amendment A2 — final keypad layout: `1–9`, `0`, `10`, `X`

> **Append-only amendment**, and it **SUPERSEDES Amendment A1 §A1.1** (same
> day, 2026-09-01). A1 §A1.2 (session-header stats) and §A1.3 (extra rounds)
> are unaffected and still stand. Where A2 and A1 §A1.1 disagree, **A2 wins**.
>
> **Approval status: maintainer-directed-by-message** (the layout and the key
> meanings are the maintainer's). The amendment document itself was not
> reviewed before the code was written — autonomous run, as for A1.

## A2.1 The ruling

There is **no `(X)` key**. The keypad is `1–9`, `0`, `10`, `X`, backspace:

| Key    | Meaning                       | `value_tenths` (integer mode) | `is_inner_ten` |
| ------ | ----------------------------- | ----------------------------- | -------------- |
| `1`–`9`| rings 1–9                     | digit × 10                    | 0              |
| `0`    | a miss                        | 0                             | 0              |
| `10`   | an **ordinary ten**           | 100                           | 0              |
| `X`    | an **inner ten** (centrumtia) | 100                           | 1              |

So relative to A1 §A1.1 the two ten-keys keep their *meanings* and swap their
*labels*: A1's `X` (ordinary ten) is now spelled `10`, and A1's `(X)` (inner
ten) is now spelled `X`. **The stored data model is unchanged** — `is_inner_ten`
still means centrumtia, so nothing about A1's data ruling is undone, and no
data written under A1 is reinterpreted.

**Assumption flagged for the maintainer's veto:** the maintainer's wording was
"1-10 and X". A miss still has to be enterable, and `0` is the only key that can
express one, so **`0` is kept**. If the maintainer wants misses entered some
other way, that is a further amendment.

**Decimal mode:** two taps as before. `10` starts ring 10 with no flag; `X`
starts ring 10 with the inner-ten flag; the second tap is the tenth digit.
`0`–`9` are rings 0–9, so `0` then `0` is still a decimal miss. This finally
retires VERIFY item V2 with the plan's own literal spelling: the plan wrote
`"10" then "9" ⇒ 10.9`, and there is now an actual `10` key that does exactly
that.

## A2.2 Revised scenario tables (replace A1 §A1.1.3)

**Integer mode.** `visibleKeys` is `1..9, 0, 10, X, backspace` in **both** modes.

| #    | Given                | When          | Then                                                    |
| ---- | -------------------- | ------------- | ------------------------------------------------------- |
| B-I1 | empty 5-shot series  | press `9`     | {90, isInnerTen false}; cursor 1; total 90              |
| B-I2 | empty series         | press `0`     | {0, false} — a miss; cursor 1; total 0                  |
| B-I3 | empty series         | press `10`    | {100, **false**} — an ordinary ten; total 100           |
| B-I4 | empty series         | press `X`     | {100, **true**} — a centrumtia; total 100               |
| B-I5 | keys `9,10,8,7,X`    | —             | total 440 tenths; **1** inner ten; complete             |
| B-I6 | full series          | press `7`/`X` | state unchanged                                         |
| B-I7 | any state            | `visibleKeys` | `1..9,0,10,X,backspace` — no `(X)` anywhere             |

**Decimal mode.**

| #     | Given                | When            | Then                                     |
| ----- | -------------------- | --------------- | ---------------------------------------- |
| B-D1  | empty 10-shot series | `1` then `0`    | 10 (1.0)                                 |
| B-D2  | empty series         | `9` then `7`    | 97 (9.7)                                 |
| B-D3  | empty series         | `0` then `0`    | 0 (a miss)                               |
| B-D4  | empty series         | `10` then `9`   | 109, isInnerTen **false**                |
| B-D5  | empty series         | `10` then `3`   | 103, isInnerTen false (not clamped)      |
| B-D6  | empty series         | `X` then `9`    | 109, isInnerTen **true**                 |
| B-D7  | empty series         | `X` then `3`    | 103, isInnerTen true (not clamped)       |
| B-D8  | pending ring set     | press `10`/`X`  | ignored — the second tap must be a digit |
| B-D9  | pending ring set     | `backspace`     | pending cleared; no shot written         |
| B-D10 | mid-entry            | total           | counts only completed shots              |
| B-D11 | any state            | `visibleKeys`   | same list as integer mode                |

Property **A-P6** carries over with `X` in place of `(X)`: a shot has
`isInnerTen` true only where the `X` key produced it, and any such shot is
worth at least 100 tenths.

## A2.3 Display and labels (replaces A1 §A1.1.5)

- Chip, integer mode: an ordinary ten renders **`10`**, an inner ten renders
  **`X`**.
- Chip, decimal mode: the numeric value, with an inner ten parenthesised —
  `10.9` vs `(10.9)`.
- Every "X" label in statistics and headers is plain **`X`** again (sv
  "X (centrumtior)"), never "(X)". The metric still counts centrumtior.

## A2.4 Session lists (Home latest sessions, and any other session list)

Each session row shows, besides the name and date, a secondary line with the
**total score**, the **per-series average** and the **number of X** — e.g.
`225 · 45.0/serie · 3X` — built from the existing `ListRow`/`Chip` components.

| #    | Given                                     | Then                                                          |
| ---- | ----------------------------------------- | -------------------------------------------------------------- |
| B-L1 | a session with scored series              | the row shows total, `seriesAverageTenths`, `sessionInnerTenCount` |
| B-L2 | a session with only sighters / no shots   | average and X count are omitted, not printed as 0 or NaN       |
| B-L3 | sighter series                            | excluded from both the average and the X count (A-S3/A-S7)     |
