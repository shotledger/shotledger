# Evidence report — rounds-only sessions and final series on the web (Tier 3)

Spec: [`web-rounds-final-spec.md`](web-rounds-final-spec.md).

- **Spec approval: not obtained (autonomous run).** The spec was written and
  built in one run; its key choices C1–C5 and the questions in its §8 are
  listed in the PR for the maintainer. Confidence is lower accordingly: the
  correlation-breaking review of the spec has not happened.
- **Independent verification: round 1 `passed` at `fffb8406`** (no code
  defect; findings F1–F6 in the spec, manual and report). The maintainer's
  rulings on F1, F3 and F4 then changed code (spec R4), so **this source state
  is not independently verified**: a declared downgrade.
- **Source state:** branch `feat/web-rounds-final-689`, rebased onto
  `origin/main` `b17cb181`.
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, TypeScript 6.0.2; backend vitest 5.0.3 with the Workers
  pool).
- **Entry point:** `pnpm check`; `cd backend && npx vitest run
--testTimeout=60000`; `npx stryker run --mutate
shared/src/sync-client/rounds-entry.ts,shared/src/sync-client/session-entry.ts,shared/src/sync-client/rows.ts,web/src/entry/kinds.ts,web/src/entry/model.ts`.

## Failure model (Tier 3)

| Way this can hurt                                            | Layer that catches it                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| A web rounds session differs from the phone's own            | AP1: the web row equals `createSession` + `setSessionExtraRounds`'s, ids aside   |
| The firearm counter moves by something other than the volume | RO1, RO3 (0 and blank move nothing), FS1, AP1, AP2, WR1, browser checks 7 and 16 |
| A final where the phone offers none                          | FS3 (throws), WK4, the program-data pin in FS3                                   |
| A final row stored without `is_final`, or out of position    | FS1, FS4, AP2 (equal to the phone's `addSeries` rows), WR2, browser check 15     |
| A second sighter per section, or a final sighter refused     | FS2, WK7                                                                         |
| A series session of #669 changes shape                       | N1: the unchanged E1–E15, A1–A3 and W1–W4 suites                                 |
| Typed rounds lost without a word                             | RO2, RO4, browser check 4                                                        |
| A lost response, retried, saves twice                        | unchanged path (#669 C2); WR2 replays → all `duplicate`                          |

## Spec → test mapping

| Scenario                                | Test                                                                                   | Status |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| K1, K2                                  | `shared/src/sync-client/rows.test.ts`                                                  | pass   |
| RO1–RO8                                 | `shared/src/sync-client/rounds-entry.test.ts` (RO7 also: an unknown discipline throws) | pass   |
| FS1–FS4                                 | `shared/src/sync-client/session-entry.test.ts` › final series                          | pass   |
| WK1–WK10                                | `web/src/entry/kinds.test.ts`                                                          | pass   |
| AP1, AP2                                | `app/src/db/queries/web-rounds-final.test.ts` (two phone databases, real schema)       | pass   |
| WR1, WR2                                | `backend/test/web-rounds-final.spec.ts` (Workers pool, real D1 + better-auth)          | pass   |
| N1 #669 payloads unchanged              | `session-entry.test.ts` E1–E15, `web-rows.test.ts` A1–A3, `web-write.spec.ts` W1–W4    | pass   |
| N2 only the action's rows               | RO1, RO3, FS1 (table lists asserted exactly)                                           | pass   |
| N3 no null in NOT NULL, no extra column | AP1 (whole-row equality with the phone's), AP2, #669 A1                                | pass   |
| N4 final only where offered             | FS3, WK4, WK8                                                                          | pass   |
| N5 no browser storage                   | `save.test.ts` › N1 grep gate, which reads every `web/src/entry` source                | pass   |
| N6 no phone rule restated in `web/`     | review: field rules in the shared builders, the final gate from `supportsFinal`        | pass   |
| Browser checks                          | headless Chrome over CDP against `wrangler dev`; see below                             | pass   |

## Gauntlet (final fresh run, after the last code edit)

| Layer                                           | Command                                                                | Result                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                           | exit 0; vitest 196 files, 3229 tests passed; jest 712 passed; i18n 1280 keys, 0 issues |
| Coverage (gated, 100%)                          | `pnpm check` (`vitest run --coverage`)                                 | statements 3981/3981, branches 2561/2561, functions 941/941, lines 3378/3378           |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                     | 21 files, 202 tests passed (WR1, WR2 and #669's W1–W4 included)                        |
| Mutation (tool)                                 | `npx stryker run --mutate <the five modules above>`                    | 706 killed + 1 timeout, 5 survived, 0 no coverage: 99.30% (all 5 equivalent, below)    |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=689 <the 8 suites>` | 8 files, 126 tests passed                                                              |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check` | built; 26 translated pages current; no dangling anchors                                |
| Supply chain                                    | `pnpm licenses:check`; the diff                                        | 97 packages, invariants hold; no dependency, `package.json` or lockfile change         |
| Property-based                                  | not added                                                              | N-A: the rounds parser is a regex plus a range check, covered by RO2's boundary table  |

**Mutation survivors, all equivalent.** Four are #669's, already argued in
`web-series-entry-evidence.md`: `newRow`'s `lastKey += 1` → `-= 1`,
`programOf`'s `programId === null ?` → `false ?`, and the date regex losing
`^` (two). The fifth is the same case in `kinds.ts` `finalOffered`:
`programId === null` → `false` hands `getProgram` a null, which matches no
program id, so the answer is `false` either way. The first run had five more
survivors of this layer (`requireDiscipline` in `buildRoundsEntry`, the
optional chain in `finalOffered`, `addRow`'s `at(-1)` and its optional
chain); RO7, WK4 and WK6 gained cases that kill them.

**Negative control.** The N1 storage gate failed with `// localStorage`
appended to `web/src/entry/kinds.ts` (1 failed), then passed restored.

**RED.** Every new scenario was seen failing before its code existed: K1,
K2, FS1–FS4 and RO1–RO8 against throwing stubs (32 failed), WK1–WK10 against
a throwing stub (12 failed).

## Real execution (browser checks)

`wrangler dev` on port 8797 with a synthetic account on a reserved TLD
(seeded through `/sync/push` with one firearm at 100 rounds), the built web
app served by the Worker, headless Chrome driven over CDP. The server state
was read back through `/sync/pull`. Screenshots are kept locally, outside the
repo, and are not attached.

1. The Logging picker is on the form.
2. Rounds Only: Rounds Fired shown; Match Format, Shots per Series and the
   series rows hidden.
3. Rounds Only offers fält.
4. `2.5` → "Rounds Fired must be a whole number.", nothing sent.
5. `60` with the firearm → "Saved."
6. Server: `kind: 'rounds'`, `extra_rounds: 60`, `program_id: null`, no series.
7. Server: the firearm 100 → 160 (since maintenance 0 → 60).
8. Fält under Rounds Only, then back to Scored Series → Precision.
9. Competition Precision preselects Full Match.
10. No Start Final before a shot.
11. Start Final after `10 9 8 7 6`.
12. Headings Qualification and Final.
13. Start Final gone once a final exists.
14. Saved, with a blank final row added by Add Series.
15. Server: series 1 `is_final 0`, series 2 `is_final 1`; the blank row dropped.
16. Server: the firearm 160 → 170.
17. Sessions lists both sessions (the competition at 88p).
18. No console errors, CSP included.

## Downgrades and deviations

- **Spec approval:** not obtained (autonomous run), see the header.
- **Independent verification:** round 1 passed at `fffb8406`; the R4 changes
  after it are not independently verified (declared downgrade). Its F2 (C5's
  wording) and F5 (the issue's "decimal") are description findings left to
  the maintainer; F6 (stale numbers) is this refresh.
- **Real execution after R4:** the phone side in the app's web preview (`1e2`
  in Rounds Fired shows the error and Create Session does nothing; `100`
  creates a session with 100 extra rounds). The web form's two new error
  paths are covered by FS5/FS6 and were not re-driven in a browser.
- **SUBSTITUTED:** mutation ran on the five changed modules (`--mutate`), not
  the whole `pnpm mutation` list; nothing else in that list changed.
- **N-A:** `kind-fields.tsx` and `entry.tsx` are outside the gates, as every
  `.tsx` is; their logic is in `kinds.ts` and `model.ts`, and the browser
  checks drove them.
- **NOT DONE:** the implementation plan has no checkbox for web writes (#669
  ticked none either), so none is ticked.
