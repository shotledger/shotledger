# EVIDENCE — discard a refused change (#942)

Spec: [`sync-discard-refused-spec.md`](./sync-discard-refused-spec.md).

- **Spec approval: obtained, 2026-11-25**, before implementation: "I have
  approved the specs, go ahead." (Q1 design as written, Q2 no counter move,
  Q3 Swedish "Kasta").
- **Source state**: commit `8955c65` on `feature/942-discard-refused-change`;
  §4a covers the review fixes added after it (through `dfeb61d`).
- **Tier**: 3 (sync engine, deletes data on every device).
- **Reproduce**: `pnpm check`; `pnpm --filter @shotledger/backend test`;
  Stryker per §4.
- **Tool versions**: vitest 5.0.3, jest 30, Stryker 10.1.1, node 22.23.5
  (cloud container; 3 sv-FI date tests fail locally on this node's ICU and
  pass in CI, unrelated).

## 1. Scenarios → tests

| Scenario                                       | Test                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LIST                                           | `shared/src/sync-client/refusal-list.test.ts` "LIST …" (3 tests); `app/src/features/sync/refused-changes.test.tsx` "LIST/CTX …"                              |
| CTX                                            | `refusal-list.test.ts` "CTX a member found locally names its session", "CTX a refused session is its own root"                                               |
| CTX-NONAME                                     | `refusal-list.test.ts` and `refused-changes.test.tsx` "CTX-NONAME …"                                                                                         |
| CTX-FIREARM                                    | `refusal-list.test.ts` "CTX-FIREARM …"                                                                                                                       |
| GONE                                           | `refusal-list.test.ts` "GONE …" (4 tests); `refused-changes.test.tsx` "GONE …"; `sync-store.test.ts` "GONE …"                                                |
| SEND                                           | `shared/src/sync-client/discard.test.ts` "SEND …" (2 tests)                                                                                                  |
| OK, OK-DUP, OK-TOMB                            | `discard.test.ts` "OK …" (2), "OK-DUP …", "OK-TOMB …"                                                                                                        |
| FAIL-NET, FAIL-UNCONFIRMED, FAIL-OTHER         | `discard.test.ts`, one test each                                                                                                                             |
| E2E                                            | `backend/test/sync-client.spec.ts` "E2E discarding a bad shot releases its session on every device", "E2E a second discard … (tombstoned)" (real worker, D1) |
| E2E-ROOT                                       | `sync-client.spec.ts` "E2E-ROOT …"                                                                                                                           |
| PHONE-LOCAL, PHONE-LOCAL-NEWER, PHONE-INFLIGHT | `app/src/db/queries/sync-store.test.ts` `describe('applyDiscard')`                                                                                           |
| PHONE-FAIL                                     | `sync-store.test.ts` "PHONE-FAIL … one transaction"; `app/src/features/sync/sync-controller.test.ts` "PHONE-FAIL …"                                          |
| LOOP                                           | `sync-controller.test.ts` "LOOP …", plus "two discards run one at a time"                                                                                    |
| CANCEL                                         | `refused-changes.test.tsx` "CANCEL …"; `web/src/account/refusals.test.ts` "… cancel sends nothing (CANCEL)"                                                  |
| WEB                                            | `refusals.test.ts` "WEB …" (3 tests) and `runDiscard` tests (reload after a discard, none after a failure)                                                   |
| WEB-OFFLINE                                    | `refusals.test.ts` "WEB-OFFLINE …"                                                                                                                           |
| COUNTER                                        | `sync-store.test.ts` "COUNTER discarding a session moves no firearm round count"                                                                             |

## 2. Red, then green

Each layer's tests were written against a stub that threw `not implemented`
(or, for UI, rendered nothing) and run before the code. Logs are kept in the
project files (`notes/942-evidence/`), not in the repo.

| Layer                         | Red                 | Green                                |
| ----------------------------- | ------------------- | ------------------------------------ |
| `discardRefused`              | 8 of 8 failed       | 8 passed                             |
| `badRows`                     | 12 of 12 failed     | 20 passed (after GONE/CTX additions) |
| `badRowTitle`/`confirmParts`  | 4 failed, 12 passed | 16 passed                            |
| phone `applyDiscard`          | 4 of 4 failed       | 57 passed (file)                     |
| phone `readBadRows`           | 2 failed            | 59 passed (file)                     |
| `requestDiscard` (controller) | 7 failed            | 33 passed (file)                     |
| phone `RefusedChanges`        | 7 failed, 1 passed  | all passed                           |
| web `Refusals`                | 9 failed, 1 passed  | all passed                           |

**COUNTER was green from the start.** It guards a Must NOT: nothing in the
discard path touches counters, so there was no code to make it pass. It fails
if a later change routes a discard through the session-delete path that moves
rounds.

## 3. Hand mutants

| Mutant                                                      | Result              |
| ----------------------------------------------------------- | ------------------- |
| `applyDiscardSync` without the transaction                  | killed (PHONE-FAIL) |
| controller: leftover discards not failed when the loop ends | killed              |
| hook: failed list not updated                               | killed              |
| hook: stamp ignores the refusal counts                      | killed              |
| E2E: the discard sends a non-tombstone                      | killed (3 tests)    |
| E2E: the in-memory store skips the local apply              | **survived**        |

The surviving mutant is expected: in the backend E2E the next pull brings
the tombstone anyway, so the local apply is not observable there. The local
apply is covered by `sync-store.test.ts` (PHONE-LOCAL) and the controller's
order test (discard → apply → cycle).

## 4. Stryker

- **`shared/src/sync-client/discard.ts`, `refusal-list.ts`: 100%** (threshold
  95). The repo's Stryker config (`isolate: false`) reported these files as
  "no coverage", because vitest's shared module cache hid the per-test
  coverage. A scratch config with `isolate: true` was used for this run and
  not committed. The first run scored 97.5%; the survivors were equivalent
  guards (removed) and two missing tests (added).
- **`web/src/account/refusals.tsx`: 68.6%** (118 killed, 28 survived, 26 no
  coverage). The pure parts (`discardStep`, `runDiscard`) kill every mutant.
  The survivors are JSX details and click handlers that the web tests cannot
  reach: web tests render static markup and the repo has no DOM testing
  library (adding one needs the maintainer's OK). One survivor (line 89) is
  equivalent. This file is not in `pnpm gauntlet`'s mutate list.
- **The gauntlet as configured fails.** With the repo's config, Stryker
  reports `discard.ts` as no coverage (0%). A full `pnpm mutation` in this
  container scores `shared` at 10.6%, mostly no coverage. The scheduled
  Mutation workflow on `main` has failed every week since 2026-11-02 (54.52%
  on 2026-11-23). So the gate is broken on `main`, not only for this change.
  The 100% above comes from per-file isolation and does not mean the gate
  passes.

## 4a. Review fixes after the report

CodeRabbit's second round found four real gaps. Each got a failing test
first, then the fix:

- a discard still queued at sign-out now fails instead of going out under
  the next session;
- a count refresh that throws no longer leaves the discard unsettled;
- a refused session whose `started_at` isn't a date leaves the date out of
  its title instead of crashing the list (CTX-NODATE);
- on the web, a discard whose reload failed says "Reload the page to see the
  changes." instead of showing the old list as if nothing happened.

## 5. Must NOT

| Constraint                                      | Evidence                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No server, protocol, schema or migration change | `git diff main --stat` touches no `backend/src/`, `shared/src/sync/` or migration file                                                                                                                                                                                                   |
| Marks change only inside `applyDiscard`         | only `applyDiscardSync` calls `applyMarkUpdate` with a `drop`                                                                                                                                                                                                                            |
| No Discard on a waiting row                     | `badRows` lists `invalid` entries only (LIST)                                                                                                                                                                                                                                            |
| No discard alongside a sync cycle               | LOOP                                                                                                                                                                                                                                                                                     |
| No counter move                                 | COUNTER                                                                                                                                                                                                                                                                                  |
| No dependency                                   | no `package.json` or lockfile change                                                                                                                                                                                                                                                     |
| No existing test edited or weakened             | no assertion changed; existing files only gained setup: the `applyDiscard` port on store fakes (`engine.test.ts`, backend specs), `applyDiscard` on the controller test's store mock, a mock of the new hook (`account-screen.test.tsx`), the new `refresh` prop (web `account.test.ts`) |

## 6. Gates and running app

- `pnpm check` green before push (1103 jest, 260 vitest files); docs gates
  (mkdocs `--strict`, translation check, anchors) green; backend
  `sync-client`, `sync-contract`, `sync-family-refusal` suites: 115 passed.
- Running app, local worker, synthetic accounts only: the web Account page
  lists the refused shot, asks, and after Discard the Sync card goes away
  (the held shot is stored). The phone Account & Sync screen (Expo web
  preview) lists the same row with Discard. React Native Web's `Alert` is a
  no-op, so the phone's confirm and discard were not driven in the preview;
  they are covered by `refused-changes.test.tsx` and the controller tests.

## 7. Independent verification

Not performed in this run.
