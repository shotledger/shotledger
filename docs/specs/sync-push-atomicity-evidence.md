# Sync push atomicity — evidence report (Tier 3)

> Old-coder EVIDENCE for #536. Spec:
> `docs/specs/sync-push-atomicity-spec.md`.

- **Spec approval:** obtained. "Approved 2026-10-04 (maintainer-delegated
  review), with revisions 1–5". Revision 6 (scenario C9) was added during
  implementation and is recorded in the spec. It adds a test and changes no
  approved scenario.
- **Source state:** `009493dbcd25638c999e1f441da25339ecaf5246` on
  `fix/sync-push-atomicity`. All numbers below come from fresh runs on this
  commit. This report is the only later change, and it is docs only.
- **Toolchain:** Node v24.12.0, pnpm 12.8.2, vitest 4.1.11 with
  `@cloudflare/vitest-plugin` 1.3.4 (backend), drizzle-orm 0.45.3. All
  pinned in `pnpm-lock.yaml`, which is unchanged.
- **Entry point:**
  `pnpm check && (cd backend && npx vitest run) && node scripts/manual-mutation-sync-push.mjs`.
- **Isolation:** a git worktree off `origin/main` with its own
  `pnpm install --frozen-lockfile`. No ignored or untracked files feed the
  backend suite.
- **Independent verification:** not performed on the implementation. The
  spec had an independent review; the code did not.

## Summary

- One push is now one D1 `batch()`, which runs as one transaction. Seq
  allocation, the row write and the idempotency record commit together.
- The tombstone rule is a SQL guard evaluated inside that transaction.
- On `main`, three races and a crash-retry fault were reproduced
  deterministically. All of them now pass:
  - the cursor skipping a row;
  - the lower-seq edit winning;
  - a racing live edit undoing a delete;
  - a crash and retry applying the change a second time.
- A 500-change push is one batch of 2000 statements and took **200–299 ms**
  in the local pool, against the spec's 10 s threshold. **No chunking was
  needed.**

## Spec → test mapping

All tests are in `backend/test/sync-concurrency.spec.ts` unless named
otherwise.

| Scenario                                   | Test                                                                                                                                                                                | Status |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1 the cursor never skips a committed row  | `C1 … a device pulling while A is paused at any call still receives both rows`                                                                                                      | pass   |
| C2 the stored row has the highest seq      | `C2 … two devices editing one row …`                                                                                                                                                | pass   |
| C3 a delete is never undone                | `C3 … a live edit racing a delete leaves the row deleted`                                                                                                                           | pass   |
| C4 crash: pre or post state, clean retry   | `C4 … fail-before …`, `C4 … fail-after …`                                                                                                                                           | pass   |
| C5 the SQL merge agrees with `mergeChange` | `C5 …` (6 cases)                                                                                                                                                                    | pass   |
| C6 several changes to one row in one push  | `C6 … acks each change against the state the earlier ones left`                                                                                                                     | pass   |
| C7 a rejected change consumes no seq       | `C7 …`                                                                                                                                                                              | pass   |
| C8 concurrent HTTP pushes converge         | `C8 …` (supplementary, non-deterministic)                                                                                                                                           | pass   |
| C9 a stale retry never overwrites (rev. 6) | `C9 …`                                                                                                                                                                              | pass   |
| Adversarial: 500-change push in one batch  | `ADV1 a 500-change push applies every change at seqs 1..500`; it also asserts that the gate saw exactly 1 D1 call                                                                   | pass   |
| Adversarial: the same id twice in one push | C6 (`c1 again` acks `duplicate@1`)                                                                                                                                                  | pass   |
| Adversarial: a batch that throws           | C4 `fail-before` at call 0: the state equals the pre-push state                                                                                                                     | pass   |
| §3 throw when statements 1 and 4 are empty | No test reaches it: the state is unreachable in one transaction (revision 1)                                                                                                        | n-a    |
| N1 protocol and client unchanged           | `git diff --stat origin/main -- shared/` is empty                                                                                                                                   | pass   |
| N2 response shapes unchanged               | S1–S9 and I1–I7 pass unmodified; acks are compared with `toStrictEqual` in C4–C7 and C9                                                                                             | pass   |
| N3 S1–S9 and I1–I7 unmodified and passing  | `git diff --stat origin/main` over `sync.spec.ts`, `sync-client.spec.ts`, `account.spec.ts` and `photos.spec.ts` is empty; 12 `sync.spec.ts` and 9 `sync-client.spec.ts` tests pass | pass   |
| N4 no schema or migration change           | `git diff --stat origin/main` over `backend/migrations`, `schema.ts` and `migrations.ts` is empty                                                                                   | pass   |
| N5 no client clock compared                | No SQL guard or JavaScript branch reads `updated_at` or `updatedAt`; it is only stored                                                                                              | pass   |
| N6 no new dependency                       | `package.json`, `backend/package.json` and `pnpm-lock.yaml` are unchanged against `origin/main`                                                                                     | pass   |

**RED evidence** (commit `4eadcdb`, tests on today's code):

- C1 failed when A paused before call 3: the puller saw only `r2`.
- C2 failed when A paused before call 3: A was acked at seq 1 and B at
  seq 2, but the row stored A at seq 1.
- C3 failed when A paused before call 2: `deletedAt` was null.
- C4 failed in both modes: `fail-before` at call 3 and `fail-after` at
  call 2 left a bumped counter with no row and no record.
- C6 and C7 failed on seq values, because a rejection consumed a seq.
- ADV1 failed because the push made 2500 D1 calls instead of 1.
- C5 and C8 passed on `main`. C5 was then run alone against a throwaway
  mutant (`deleted_at IS NOT NULL` → `IS NULL`), and 3 of its 6 cases
  failed. C9 passes on `main`; its RED is the mutant
  "a duplicate rewrites the row".

## Gauntlet (final fresh runs on `009493d`)

| Layer                  | Command                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend suite          | `cd backend && npx vitest run`                             | 9 files, **80 passed**, 0 failed. Baseline: 64 tests, of which 38 are in five `test/*.spec.ts` files (`sync` 12, `photos` 12, `sync-client` 9, `account` 3, `index` 2) and 26 are in three `src/lib/*.test.ts` files (`quota` 11, `rate-limit` 9, `authz` 6). New: the 16 in `sync-concurrency.spec.ts`. Confirmed with `npx vitest list`. No timeout was raised, and nothing ran with `--testTimeout` |
| Root gates             | `pnpm check`                                               | exit 0; vitest 140 files / 2440 passed; jest 579 passed; typecheck, lint, format, schema, i18n and licenses all green                                                                                                                                                                                                                                                                                  |
| Concurrency            | C1–C4 in the suite above                                   | Every pause point k is enumerated until it lies past the push's last call, so both orders are covered: B first at k = 0, A first once k passes the last call. Crash points are enumerated in both modes. Each loop asserts that at least one call index was reached and that the gate saw a call                                                                                                       |
| Mutation               | `node scripts/manual-mutation-sync-push.mjs`               | **12/12 killed**. A baseline pass is required first. A mutant that breaks the run without failing a test aborts the script                                                                                                                                                                                                                                                                             |
| Changed-line coverage  | —                                                          | **Substituted**: no coverage provider runs in workerd, and Q3 ruled out istanbul. The mutation layer has one mutant per SQL guard, per `CASE` branch, per ack branch and for the batch boundary. It cannot detect a dead line that no mutant touches                                                                                                                                                   |
| Property-based         | —                                                          | **Substituted** by exhaustive enumeration of pause and crash points (C1–C4) and the full 3×2 merge table (C5)                                                                                                                                                                                                                                                                                          |
| Real execution         | `backend/test/sync-client.spec.ts` (I1–I7)                 | Pass. `runSyncCycle` and the real HTTP transport run against the real Worker, D1 and better-auth                                                                                                                                                                                                                                                                                                       |
| Suite health           | `cd backend && npx vitest run --sequence.shuffle`, 3 times | Seeds 1791118623294, 1791118639642, 1791118652867: 80/80 passed each time                                                                                                                                                                                                                                                                                                                              |
| Supply chain & secrets | `git diff --stat origin/main`                              | No dependency or lockfile change and no secret in the diff. No new capability: no network, filesystem or env use in `src/`                                                                                                                                                                                                                                                                             |
| Complexity             | by hand                                                    | `changeStatements` builds four statements and makes no decision. `toAck` has three branches. `applyPush` makes one batch call and one map                                                                                                                                                                                                                                                              |

### The 12 mutants (all killed)

1. A duplicate bumps the seq counter.
2. A rejected change bumps the seq counter.
3. A duplicate rewrites the row.
4. A live edit resurrects a tombstone.
5. `applied` and `rejected` are swapped in the record.
6. The tombstone test looks for live rows.
7. A delete over a live row leaves it live.
8. An update keeps the old seq, below the puller's cursor.
9. The ack reports a seq one past the row.
10. Duplicates are not detected from the pre-read.
11. The batch is split back into separately awaited statements.
12. A delete is stored with its payload.

## Checker negative controls

- **Mutation script.** Its first run exited 1 with mutant 3 alive. That is
  the fail-closed path, observed rather than assumed. C9 was added in
  response (spec revision 6). Every mutant must match its pattern exactly
  once, and `git status` confirms the file is restored after each mutant.
- **Gate (`backend/test/gated-d1.ts`).** The RED run is its negative
  control. With the gate in place, today's code failed at exactly the call
  indices §1 of the spec predicted (3 for C1 and C2, 2 for C3). That proves
  the gate parks the push where it claims to. ADV1's
  `gate.calls() === 1` fails on `main` with 2500, which proves the call
  counter counts.

## Layers not run as specified

- **SUBSTITUTED:**
  - Changed-line coverage is replaced by the mutation layer. It cannot see a
    line no mutant touches.
  - Property-based tests are replaced by exhaustive enumeration. It covers
    one interleaving between two pushes, not three or more pushes.
- **UNAVAILABLE:** Stryker. It runs in the root Node pool and cannot load
  workerd-only code.
- **Known limits:**
  - All evidence comes from local workerd D1. Production D1's transaction
    guarantee is taken from Cloudflare's documentation.
  - The 500-change timing is local only.
  - C8 is non-deterministic and supplementary.
  - `tsc -b` leaves six compiled test files in `backend/dist/`. `vitest.config.mts` excludes `dist/**`, and `npx vitest list` shows none of them collected.
  - A change that can never commit, for example one past D1's row size limit, now blocks the whole push rather than only itself. The end state is a stuck outbox either way, so this is not a regression, and spec §9's chunking would bound it.

## What changed mid-task

- **Spec revision 6.** C9 was added after the first mutation run (above).
- **Test rename.** The 500-change case was named `A1`, which collided with
  an account-deletion test. It is now `ADV1`, with no assertion change.
