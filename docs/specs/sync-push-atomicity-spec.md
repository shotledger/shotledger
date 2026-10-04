# Sync push atomicity — executable specification

> Old-coder SPEC for #536. Evidence report, once written:
> `docs/specs/sync-push-atomicity-evidence.md`.
>
> **Approval status: NOT YET OBTAINED.** No production code is written
> until the maintainer approves this document.

- **Tier: 3.** Concurrency and data loss: two devices on one account can
  lose an edit, resurrect a deleted row, or leave a third device permanently
  out of step with the server.
- **Scope:** `applyPushChange` in `backend/src/db/queries.ts` and its one
  caller in `backend/src/routes/sync.ts`. The protocol (`shared/src/sync/`),
  the client (`shared/src/sync-client/`) and the D1 schema do not change.

## 1. The bug, reproduced on `main`

`applyPushChange` makes five awaited D1 calls per change: idempotency read,
row read, `allocateSequence`, upsert, idempotency insert. A throwaway probe
in the Workers pool paused push A before its k-th call, ran push B to
completion, then resumed A. Results against today's code:

| A pauses before call k                      | Two rows: does a mid-way puller see both? | Same row: stored vs acks | Live edit A vs delete B: row deleted? |
| ------------------------------------------- | ----------------------------------------- | ------------------------ | ------------------------------------- |
| 0–1 (before reads)                          | yes                                       | B@1, A@2, stored A@2     | yes                                   |
| 2 (after row read)                          | yes                                       | B@1, A@2, stored A@2     | **no — A resurrected it**             |
| 3 (after `allocateSequence`, before upsert) | **no — r1 at seq 1 skipped by cursor 2**  | **A@1, B@2, stored A@1** | **no — A resurrected it**             |
| 4–5 (after upsert)                          | yes                                       | A@1, B@2, stored B@2     | yes                                   |

So there are three concurrency failures, not two. The third, tombstone
resurrection (rule R2 broken), is not in the issue. A crash before call 4
leaves the row written with no idempotency record. The retry then applies
the change again under a fresh seq (issue failure 3).

## 2. Ordering rule: server order, not `updatedAt`

The issue proposes `WHERE excluded.updated_at > sync_rows.updated_at`,
"tie-break as `mergeChange` does". **`mergeChange` has no timestamp
comparison and no tie-break.** R3 is last writer wins _by server order_.
ADR 0003's first guardrail is "never trusted client clocks", and
`merge.ts` says "no client timestamp is ever compared".

This spec keeps server order. Allocating the seq and writing the row in one
serialized transaction makes seq order equal commit order. "Last writer" is
then the commit with the highest seq, and no guard on `updated_at` is
needed. "The older edit wins" (issue failure 2) is read as: **the stored row
is not the change with the highest seq acked `applied` for it.** That is the
k=3 row above.

Switching to `updatedAt` would contradict an accepted ADR. It would also
need a client change: a push that loses on timestamp clears its outbox
entry, and the client then never re-pulls the winner. See Q1.

## 3. Design

**One D1 `batch()` per push request.** D1 runs a batch as one SQL
transaction, sequentially and without interleaving (§6). Each change
contributes four statements, and every decision is made in SQL against the
state inside the transaction, so nothing is read before the transaction
starts. Parameters: `?1` user, `?2` clientChangeId, `?3` table, `?4` rowId,
`?5` payload, `?6` updatedAt, `?7` deletedAt.

```
NOT_DUP := NOT EXISTS (idempotency record for ?1, ?2)
OK      := ?7 IS NOT NULL OR NOT EXISTS (row ?1/?3/?4 with deleted_at IS NOT NULL)   -- R2

1. SELECT status, seq, reason FROM sync_idempotency WHERE (?1, ?2)       -- pre-state: duplicate?
2. INSERT INTO sync_sequence SELECT ?1, 1 WHERE NOT_DUP AND OK
     ON CONFLICT(user_id) DO UPDATE SET last_seq = last_seq + 1
3. INSERT INTO sync_rows SELECT ?1, ?3, ?4, (SELECT last_seq …), ?5, ?6, ?7 WHERE NOT_DUP AND OK
     ON CONFLICT(pk) DO UPDATE SET seq, payload, updated_at, deleted_at = excluded.*
4. INSERT INTO sync_idempotency SELECT ?1, ?2,
     CASE OK 'applied'/'rejected', CASE OK last_seq/NULL, CASE OK NULL/'tombstoned'
     WHERE true ON CONFLICT DO NOTHING RETURNING status, seq, reason
```

- **Ack.** If statement 1 returns a record, the ack is `duplicate` with that
  record's seq or reason. Otherwise the ack is statement 4's `RETURNING`
  row.
- **Idempotency is atomic.** The record and the row commit together or not
  at all, so no crash can leave one without the other.
- **A rejected change keeps its record.** The record is written with
  `rejected`/`tombstoned` and no seq is consumed.
- **`OK` cannot change during the four statements.** An applied delete sets
  `?7` non-null, an applied live edit leaves the row live, and a rejected
  change writes nothing.
- **`mergeChange` stays the specification of the rule.** The backend no
  longer calls it, and test C5 pins the SQL to it case by case.
- **Rejected alternative:** read the row, call `mergeChange`, then a
  compare-and-swap batch with a retry loop. It has more moving parts and
  still needs SQL guards.

## 4. Scenarios

User `u`, table `firearms`, `updatedAt` `2026-08-01T00:00:00.000Z` unless
stated. "Call k" means the k-th call the push makes on the D1 binding,
through the gate wrapper (§7).

```gherkin
Feature: concurrent pushes to one account converge

  Scenario: C1 the pull cursor never skips a committed row
    Given an empty account u
    When push A {r1 make "A"} pauses before call k, for every k from 0 to A's call count
     And push B {r2 make "B"} runs to completion
     And device C pulls firearms from cursor 0
     And A resumes and completes, and C pulls again from its returned cursor
    Then C has received r1 and r2 for every k
    # main fails: k=3, C receives only r2, and r1 is stored at seq 1 < cursor 2

  Scenario: C2 the stored row is the applied change with the highest seq
    Given an empty account u
    When push A {r1 "A"} pauses before call k, push B {r1 "B"} completes, C pulls,
         A completes, C pulls again
    Then stored r1 has the payload and seq of whichever applied ack has the higher seq
     And C's last-seen r1 equals stored r1
    # main fails: k=3, acks A@1 B@2, stored A@1

  Scenario: C3 a delete is never undone by a racing live edit
    Given r1 stored live "X" at seq 1
    When push A {r1 live "A"} pauses before call k, push B {r1 deletedAt 2026-08-02} completes,
         A completes
    Then r1 is deleted for every k
     And A's ack is either applied with a seq below B's, or rejected/"tombstoned"
    # main fails: k=2 and k=3, r1 is live "A"

  Scenario: C4 a crash leaves the push either fully applied or not applied
    Given an empty account u
    When push {c1, r1 "A"} fails at call k, either before or after the call executes
    Then sync_rows, sync_sequence and sync_idempotency equal the pre-push state or the clean post-push state
    When the client retries c1
    Then the state equals a clean single push: r1 "A" at seq 1, last_seq 1, one record applied@1
     And the retry acks applied@1, or duplicate@1 if the first attempt committed
    # main fails: crash before call 4, retry acks applied@2

  Scenario Outline: C5 the SQL merge agrees with mergeChange
    Given r1 is <existing>
    When a push sends r1 as <incoming>
    Then the ack status and the stored row equal mergeChange(<existing>, <incoming>)
    Examples:
      | existing          | incoming | status            |
      | absent            | live     | applied           |
      | absent            | deleted  | applied           |
      | live at seq 1     | live     | applied, seq 2    |
      | live at seq 1     | deleted  | applied, seq 2    |
      | deleted at seq 1  | live     | rejected tombstoned |
      | deleted at seq 1  | deleted  | applied, seq 2    |

  Scenario: C6 one push holds several changes to one row
    Given an empty account u
    When one push sends [c1 create r1, c2 edit r1, c1 again, c3 delete r1, c4 live r1, c5 re-delete r1]
    Then the acks are applied@1, applied@2, duplicate@1, applied@3, rejected/tombstoned, applied@4
     And last_seq is 4
     And replaying c4 acks duplicate with reason "tombstoned" and no seq

  Scenario: C7 a rejected change consumes no seq
    Given r1 deleted at seq 2
    When a live edit to r1 is rejected and then {r2 "B"} is pushed
    Then r2 acks applied@3
    # main: applied@4, because allocateSequence runs before the merge

  Scenario: C8 concurrent HTTP pushes converge (stress, supplementary)
    Given two devices on u, each with 10 rounds of Promise.all pushes and pulls over rows r1..r3
    Then each device's applied pulls equal a fresh full pull at the end
```

C1–C4 are RED against `main` (shown in §1). C6 and C7 are RED on `main`
only because a rejection consumes a seq there (c5 acks applied@5). C5
already passes on `main`. It is kept as regression armor, and a throwaway
mutant proves it can fail. C8 is non-deterministic. It is evidence that the
interleaving tests are not a lab artefact, not a RED gate.

## 5. Must NOT

- N1 `PROTOCOL_VERSION` stays 1 (hard rule 8). `shared/src/sync/` and
  `shared/src/sync-client/` are byte-for-byte unchanged.
- N2 Request and response shapes, status codes and ack fields do not change.
- N3 S1–S9 (`backend/test/sync.spec.ts`), I1–I7
  (`backend/test/sync-client.spec.ts`), and the account and photo suites
  pass **unmodified**.
- N4 No D1 schema or migration change. The design uses existing columns and
  primary keys.
- N5 No client clock is compared (ADR 0003), unless Q1 rules otherwise.
- N6 No new dependency.

**Wire behaviour that does change (pre-1.0, no version bump):**

1. A rejected change no longer consumes a seq. Seq values after a
   rejection are one lower than today. Clients only compare seqs.
2. A push is all or nothing. Today, if D1 fails mid-push, the changes before
   the failure stay applied. After this change none are applied. The
   response is still 500, and the client retries the same `clientChangeId`s.
3. Under concurrent pushes, seq order equals commit order.

## 6. Verified facts about D1 (sources)

- `batch()` is one SQL transaction: "Batched statements are SQL
  transactions … If a statement in the sequence fails … it aborts or rolls
  back the entire sequence." Statements in a batch "execute and commit,
  sequentially, non-concurrently"
  (developers.cloudflare.com/d1/worker-api/d1-database/#batch). A D1
  database "is inherently single-threaded, and processes queries one at a
  time" (…/d1/platform/limits/).
- Probed in this repo's Workers pool:
  - a failing second statement rolled back the first statement's counter
    insert;
  - a later statement read `last_seq` written by an earlier one in the
    same batch;
  - `INSERT … SELECT … WHERE <guard> ON CONFLICT DO UPDATE` parses, and a
    false guard writes nothing;
  - a leading `SELECT` sees the pre-batch state;
  - `ON CONFLICT DO NOTHING RETURNING` returns the row only when it was
    inserted;
  - the full design (§3) produced C6's acks exactly.
- Drizzle `db.batch` (0.45.3) maps onto D1 `batch()`. It accepts query
  builders, including `insert().select(sql…).onConflictDoUpdate(…)`. It
  does **not** accept `db.run(sql)`, which throws inside `batch`.
  `db.transaction()` fails on D1 because D1 refuses `BEGIN`.
- Two awaited query loops in the pool interleave statement by statement
  (`A0 B0 A1 B1 A2 B2`). The race is real in the test runtime. Its timing
  over HTTP is not controllable, which is why C1–C4 use a gate.
- D1 requires exactly as many bindings as the highest `?N` in the statement
  ("Wrong number of parameter bindings"), so each statement binds its own
  prefix.

## 7. Setup plan (what approval authorizes)

- **Isolation:** branch `fix/sync-push-atomicity` in a git worktree off
  `origin/main`, with dependencies installed there and the gauntlet run
  there.
- **Git:** Conventional Commits, `git commit -s`, explicit paths only.
  Checkpoint commits come in this order: this spec; a pure refactor
  extracting `applyPush(db, userId, changes)` as a loop over today's code
  (S1–S9 green, no behaviour change); RED tests; GREEN; evidence. Push and
  open the PR (`Closes #536`) only after evidence.
- **Files:**
  - `backend/src/db/queries.ts`: `applyPushChange` is replaced by
    `applyPush`, and `allocateSequence` and `findExistingRow` are deleted.
  - `backend/src/routes/sync.ts`: one `applyPush` call.
  - `backend/test/gated-d1.ts`: a D1 binding wrapper that pauses, or
    fails before or after, call k. It fails closed: every test asserts that
    the wrapper saw at least one call, and that each k was either reached
    or lies beyond the push's call count.
  - `backend/test/sync-concurrency.spec.ts`: C1–C8.
  - `scripts/manual-mutation-sync-push.mjs`: the mutation layer, modelled
    on `scripts/manual-mutation.mjs`, with one row added to the README's
    scripts table.
  - `docs/specs/sync-push-atomicity-evidence.md`.
- **New dependencies:** none.

## 8. Gauntlet

| Layer                 | How                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend suite         | `cd backend && npx vitest run --testTimeout=60000`: S1–S9, I1–I7 and C1–C8                                                                                                                                                                                                                                                                                                                                       |
| Root gates            | `pnpm check` (types, lint, format, shared coverage)                                                                                                                                                                                                                                                                                                                                                              |
| Concurrency           | C1–C4 enumerate **every** pause or crash point k for both orders (A first, B first). This is exhaustive over a small finite space and replaces random property tests, so `fast-check` is not added to `backend/`                                                                                                                                                                                                 |
| Mutation              | `node scripts/manual-mutation-sync-push.mjs`, fail-closed, ≥ 8 hand-picked bugs that must all be killed: drop `NOT_DUP` from 2 or 3; drop `OK` from 2 or 3; invert the status `CASE`; `IS NOT NULL` → `IS NULL` in `OK`; drop `deleted_at` from the `DO UPDATE`; drop the pre-read (duplicates ack `applied`); split the batch back into awaited statements. Stryker cannot reach code that only runs in workerd |
| Changed-line coverage | **Unavailable** in the Workers pool: v8 coverage does not run in workerd, and istanbul is a new dependency (Q3). Substituted by the mutation layer, which has one mutant per SQL guard and per ack branch                                                                                                                                                                                                        |
| Real execution        | I1–I7 drive the real `runSyncCycle` against the real Worker, D1 and better-auth                                                                                                                                                                                                                                                                                                                                  |
| Suite health          | backend suite with `--sequence.shuffle`, run three times                                                                                                                                                                                                                                                                                                                                                         |
| Adversarial pass      | a 500-change push (`PUSH_BATCH_MAX`, 2000 statements in one batch); the same `clientChangeId` twice in one push; a push whose batch throws (nothing persists)                                                                                                                                                                                                                                                    |

## 9. Risks

- **Batch size.** A full push is 2000 statements in one transaction. D1
  documents per-statement limits, but no per-batch statement cap was found.
  The adversarial pass measures it in the local pool only. If it fails, the
  push is split into chunks, which is still atomic per change. That would
  be recorded as a revision.
- **"Queries per Worker invocation" (1000 paid, 50 free).** The docs do not
  say whether a batch counts once. Today a full push already makes about
  2500 queries, so this design is no worse either way, and much better if a
  batch counts once. See Q2.
- **The rule lives in two places.** R2 is written in SQL and in
  `mergeChange`. C5 and the `OK` mutants hold them together.
- **Local is not production.** All evidence comes from local workerd D1.
  The transaction guarantee is taken from Cloudflare's documentation, not
  observed in production.
- **The gate depends on Drizzle internals** (`prepare().bind().all/run/raw`
  and `batch`). If Drizzle changes them, the wrapper throws rather than
  passes.

## 10. Open questions

- **Q1** Keep LWW by server order as ADR 0003 and R3 state, which is this
  spec's recommendation? Or switch to `updatedAt` as the issue words it,
  which needs a new ADR and a client change?
- **Q2** Is the deployed Worker on the Workers Free plan? At 50 queries per
  invocation, today's push breaks at about 10 changes. Whether a batch
  counts once then decides whether pushes must be chunked.
- **Q3** Add `@vitest/coverage-istanbul` to `backend/` for a real
  changed-line coverage layer? It is a new dependency. Default: no, use
  the substitution in §8.

## Revisions

- (none yet)
