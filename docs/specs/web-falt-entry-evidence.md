# Evidence report — web fält entry (Tier 3)

> For the spec `docs/specs/web-falt-entry-spec.md` (#688, under #301).

- **Spec approval: not obtained (autonomous run).** The spec was written and
  built in one run; its key choices C1–C7 are listed in the PR for the
  maintainer. Confidence is correspondingly lower: the spec is the artifact
  to review after the fact.
- **Source state:** code at `cf54fab1` on `feat/web-falt-entry` (based on
  PR #669's head, `7212205a`). The commits after it change only
  `docs/specs/`.
- **Toolchain:** Node v26.10.0, vitest 5.0.3, Stryker 10.0.0, versions pinned
  by `pnpm-lock.yaml`.
- **Entry point:** `pnpm check` (types, lint, format, i18n, licenses, vitest
  with the 100% coverage gate, jest), plus the commands in the gauntlet table.
- **Independent verification: not performed.** A declared downgrade: no
  second model or reviewer saw any state of this change.

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
| Tests (vitest)         | `pnpm check`                                                                                                                                     | 184 files, 3103 passed, 0 failed                                                                                              |
| Tests (jest, app)      | `pnpm check`                                                                                                                                     | 63 suites, 714 passed                                                                                                         |
| Types                  | `pnpm check` (`typecheck`, `typecheck:app`, `typecheck:web`)                                                                                     | 0 errors                                                                                                                      |
| Lint + format          | `pnpm check` (`lint`, `format`)                                                                                                                  | 0 problems                                                                                                                    |
| Coverage               | `pnpm check` (`vitest run --coverage`, threshold 100 on the `mutate` list)                                                                       | 100% statements, branches, functions, lines; the new `falt-station.ts`, `falt-entry.ts`, `falt-model.ts` each 100/100/100/100 |
| Mutation               | `npx stryker run --mutate "shared/src/scoring/falt-station.ts,shared/src/sync-client/falt-entry.ts,web/src/entry/falt-model.ts" --concurrency 4` | 365 killed / 368 (99.18%); 3 survivors, all equivalent (below)                                                                |
| Backend (Workers pool) | `cd backend && npx vitest run --testTimeout=60000`                                                                                               | 19 files, 194 passed (WF1, WF2 among them)                                                                                    |
| i18n                   | `pnpm i18n:check`                                                                                                                                | 1234 keys each, 0 issues                                                                                                      |
| Docs                   | `node scripts/docs-translation-check.mjs`, `node scripts/docs-anchor-check.mjs`, `mkdocs build --strict`                                         | 25 pages current; no dangling anchors; built                                                                                  |
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

None — no review has happened yet.

## Structural blind spot

The page component (`falt-stations.tsx`, the wiring in `entry.tsx`) has no
automated test, as #669's page has none: its behaviour rests on the pure model
it calls and on the one browser run above.

## Honest notes

- Spec revisions R1–R4, all from this run.
- The first browser check failed on layout (R2), the only defect found
  outside the test suite.
