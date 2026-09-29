# Sync protocol — evidence report

> Old-coder EVIDENCE artifact for the ShotLedger v2 sync backend (ADR 0003).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/sync-protocol-evidence.md`
> Spec: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/sync-protocol-spec.md`

## 0. What this report does and does not buy you

- **Spec approval: not obtained (autonomous run).** The maintainer did not
  review the spec before the code was written. Everything below shows the
  code satisfies **that** spec, including its own recorded deviation from
  the literal branching instruction (spec §0) — it cannot show the spec
  itself asked for the right things. §1's schema-scope decision and §2a's
  cursor-key deviation are the maintainer's calls to make; both are
  recorded as open items in the spec, not resolved by this report.
- **Tier: 3.** See spec header for scope of the old-coder loop
  (`shared/src/sync/` fully; `backend/src/db/` and
  `backend/src/routes/sync.ts` via the integration suite, not
  independently mutation-tested — Stryker only instruments `shared/`).
- **Reproduce:** `pnpm typecheck && pnpm lint && pnpm exec vitest run &&
pnpm coverage && pnpm mutation` from the repo root; `cd backend && pnpm
test` separately (not part of root `pnpm check`, per task instruction
  #5 / the M0 decision).

## 1. Source state and environment

| Item        | Value                                                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch      | `feat/sync-backend`, created from `main` (069a5a0); scaffold restored from `feat/score-x-semantics` (fd875a3) — see spec §0 for the full deviation rationale                                                                       |
| Isolation   | branch, not a fresh worktree — matches spec §0 / M3 precedent (gauntlet needs installed `node_modules`)                                                                                                                            |
| Node / pnpm | v24.12.0 / 11.24.0                                                                                                                                                                                                                 |
| TypeScript  | ~6.0.3 (`tsc -b`, root); backend's own `typescript ^5.5.2` for its wrangler toolchain                                                                                                                                              |
| vitest      | 3.2.7 (root/shared); 4.1.11 (backend, via `@cloudflare/vitest-plugin`)                                                                                                                                                             |
| Stryker     | @stryker-mutator/core 10.0.0 + @stryker-mutator/vitest-runner 10.0.0                                                                                                                                                               |
| Coverage    | @vitest/coverage-v8 3.2.7                                                                                                                                                                                                          |
| Properties  | fast-check 4.9.0                                                                                                                                                                                                                   |
| New deps    | `drizzle-orm ^0.45.2` (backend, dependency), `@shotledger/shared workspace:*` (backend, dependency), `@cloudflare/workers-types ^5.20260831.1` (backend, devDependency — global `D1Database` type for `worker-configuration.d.ts`) |

## 2. Baseline

`shared/`'s pre-existing suite (before this task's `shared/src/sync/`
files) was 207 vitest tests / 11 files, all passing (243 total in the
final run minus this task's 36 tests visible before the R3d addition —
244 total after). No pre-existing failures to hold a line against.
`backend/`'s pre-existing suite was the 2 hello-world tests
(`backend/test/index.spec.ts`), unmodified and still passing.

`app/` is not present in this branch's working tree at all (spec §0), so
root `pnpm check`'s final step (`cd app && pnpm exec jest`) fails with
"can't cd to app" — this is the direct, expected consequence of the
branching deviation, not a regression: everything before that step
(`tsc -b`, `eslint .`, `vitest run`) is green. `app/` is untouched by any
commit on this branch (verified: `git diff --stat main...HEAD -- app` is
empty).

## 3. Spec-to-test mapping

| Spec                            | Test file                                                               | Coverage                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| §2 SyncTableName, schemas       | `shared/src/sync/protocol.test.ts` G1–G2b, C1–C4, CC1–CC4, P1–P4, U1–U5 | table enum incl. negative controls; tombstone/payload invariant both directions; pagination fields; batch cap |
| §2 version handshake            | `shared/src/sync/protocol.test.ts` V1–V4                                | at minimum, above minimum, below minimum (exact error shape), above current                                   |
| §3 R1 create                    | `shared/src/sync/merge.test.ts` R1a, R1b                                | fresh row, fresh already-deleted row                                                                          |
| §3 R2 tombstone-wins            | `shared/src/sync/merge.test.ts` R2a, R2b, PR1                           | rejection + clock-independence + property over arbitrary tombstones/changes/seqs                              |
| §3 R3 LWW via server order      | `shared/src/sync/merge.test.ts` R3a–R3d                                 | live update, delete-over-live, re-delete idempotence, payload-null-on-delete defensiveness                    |
| §3 R4 idempotent re-application | `shared/src/sync/merge.test.ts` R4a, R4b, PR2                           | applied and rejected outcomes both, plus property over arbitrary inputs                                       |
| §4 idempotency                  | `backend/test/sync.spec.ts` S7a                                         | duplicate ack, unchanged seq, next real push consumes exactly one more seq                                    |
| §5 generic storage / pull query | `backend/test/sync.spec.ts` S1, S2, S3a                                 | fresh pull, incremental pull, pagination cap + `hasMore` + second-page tail                                   |
| §6 push conflicts               | `backend/test/sync.spec.ts` S5a (tombstone), S6a (LWW)                  | rejected ack + still-deleted row; two applied pushes collapse to latest payload at latest seq                 |
| §6 version handshake (server)   | `backend/test/sync.spec.ts` S8a, S8b                                    | pull and push both, 409 + `PROTOCOL_VERSION_UNSUPPORTED`, storage untouched                                   |
| §6 auth stub                    | `backend/test/sync.spec.ts` S9a–S9c                                     | missing token on both endpoints; two users never see each other's rows                                        |
| §4 create-and-pull              | `backend/test/sync.spec.ts` S4a                                         | applied ack with seq, row visible on next pull                                                                |

Negative constraints (spec §8):

| Id  | How it is held                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | `protocol.ts`/`merge.ts` import only `zod` and each other — verified by file contents; `pnpm lint`/`tsc -b` pass with no RN/Workers types leaking into `shared/`                        |
| N2  | Full baseline suite (§2) still green: 207 pre-existing shared tests + 2 pre-existing backend tests, unmodified, still passing                                                           |
| N3  | `git diff --stat main...HEAD -- app` is empty                                                                                                                                           |
| N4  | `devBearerAuthenticator` reads only the request header; no `~/cloud/agents/` path referenced anywhere in the diff (grep confirmed)                                                      |
| N5  | `backend/package.json`'s `test` script is unchanged (`vitest run`); root `package.json`'s `check` script is unmodified (still `vitest run` at root scope, no `backend` inclusion added) |

## 4. Gauntlet

All numbers below are from one fresh run after the last code edit.

| Layer                     | Command                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full test suite (root)    | `pnpm exec vitest run`                                      | **PASS** — 12 files, **244 tests passed, 0 failed** (baseline 207 + this task's 37 new: 24 protocol + 13 merge)                                                                                                                                                                                                                                                                                                                                                                   |
| Full test suite (backend) | `cd backend && pnpm test`                                   | **PASS** — 2 files, **14 tests passed, 0 failed** (baseline 2 + this task's 12 new)                                                                                                                                                                                                                                                                                                                                                                                               |
| Static types              | `pnpm typecheck` (`tsc -b`)                                 | **PASS** — exit 0, no output                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Lint                      | `pnpm lint` (`eslint .`)                                    | **PASS** — exit 0, no output                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Format                    | `pnpm exec prettier --check .`                              | Pre-existing failures only (vendored old-coder skill docs, `plan.md`, `renovate.json5`, `docs/reference/spsf-shb-2026.md`, `docs/implementation-plan.md`, JSON discipline definitions — none touched by this task). Every file this task wrote or edited is prettier-clean (verified individually with `prettier --write` on the exact file list, then reconfirmed green by rerunning the full suite above). `format` is not part of `pnpm check` (§1 of the implementation plan) |
| Coverage (gate)           | `pnpm coverage`                                             | **PASS** — statements/branches/functions/lines **100%** (745/745, 275/275, 66/66, 745/745) over `shared/src/scoring/**` + `shared/src/disciplines/**` + `shared/src/sync/**`. Threshold enforced (proved in M3's evidence report on this same mechanism; unchanged here)                                                                                                                                                                                                          |
| Mutation (tool)           | `pnpm mutation` (Stryker)                                   | **PASS overall** — score **98.14%** (631 killed, 2 timeout, 12 survived, break threshold 95). **`shared/src/sync/` specifically: 100.00% — 50/50 killed, 0 survived** (`merge.ts` 25/25, `protocol.ts` 25/25). The 12 survivors are all pre-existing, in `shared/src/disciplines/` and `shared/src/scoring/` (M3/M5 code, untouched by this task)                                                                                                                                 |
| Property-based            | inside the vitest run                                       | 2 fast-check properties in `merge.test.ts` (PR1: tombstone-wins holds for arbitrary tombstoned rows/changes/seqs; PR2: repeat-call determinism), 100 cases each by default                                                                                                                                                                                                                                                                                                        |
| Real execution            | `backend/test/sync.spec.ts` via `@cloudflare/vitest-plugin` | **PASS** — this _is_ real execution: requests go through Hono's router, the auth middleware, and a real local D1 binding (SQLite under the Workers runtime), not a mock. No separate manual smoke test was layered on top; the integration suite already exercises the actual `wrangler dev`-equivalent runtime                                                                                                                                                                   |
| Supply chain              | `cd backend && pnpm audit --prod`                           | 2 moderate advisories (`uuid <11.1.1`, `decode-uri-component <=0.4.2`), both transitive through `app>...` dependency paths already present in the restored `pnpm-lock.yaml` (same two advisories M3's evidence report recorded on `feat/m2-shell`, unrelated to this task). This task's own new dependencies (`drizzle-orm`, `@shotledger/shared`, `@cloudflare/workers-types`) introduce none                                                                                    |
| Suite health              | `pnpm exec vitest run --sequence.shuffle`                   | **PASS** — 244/244 in randomized order, no order dependence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Complexity                | reviewed by hand                                            | Largest new function is `applyPushChange` (idempotency check, merge, one upsert, one idempotency write — each a single `await`). `mergeChange` is one function with two `if`/return branches. No function needs a paragraph to explain                                                                                                                                                                                                                                            |

### Surviving mutants outside `shared/src/sync/`

All 12 survivors are pre-existing (M3/M5 code this task did not touch) and
were already recorded/classified as equivalent in `docs/specs/m3-scoring-evidence.md`
and the M5 equivalent report; not reproduced here to avoid re-litigating
work this task didn't do. `shared/src/sync/` itself: **0 survivors**.

## 5. Checker negative controls

- `SyncTableNameSchema` (protocol.test.ts G2, G2b) — `'settings'`,
  `'session_tags'`, and `'not_a_table'` all rejected, proving the enum
  actually constrains membership rather than accepting anything.
- `PushResponseSchema` (protocol.test.ts U5) — an unknown ack `status`
  value (`'bogus'`) is rejected, proving the status enum is enforced.
- `mergeChange` R2b — the incoming change's `updatedAt` is set to a date
  decades **after** the tombstone's, and the merge still rejects it; this
  is the negative control for "the rule does not fall back to comparing
  timestamps" — if it did, this specific test would flip to `applied` and
  fail.
- `mergeChange` R3d — `mergeChange` is called directly with a
  schema-violating `ClientChange` (payload non-null despite `deletedAt`
  set), bypassing the zod refine entirely, and still stores a null
  payload — proving the merge function's own defensiveness isn't merely
  an artifact of every other fixture already being schema-valid (this is
  exactly what Stryker's `ConditionalExpression` mutant on that line
  needed to be caught by; before this test was added, that mutant
  survived — see below).

## 6. What changed mid-task (spec drift, recorded per the loop's rules)

- The Stryker mutation run against `shared/src/sync/merge.ts` initially
  surfaced one survivor: `payload: change.deletedAt === null ?
change.payload : null` mutated to always take the `change.payload`
  branch, undetected because every test fixture that sets `deletedAt`
  also already sets `payload: null` (the same invariant the zod schema
  enforces on real traffic). Added `merge.test.ts` R3d, which calls
  `mergeChange` directly with an invariant-violating `ClientChange` to
  prove the ternary is load-bearing on its own. Rerunning the full
  mutation suite afterward confirms `shared/src/sync/` at 100.00%/50
  killed/0 survived (§4). This is the only implementation-affecting
  finding from the gauntlet; no other code changed after GREEN.
- Two off-by-one bugs in the integration test fixtures themselves (not
  production code) were caught by `cd backend && pnpm test` before the
  first passing run: (1) a UUID test helper generating non-hex characters,
  rejected by `z.uuid()`, and (2) a `token: string | undefined = DEFAULT`
  helper parameter where explicit `undefined` silently fell back to the
  default instead of producing "no token sent", both fixed in
  `backend/test/sync.spec.ts` before any implementation code changed.
