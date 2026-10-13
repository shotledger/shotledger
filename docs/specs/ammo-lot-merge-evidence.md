# Evidence report: merge duplicate ammo lots (Tier 3)

Spec: [`ammo-lot-merge-spec.md`](ammo-lot-merge-spec.md).

- **Spec approval:** given by the maintainer on 2026-10-13 ("yes, do that",
  in reply to "The code starts once you approve the spec"), M1–M9 as written.
  The spec has no revisions.
- **Source state:** commit `ed2f613` on `feature/issue-784-merge-ammo-lots`.
  The numbers below come from one run on that commit. After merging `main`
  (#779, the schema cleanup) the branch re-ran `pnpm check` (3739 tests,
  coverage still 100%) and W1–W4 (4/4); nothing in the merge changes a
  module under test here.
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (Node 24.21.0,
  vitest 5.0.3, Stryker 10.0.0, fast-check 4.10.2, TypeScript 6.0.2; backend
  vitest with `@cloudflare/vitest-plugin`).
- **Entry points:** `pnpm check`;
  `cd backend && npx vitest run test/web-ammo-merge.spec.ts --testTimeout=60000`;
  `npx stryker run --mutate shared/src/sync-client/ammo-lot-merge.ts,web/src/bulk/merge.ts`;
  `node scripts/manual-mutation-ammo-merge.mjs`.
- **Independent verification:** not performed.

## Failure model

| Way this can hurt                                                   | Layer that catches it                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A session is left on the deleted lot, or a session elsewhere moves  | A1, K1, K8 (independent oracle), P1, W1                                                                                                   |
| A deleted session is rewritten (the server would refuse it)         | A2, K3, K8; manual mutants "deleted sessions are repointed too" (×2)                                                                      |
| The kept lot absorbs or loses something (M2)                        | A3 (row byte-for-byte unchanged), K2 (no change for it), W1                                                                               |
| A rewritten session drops a column, or one this build does not know | K1 (`future_column` survives), W1 (`location` arrives intact)                                                                             |
| The web writes something other than the phone's own merge           | P1 (twin databases: `mergeAmmoLots` vs the web's changes applied)                                                                         |
| A merge half-lands                                                  | Phone: one SQLite transaction (A4: nothing written on error). Web: one push, one D1 transaction; K6 refuses over 500 instead of splitting |
| A lost response, retried, writes twice                              | W2 (replay: every change `duplicate`, no new seq), U2                                                                                     |
| The phone queues nothing, so the merge never syncs                  | A5 (one outbox entry per moved session and one for the lot)                                                                               |
| A web change is re-queued by the phone that applies it              | P2                                                                                                                                        |
| An offline edit after the merge resurrects the duplicate (M8)       | W3 (rejected `tombstoned`)                                                                                                                |

## Scenario → test

| Scenario | Test                                                                                                                                 | Result |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| A1–A6    | `app/src/db/queries/ammo-lots.test.ts` › `mergeAmmoLots (…)` › A1…A6                                                                 | pass   |
| K1–K7    | `shared/src/sync-client/ammo-lot-merge.test.ts` › K1…K7                                                                              | pass   |
| K8       | same file › `K8 applied, no live session is left on the duplicate, and nothing else changes` (fast-check, 300 runs)                  | pass   |
| P1, P2   | `app/src/db/queries/web-ammo-merge.test.ts`                                                                                          | pass   |
| W1–W4    | `backend/test/web-ammo-merge.spec.ts` (Workers pool, real D1 and better-auth)                                                        | pass   |
| U1–U3    | `web/src/bulk/merge.test.ts`                                                                                                         | pass   |
| N1       | No migration, no protocol or endpoint change (diff: no file under `app/src/db/migrations/`, `backend/src/`, `shared/src/sync/`)      | holds  |
| N2       | K2, K8, A1, A3                                                                                                                       | pass   |
| N3       | K1                                                                                                                                   | pass   |
| N4       | `web/src/bulk/apply.test.ts` › "N1 no shooting data in browser storage" (scans every file in `web/src/bulk/`, the new ones included) | pass   |
| N5       | No existing test edited: against `main` the test diff removes no line; `ammo-lots.test.ts` only gains imports and a `describe` block | holds  |

## Gauntlet

| Layer                                           | Command                                                                                                  | Result                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite, types, lint, format, i18n, licenses | `pnpm check`                                                                                             | exit 0; 3734 tests passed                                                                                                                                                                                                                                                                                                    |
| Coverage (gauntlet globs)                       | in `pnpm check` (`vitest run --coverage`, threshold 100%)                                                | statements 5139/5139, branches 3453/3453, functions 1210/1210, lines 4334/4334                                                                                                                                                                                                                                               |
| Backend round trip                              | `npx vitest run test/web-ammo-merge.spec.ts`                                                             | 4/4 passed                                                                                                                                                                                                                                                                                                                   |
| Mutation (Stryker)                              | `npx stryker run --mutate …ammo-lot-merge.ts,…merge.ts`                                                  | 227/227 killed, score 100% (builder 45/45, panel 182/182). A first run left 6 survivors in `web/src/bulk/merge.ts`; three were checks no caller can reach (removed), one a missing test (a lot with no `caliber` key, added), two the duplicate-id check that the push's single `ammo_lots` change makes redundant (removed) |
| Manual mutation                                 | `node scripts/manual-mutation-ammo-merge.mjs`                                                            | 11/11 killed: four on the phone's `mergeAmmoLots` (outside Stryker's globs), three against the K8 property alone, two against the twin test alone, two on the panel                                                                                                                                                          |
| Negative control (runner)                       | the same script, on a mutant whose pattern matched twice                                                 | failed closed: "matched 2 times (expected exactly 1)"                                                                                                                                                                                                                                                                        |
| Property tests                                  | K8, fast-check                                                                                           | 300 runs, pass                                                                                                                                                                                                                                                                                                               |
| Docs gates                                      | `mkdocs build --strict`; `node scripts/docs-anchor-check.mjs`; `node scripts/docs-translation-check.mjs` | built clean; no dangling anchors; 27 translated pages current                                                                                                                                                                                                                                                                |
| Supply chain                                    | dependency diff                                                                                          | no dependency added or removed                                                                                                                                                                                                                                                                                               |

## Real execution

Screenshots stay in the session; none are in the repository. Demo or
synthetic data only.

- **Phone UI, in the app's web preview** (Expo web behind the COI proxy, demo
  data): the lot screen shows **Merge Into Another Lot** below Save; it opens
  a picker of the four other lots (label · caliber); picking one opens the
  confirmation ("Move 1 session from “SK Pistol Match” to “SK Pistol Match
  Special” and delete “SK Pistol Match”? Its quantity and notes are not
  carried over."); **Merge** returns to the list, where the duplicate is gone
  and the kept lot shows the moved session.
- **Web panel, against `wrangler dev` with the built web app:** a synthetic
  account with three lots and four sessions. The Duplicate picker lists the
  three lots with caliber and session count; Keep omits the chosen duplicate;
  **Merge** shows the same confirmation; confirming says "Moved 2 sessions
  and deleted the duplicate." and the refreshed pickers show the kept lot
  with 3 sessions. No console errors (the CSP included).
- **Not run:** the Android emulator (no Android SDK in this environment).
  The phone UI uses only existing cross-platform components
  (`OptionPicker`, `ConfirmSheet`, `SecondaryButton`).

## Confidence

The approved spec's behaviours each map to a passing test, and every new
module is at 100% coverage and 100% mutation score. What this does not show:
how the phone screen looks on a real Android device, and the straggler cases
of M7/M8 beyond the server's half (W3, W4).
