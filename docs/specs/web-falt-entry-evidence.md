# Evidence report — web fält entry (Tier 3)

> For the spec `docs/specs/web-falt-entry-spec.md` (#688, under #301).

- **Spec approval: not obtained (autonomous run).** The spec was written and
  built in one run; its key choices C1–C7 are listed in the PR for the
  maintainer. Confidence is correspondingly lower: the spec is the artifact
  to review after the fact.
- **Source state:** code at `37c5ce4b` on `feat/web-falt-entry`, on `main` at
  `8be414cc` (with #669, #672, #674, #717 and #719 merged). The commits after
  it change only this report. Every number below is from a fresh run on that
  state. (An earlier version of this report named `403bf7d1`, a pre-rebase
  commit, and its numbers; verification round 1 caught it, F6.)
- **Toolchain:** Node v26.10.0, vitest 5.0.3, Stryker 10.0.0, versions pinned
  by `pnpm-lock.yaml`.
- **Entry point:** `pnpm check` (types, lint, format, i18n, licenses, vitest
  with the 100% coverage gate, jest), plus the commands in the gauntlet table.
- **Independent verification: not performed against the final source state**
  `37c5ce4b` (a declared downgrade). Two rounds, the cap, were performed: round
  1 `failed` at `284c26a1`, round 2 `failed` at `8efed94c`. The fixes since are
  disclosed in [Independent verification](#independent-verification) as
  unverified.

## Spec → test mapping

| Scenario                                         | Test                                                              | Status |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------ |
| S1 stationProblem                                | `shared/src/scoring/falt-station.test.ts` › S1                    | pass   |
| S2 figuresHitRange                               | › S2                                                              | pass   |
| S3 clampFiguresHit                               | › S3                                                              | pass   |
| S4 stationPoints                                 | › S4                                                              | pass   |
| S5 isBlankStation                                | › S5                                                              | pass   |
| FE1 training entry, firearm +18, APPLY_ORDER     | `shared/src/sync-client/falt-entry.test.ts` › FE1 (two tests)     | pass   |
| FE2 result mode stored                           | › FE2                                                             | pass   |
| FE3 blank stations dropped, contiguous positions | › FE3                                                             | pass   |
| FE4 every station column                         | › FE4 (two tests)                                                 | pass   |
| FE5 bad points refused                           | › FE5                                                             | pass   |
| FE6 impossible station refused, scratched kept   | › FE6                                                             | pass   |
| FE7 six rounds per saved station                 | › FE7                                                             | pass   |
| FE8 competition and training fields              | › FE8                                                             | pass   |
| FE9 session-field errors collected               | › FE9                                                             | pass   |
| FE10 ring discipline throws                      | › FE10                                                            | pass   |
| FE11 schema-valid changes, PUSH_BATCH_MAX        | › FE11 (two tests)                                                | pass   |
| FE12 no station → session alone                  | › FE12                                                            | pass   |
| AF1 column parity                                | `app/src/db/queries/web-falt-rows.test.ts` › AF1                  | pass   |
| AF2 applies on the phone, firearm 124            | › AF2                                                             | pass   |
| AF3 outbox stays empty                           | › AF3                                                             | pass   |
| WF1 round trip through the real Worker           | `backend/test/web-falt-write.spec.ts` › WF1                       | pass   |
| WF2 resend answers duplicate, no new rows        | › WF2                                                             | pass   |
| UF1 picker offers fält                           | `web/src/entry/falt-model.test.ts` › UF1                          | pass   |
| UF2 Figures Hit clamps                           | › UF2                                                             | pass   |
| UF3 toFaltDraft                                  | › UF3                                                             | pass   |
| UF4 held request kept only for Add Station       | › UF4                                                             | pass   |
| UF5 running result over saved stations           | › UF5                                                             | pass   |
| UF6 fresh form                                   | › UF6                                                             | pass   |
| UF7 shoot-off continues after a saved shoot-off  | › UF7                                                             | pass   |
| UF8 shoot-off saved, or dropped when empty       | › UF8                                                             | pass   |
| UF9 only a station that will be saved counts     | › UF9                                                             | pass   |
| UF10 no ordinary station after a saved shoot-off | › UF10                                                            | pass   |
| Must NOT N1 no browser storage                   | #669's `web/src/entry/save.test.ts` › N1 greps every entry module | pass   |
| Must NOT N2 no endpoint/protocol change          | FE11, WF1; no backend source changed                              | pass   |
| Must NOT N3 no NOT NULL as null                  | AF1, AF2                                                          | pass   |
| Must NOT N4 only session, stations, firearm      | FE1, FE7, FE12                                                    | pass   |
| Must NOT N5 no impossible scoring station        | FE6, S1                                                           | pass   |
| Must NOT N6 phone behaviour unchanged            | `app/src/db/queries/falt.test.ts` unchanged, 20/20                | pass   |
| Must NOT N7 #669 behaviour unchanged             | no existing test file changed; `pnpm check` green                 | pass   |

The phone's station screen (`app/src/app/session/[id]/station/[pos].tsx`)
now calls the moved rules; it has no automated test, so its unchanged
behaviour rests on S1–S5 pinning the rules it used to hold inline and on
`pnpm typecheck:app`. It was not run on the emulator.

## Gauntlet (final fresh run, after the last code edit)

| Layer                  | Command                                                                                                                                          | Result                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Tests (vitest)         | `pnpm check`                                                                                                                                     | 197 files, 3210 passed, 0 failed                                                                                              |
| Tests (jest, app)      | `pnpm check`                                                                                                                                     | 63 suites, 712 passed                                                                                                         |
| Types                  | `pnpm check` (`typecheck`, `typecheck:app`, `typecheck:web`)                                                                                     | 0 errors                                                                                                                      |
| Lint + format          | `pnpm check` (`lint`, `format`)                                                                                                                  | 0 problems                                                                                                                    |
| Coverage               | `pnpm check` (`vitest run --coverage`, threshold 100 on the `mutate` list)                                                                       | 100% statements, branches, functions, lines; the new `falt-station.ts`, `falt-entry.ts`, `falt-model.ts` each 100/100/100/100 |
| Mutation               | `npx stryker run --mutate "shared/src/scoring/falt-station.ts,shared/src/sync-client/falt-entry.ts,web/src/entry/falt-model.ts" --concurrency 2` | 408 killed / 412 (99.03%); 4 survivors, all equivalent (below)                                                                |
| Backend (Workers pool) | `cd backend && npx vitest run --testTimeout=60000`                                                                                               | 21 files, 202 passed (WF1, WF2 among them)                                                                                    |
| i18n                   | `pnpm i18n:check`                                                                                                                                | 1281 keys each, 0 issues                                                                                                      |
| Docs                   | `node scripts/docs-translation-check.mjs`, `node scripts/docs-anchor-check.mjs`, `mkdocs build --strict`                                         | 26 pages current; no dangling anchors; built                                                                                  |
| Real execution         | the page against `wrangler dev` (below)                                                                                                          | saved and pulled back as specified                                                                                            |
| Supply chain           | —                                                                                                                                                | no dependency added or removed; the license list is unchanged                                                                 |

### Surviving mutants, argued equivalent

- `falt-station.ts` `stationPoints`: `points !== null && …` → `true && …`.
  When `points` is null, `null > pointsMax` is false for every value
  `parseCount` returns (null or a non-negative integer), so the guard never
  decides the outcome. The line is the phone's own, moved unchanged.
- `falt-model.ts` `lastKey += 1` → `-= 1`. The key is a React key and only
  has to be unique; counting down keeps it unique.
- `falt-model.ts` `faltPreview`: `position: index + 1` → `index - 1`. The
  position only names the station in `stationProblem`'s message, and
  `faltPreview` reads only whether there is one.
- `falt-model.ts` `canStartShootOff`: `stations.at(-1)?.isShootOff` →
  `stations.at(-1).isShootOff`. The optional chain matters only for an empty
  list, and then `lastKept(falt) !== undefined` is already false and
  short-circuits the `&&` before it is reached.

## Real execution

`wrangler dev` on port 8797 serving the built web app, a synthetic account
(`@example.invalid`) seeded with one firearm at round count 100. A competition
fält session typed in the page: station 1 six hits on three of four figures,
station 2 five hits on two figures with 7 of 10 points, station 3 scratched,
station 4 left blank. The page showed "11 (12) hits / 5 figures" and "Not
saved: nothing entered." on station 4; Save said "Saved." and the Sessions
page listed the session with the same result. A pull from the server
returned the session (`spsf-falt`, `falt_result_mode` `falt`, no program, no
series length), three stations (the blank one not created) and the firearm at
118 / 18. A station with 12 points of a 10-point max showed its error on the
row and saved nothing. No console errors (CSP included). Screenshots are
local only (`~/tmp/web-falt-entry-shots/`). The first run found the series
rows still showing under the stations (spec R2); fixed and re-checked.

Re-run at `10cc66ec` for Start Shoot-off (R5, R6), same account: a fresh fält
form offered only Add Station. With station 1 filled (6 hits, 3 figures),
Start Shoot-off appeared; it added station 2 with the Shoot-off badge and
hid itself. Add Station then gave an ordinary station 3 (station 2 left
blank, marked "Not saved: nothing entered."). Station 3 got 5 hits on 2
figures; Save said "Saved." A pull returned two `falt_stations` for the
session, positions 1 and 2, both `is_shoot_off` 0. An earlier run at
`f064d096` saved a filled shoot-off as position 2 with `is_shoot_off` 1. No
console errors. Re-run at `37c5ce4b` for R7, filling out of order: station 1
filled, Start Shoot-off, Add Station, station 3 filled (ordinary while station
2 was blank), then station 2 filled; station 3's badge turned to Shoot-off and
the total counted station 1 only. A pull returned positions 1–3 with
`is_shoot_off` 0, 1, 1.

## Layers not run as specified

- **N-A:** property-based tests: the change parses no free text beyond
  `stationPoints`' whole numbers, pinned case by case in S4; the series text
  parser, where #669 runs fast-check, is untouched.
- **SUBSTITUTED:** mutation on the whole `mutate` list (`pnpm mutation`) was
  not run; Stryker ran on the three new modules only, which is where the new
  logic is. The four helpers newly exported from `session-entry.ts` were not
  re-mutated; their bodies did not change and #669's tests still pin them.
- **NOT RUN:** `pnpm reqstool:tags` / `reqstool:status`: no tagged test or
  requirement changed. The emulator: the phone's station screen was changed
  only to call the moved functions.

## Dismissed review findings

None.

## Independent verification

- Verifier: Claude Code / Claude (Opus family); fresh context; given repo @
  `284c26a1` + task contract (#688 and the #715/#717 ruling) + SPEC + entry
  point. Not given the builder's conversation. Correlation broken: task
  context. Not broken: model.
- Rounds: 2 (cap 2). Round 1 verdict: `failed` at `284c26a1`. Round 2
  (a new context, at `8efed94c`) verdict: `failed`.
- Attacked: the run (all numbers reproduced), spec vs contract (the phone's
  station screen and shoot-off rule), test-gaming (an invented "blank rows
  decide the shoot-off" mutant), checker coverage (N1 grep, coverage include),
  mapping both ways.
- Findings, with the builder's proposed grade (the maintainer grades):
  - F1, F2 behavioural: blank rows counted as stations, so Start Shoot-off
    showed on a fresh form and an abandoned shoot-off made every later
    station one. Fixed in `10cc66ec` (R6, UF9).
  - F3 spec gap, for the maintainer: the phone's Save on an untouched new
    shoot-off station saves a 0-hit shoot-off; the web drops the row. Open in
    the spec's revisions.
  - F4 mapping: UF5 claimed "in the chosen mode"; the title now drops it.
  - F5, F7 description: test titles and the test header, and C2 listing a
    Shoot-off row control. Fixed.
  - F6 description: this report named a pre-rebase state. Fixed; the numbers
    above are a fresh run.
- Round 2 findings (proposed grades):
  - F1 behavioural: rows filled out of order saved an ordinary station after
    a shoot-off (`[0, 1, 0]`). Fixed in `37c5ce4b` (R7, UF10).
  - F2, F3 behavioural: "blank" read the raw points text while Save parses
    it, so a max without points or a space in Points disagreed between Save
    and Start Shoot-off. Fixed in `37c5ce4b` (R7, UF10).
  - D1 description: this report's mutant count read "404 / 408"; it was 408
    killed of 412. Fixed.
  - Mapping: the failure-model row overclaimed UF7 and UF9; UF10 now backs it.
- Canary: not run.
- Round 1's fixes were seen by round 2. Fixed after the last verified state
  (`8efed94c`), therefore unverified: round 2's F1, F2, F3, D1 and the mapping
  row. A third round needs the maintainer's approval.

## Structural blind spot

The page component (`falt-stations.tsx`, the wiring in `entry.tsx`) has no
automated test, as #669's page has none: its behaviour rests on the pure model
it calls and on the one browser run above.

## Honest notes

- Spec revisions R1–R4 from the build, R5 from the maintainer's phone ruling,
  R6 from verification round 1.
- The first browser check failed on layout (R2), the only defect found
  outside the test suite.
