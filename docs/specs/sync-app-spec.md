# Sync client (app side) — executable specification

> Old-coder SPEC artifact for the ShotLedger v2 **client** sync engine,
> accounts, and photo upload (ADR 0003).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/sync-app-spec.md`
> Evidence report: `docs/specs/sync-app-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** The maintainer did not
> review this spec before implementation, matching the header convention of
> `sync-protocol-spec.md` and `backend-auth-photos-spec.md`. Confidence
> claims in the evidence report are bounded accordingly; this document is the
> artifact reviewed after the fact.

Tier: **3.** The client engine decides what leaves the device and what
overwrites local rows. A wrong outbox clear silently drops a logbook entry
that the user believes is backed up; a wrong apply overwrites a scored
session. Both failures are invisible until the second device is opened.

Scope of the old-coder loop: **`shared/src/sync-client/`** — every merge,
ordering, batching, cursor, backoff, ack-handling and photo-queue decision
lives there as a pure function or a port-driven orchestrator with injected
I/O. `app/src/features/sync/`, `app/src/features/account/` and
`app/src/platform/` hold **only adapters** (expo-sqlite, `fetch`,
SecureStore, expo-image-manipulator) and are covered by the end-to-end
integration suite, not by mutation testing — the precedent set by
`sync-protocol-spec.md` §7 (route wiring) and `backend-auth-photos-spec.md`
§ scope note.

## 0. Setup plan (what approving this authorizes)

- **Branch:** `feat/sync-app`, branched from `origin/feat/webshooter-app`
  (the current v2 stack tip), in a dedicated worktree.
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths
  staged (never `-A`/`.`), branch pushed, **no PR opened, nothing merged**,
  `main` never touched.
- **No new dependencies.** Everything needed is already in
  `app/package.json`: `expo-secure-store` (session token),
  `expo-image-manipulator` (client-side resize), `expo-constants`
  (`extra.apiBaseUrl`), `uuidv7` (client change ids), `drizzle-orm`,
  `expo-file-system` (photo download target). `shared/` adds nothing beyond
  the `zod` it already depends on. `backend/` is unchanged except for the
  one route-wiring line in §8. **If any dependency had been required it
  would have been reported, not added** (CLAUDE.md hard rule 2).
- **No deployment.** `wrangler deploy` is never run. The integration suite
  (§9) runs the real Worker inside `@cloudflare/vitest-plugin`'s Workers
  pool, in-process — no `wrangler dev` server, no network, no Cloudflare
  account touched.
- **Gauntlet wiring:** `shared/src/sync-client/**` is added to
  `vitest.config.ts` coverage `include` (100% threshold) and to
  `stryker.config.json` `mutate`.
- **Files the gauntlet adds, by path:**
  - `shared/src/sync-client/{ports,order,outbox,engine,backoff,status,photo-queue,index}.ts`
    and one `*.test.ts` beside each non-trivial module.
  - `app/src/db/schema.ts` (edit: four client-only tables, §2),
    `app/src/db/migrations/0004_*.sql` + journal/barrel entries.
  - `app/src/db/queries/sync-store.ts` (SQLite adapter),
    `app/src/db/queries/sync-store.test.ts`.
  - `app/src/features/sync/{transport,photo-transport,use-sync,sync-controller}.ts`.
  - `app/src/features/account/{auth-client,use-account}.ts`.
  - `app/src/platform/secure-store.ts` (edit: session-token accessors),
    `app/src/platform/photo-resize.ts`.
  - `app/src/constants/backend.ts`, `app/app.json` (edit: `extra`).
  - `app/src/app/account.tsx`, `app/src/app/(tabs)/settings.tsx` (edit: one
    row), `app/src/i18n/{en,sv}.json` (edit).
  - `backend/src/index.ts` (edit: §8), `backend/test/sync-client.spec.ts`.
  - `docs/specs/sync-app-evidence.md`, `CLAUDE.md`,
    `docs/implementation-plan.md`, `docs/release.md`.

## 1. What the backend actually exposes (checked, not assumed)

Read from `backend/src/` on `feat/webshooter-app`, not from the plan:

- `POST|GET /api/auth/*` — better-auth's own handler. `emailAndPassword:
{ enabled: true }` and the `bearer()` plugin. **No social providers are
  configured** (`backend/src/auth/better-auth.ts` carries a TODO where
  `socialProviders` would go, because that needs OAuth registrations only
  the maintainer can create). The client therefore implements **email +
  password only**. Sign-in with Apple/Google is _not_ built — inventing a
  provider the backend does not have would produce a button that cannot
  work.
- The endpoints the client uses: `/api/auth/sign-up/email`,
  `/api/auth/sign-in/email`, `/api/auth/sign-out`, `/api/auth/get-session`.
  The session token arrives in the **`set-auth-token` response header**
  (bearer plugin), not a cookie — confirmed by `backend/test/photos.spec.ts`.
- `POST /sync/pull`, `POST /sync/push` — the protocol in
  `shared/src/sync/protocol.ts`.
- `POST /photos/upload/:photoId`, `GET /photos/:photoId`,
  `DELETE /photos/:photoId`, `GET /photos/usage`.
- `POST /account/delete` with `{ dryRun }`.

## 2. Change capture — trigger-backed outbox, not an `updated_at` scan

The task brief asks which of the two the protocol's basis is. **Neither
alone works**, and the reasoning is the load-bearing design decision here:

- A pure `updated_at` cursor scan cannot distinguish a row the user just
  edited from a row this device _applied from the server a second ago_.
  Re-pushing applied rows is not merely wasteful: device A pushes, B pulls
  and re-pushes, A pulls and re-pushes — a permanent ping-pong that never
  reaches quiescence. Any fix requires marking applied rows, i.e. extra
  per-row state, i.e. the thing an outbox already is.
- A hand-written outbox enqueue in every write path would mean editing
  ~30 modules under `app/src/db/queries/`, and ADR 0003's guardrail —
  "local write + outbox enqueue happen in ONE SQLite transaction" — would
  then rest on 30 separate call sites each remembering to do it. The first
  forgotten one is silent data loss.

**Decision: SQLite `AFTER INSERT` / `AFTER UPDATE` triggers on the nine
synced tables write the outbox entry.** A trigger body executes inside the
caller's transaction by construction, so the ADR guardrail is satisfied
mechanically rather than by convention, and no existing query module is
touched. Applied-from-server writes are excluded by a guard flag the apply
path sets (below), so the ping-pong above cannot occur.

New client-only tables (`app/src/db/schema.ts`, migration `0004`):

```
sync_outbox   table_name TEXT, row_id TEXT, PRIMARY KEY(table_name, row_id),
              rev INTEGER NOT NULL,          -- monotonic local revision
              client_change_id TEXT NULL     -- assigned on first push attempt
sync_state    table_name TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0
sync_control  id INTEGER PRIMARY KEY CHECK (id = 0),   -- singleton
              applying INTEGER NOT NULL DEFAULT 0,     -- 1 while applying pulled rows
              last_rev INTEGER NOT NULL DEFAULT 0
photo_queue   id TEXT PRIMARY KEY, kind TEXT ('upload'|'download'),
              photo_id TEXT NOT NULL, local_uri TEXT NULL,
              attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NULL,
              created_at TEXT NOT NULL
```

Trigger shape, identical for each of the nine tables T in
`SYNC_TABLE_NAMES` and for both INSERT and UPDATE:

```sql
CREATE TRIGGER sync_outbox_T_insert AFTER INSERT ON T
WHEN (SELECT applying FROM sync_control WHERE id = 0) = 0
BEGIN
  UPDATE sync_control SET last_rev = last_rev + 1 WHERE id = 0;
  INSERT INTO sync_outbox (table_name, row_id, rev, client_change_id)
    VALUES ('T', new.id, (SELECT last_rev FROM sync_control WHERE id = 0), NULL)
  ON CONFLICT(table_name, row_id) DO UPDATE
    SET rev = excluded.rev, client_change_id = NULL;
END;
```

Consequences that are deliberate, not oversights:

- **Coalescing is free.** Five edits to one row leave one outbox entry; the
  push sends the row's _current_ state, which is exactly what LWW wants.
- **`rev` is the concurrency guard.** The push reads `(table, row, rev)`,
  and on ack deletes `WHERE table_name = ? AND row_id = ? AND rev = ?`. A
  local edit that lands _while_ the push is in flight bumps `rev`, so the
  delete matches nothing and the row stays queued for the next cycle. `rev`
  comes from a never-reset counter (`sync_control.last_rev`), so a re-queued
  entry can never accidentally carry a stale `rev` value.
- **`client_change_id` is reset to NULL on re-queue** and assigned once per
  push attempt of a given `rev`, then persisted. A retry after a dropped
  response replays the same id, which the server acks `duplicate` (protocol
  §4) instead of applying twice. A _new_ local edit gets a _new_ id, which is
  correct — it is a genuinely new change.
- **Soft deletes need no DELETE trigger**: the schema tombstones via
  `UPDATE ... SET deleted_at`, which the UPDATE trigger already catches.
  **Hard deletes are deliberately not captured** — the only hard-deleting
  code in the app is `wipeDemoData` (dev-only). Declared limit, §11.
- `shot_marks`, `session_tags`, `settings` and the vault tables are **not**
  synced: `SYNC_TABLE_NAMES` (protocol §1) does not list them, and inventing
  a tenth table name the server's zod enum rejects would fail every push.
  Declared limit, §11.

## 3. Ports (`shared/src/sync-client/ports.ts`)

The engine is pure orchestration over two injected ports. Nothing else in
`shared/` learns that SQLite or `fetch` exist (negative constraint N1).

```ts
export interface OutboxEntry {
  tableName: SyncTableName;
  rowId: string;
  rev: number;
  clientChangeId: string | null;
}
export interface LocalRowSnapshot {
  payload: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LocalStore {
  readCursors(): Promise<Record<SyncTableName, number>>;
  setCursor(tableName: SyncTableName, cursor: number): Promise<void>;
  applyChanges(changes: ChangeRow[]): Promise<void>; // one transaction, guard flag set
  readOutbox(limit: number): Promise<OutboxEntry[]>;
  pendingRowKeys(): Promise<ReadonlySet<string>>; // shadowing, §5a
  readRow(tableName: SyncTableName, rowId: string): Promise<LocalRowSnapshot | undefined>;
  assignClientChangeId(e: OutboxEntry, id: string): Promise<void>;
  clearOutboxEntry(e: OutboxEntry): Promise<void>; // rev-matched delete
  pendingCount(): Promise<number>;
}

export interface SyncTransport {
  pull(request: PullRequest): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
}
```

`newId()` (uuid) and `now()` are injected too, so every test is
deterministic and no module in `shared/` reads a clock.

## 4. Apply order (`shared/src/sync-client/order.ts`)

`APPLY_ORDER` fixes the nine table names in foreign-key dependency order:

```
firearms, ammo_lots, tags, licenses, firearm_groups,
maintenance_events, sessions, series, shots
```

- `sortChangesForApply(changes)` — stable sort by `APPLY_ORDER` index, then
  by `seq`. Parents are inserted before children within a single apply, so
  the FK constraints the local schema declares hold. Stability matters: two
  changes to the same table must stay in `seq` order, because the later one
  is the winner.
- `APPLY_ORDER` is asserted at test time to be a permutation of
  `SYNC_TABLE_NAMES` — a table added to the protocol without being ordered
  here fails the suite rather than silently never syncing.
- The pull request lists tables in `APPLY_ORDER` too, and the engine drains
  every table to `hasMore: false` before applying, so a parent created in
  the same cycle as its child is always present first.

## 5. The cycle (`shared/src/sync-client/engine.ts`)

`runSyncCycle(deps): Promise<SyncCycleResult>` — strict **pull → apply →
push → ack**, never concurrent (ADR guardrail). One call = one cycle.

1. **Pull.** Repeat: send `PullRequest` with the current cursor for every
   table still marked `hasMore` (all nine on the first iteration); apply the
   sorted page via `applyChanges`; write each returned `nextCursors[].cursor`.
   Stop when no table reports `hasMore`. A hard cap of
   `MAX_PULL_ITERATIONS = 100` pages guards against a server that always
   answers `hasMore: true` — the cycle ends with `status: 'partial'` rather
   than spinning forever.
2. **Push.** Repeat while the outbox is non-empty and pages remain:
   `readOutbox(PUSH_BATCH_MAX)`; for each entry `readRow`; build the
   `ClientChange` (§6); `assignClientChangeId` when the entry has none;
   `push`; for every ack, `clearOutboxEntry`. Cap at
   `MAX_PUSH_ITERATIONS = 100` for the same reason.
3. Return `{ status: 'ok' | 'partial', pulled, pushed, rejected, duplicates }`
   or throw — the caller (§7) turns a throw into `status: 'error'`.

**Cursor is only advanced after `applyChanges` resolves.** If the apply
throws, the cursor is not written, so the next cycle re-pulls the same page.
Re-applying a page is idempotent (every apply is an upsert keyed by row id),
so at-least-once delivery is safe; at-most-once would not be.

### 5a. Local-edit shadowing (added during implementation)

The cycle pulls before it pushes, so a page can carry the server's _older_
state for a row this device has edited but not yet sent. Writing it over the
local row destroys the user's edit — and the push that follows then sends the
overwritten value back up, so the edit is gone from **both** devices with no
error anywhere. The end-to-end suite reproduced this on the first run (I3's
delete never reaching device B).

So: `runPull` reads `store.pendingRowKeys()` before each apply and drops any
pulled change for a row with a queued outbox entry
(`shared/src/sync-client/shadow.ts`). The local version survives, is pushed
later in the same cycle, and the server's own LWW makes it the winner for
everyone. The cursor still advances past the shadowed change — re-pulling it
would only re-deliver the value the local push has already superseded.

**One consequence, handled explicitly.** If the shadowed change was a
_tombstone_ and the push is then rejected (`tombstoned`), nothing would ever
re-deliver it: the cursor has moved past it. So a `rejected` ack whose reason
is `REJECTED_TOMBSTONED` makes the engine apply a locally-synthesised
tombstone for that row (`tombstoneFromRejection`). Its `deletedAt` is the
device's own edit timestamp rather than the server's — a local marker only,
written inside the apply guard so it never re-enters the outbox and never
travels. Both devices agree on the fact that matters: the row is deleted.

**A push page is never partially cleared on transport failure**: acks are
processed only after `push` resolves. A change whose response was lost stays
in the outbox with its `client_change_id` intact and is retried, landing on
the server's idempotency table.

## 6. Building a `ClientChange` (`shared/src/sync-client/outbox.ts`)

`buildClientChange(entry, row, id)`:

- `row === undefined` → `null`. The row was hard-deleted locally; there is
  nothing to send. The caller drops the outbox entry.
- `row.deletedAt !== null` → `{ payload: null, deletedAt: row.deletedAt }`.
  The protocol's `ClientChangeSchema` refines that `payload` is null exactly
  when `deletedAt` is set; sending the row body with a tombstone would be a
  400 for the whole batch.
- otherwise → `{ payload: row.payload, deletedAt: null }`.
- `updatedAt` is always `row.updatedAt` — informational per protocol §2, and
  never used by the server to order anything.

`ackDisposition(ack)` → `'clear'` for `applied`, `duplicate` **and**
`rejected`. A `rejected` ack means the server holds a tombstone for that row
(the only rejection the protocol defines); keeping it queued would retry a
change that can never be accepted. The tombstone itself reaches this device
through the _next_ pull — its `seq` is newer than this device's cursor by
construction, because the cursor was written before the push that lost.

## 7. Scheduling, status and offline (`sync-controller.ts`, app side)

A single module-level controller, so "no concurrent independent loops" is
enforced by having exactly one loop:

- `requestSync(reason)` — if a cycle is running, it sets a _rerun_ flag and
  returns; the running cycle re-runs once on completion. Otherwise it starts
  one. This is the debounce and the mutex in one mechanism.
- **Triggers:** app foreground (`AppState` `change` → `active`), a
  400 ms-debounced signal after any local write (the sync screen and the
  controller both call `notifyLocalWrite()`; the outbox trigger has already
  recorded the change, so a missed notification only delays, never drops),
  and the manual "Sync now" button.
- **Never blocks the UI:** every entry point is fire-and-forget; the screen
  subscribes to the controller's status snapshot.
- **Offline / error:** a failed cycle sets `status: 'error'` with a stable
  error key (`network`, `unauthenticated`, `versionUnsupported`, `unknown`)
  and schedules a retry after `nextBackoffMs(attempt)`
  (`shared/src/sync-client/backoff.ts`): `min(base * 2^attempt, maxMs)`,
  `base = 2_000`, `maxMs = 300_000`, deterministic (no jitter — one device
  per user, so there is no thundering herd to spread, and determinism is
  worth more in tests). `attempt` resets to 0 on any success.
  `unauthenticated` does **not** schedule a retry: it clears the stored
  token and asks the user to sign in again; retrying a dead session forever
  would burn battery for nothing.
- `SyncStatus` (`status.ts`) is a pure reducer over
  `{ state, lastSyncedAt, pendingCount, errorKey, attempt }`. Pure so the
  screen's rendering is testable without a device.
- **Signed out = engine never runs.** The app is fully usable with no
  account; the outbox keeps accumulating rows harmlessly and is flushed on
  the first sync after sign-in.

## 8. Backend change (one line, deliberately minimal)

`createSyncRoutes()` has no default authenticator (#532): every mount names
one. `backend/test/sync.spec.ts` passes `devBearerAuthenticator` for its
bare-token fixtures, and **`backend/src/index.ts` mounts it with
`betterAuthAuthenticator`**:

```ts
app.route('/sync', createSyncRoutes(betterAuthAuthenticatorFor));
```

This is the cutover `backend-auth-photos-spec.md` §9 flagged for an explicit
maintainer decision. Taking it here is not optional: with the dev stub
mounted, any bearer string is accepted verbatim as a user id, so a real app
shipping against it would let anyone read anyone's logbook by guessing a
user id. Flagged in the evidence report as a deviation that changes another
spec's declared limit.

## 9. Test plan / gauntlet scope

**`shared/src/sync-client/*.test.ts`** — Tier-3: 100% coverage
(`pnpm coverage`), mutation (`pnpm mutation`), fast-check properties.

- E1 fresh device: empty cursors → pull applies every change, cursors land
  on the returned values.
- E2 pagination: `hasMore: true` drives a second pull with the advanced
  cursor; only tables still `hasMore` are re-requested.
- E3 apply throws → cursor unchanged, cycle reports error, next cycle
  re-pulls the same page (at-least-once).
- E4 push batches at `PUSH_BATCH_MAX`; a second page follows.
- E5 acks: `applied`/`duplicate`/`rejected` all clear; a transport throw
  clears nothing.
- E6 `clientChangeId` is assigned once and replayed on retry.
- E7 outbox entry whose row is gone is dropped without being sent.
- E8 tombstone entry sends `payload: null`.
- E9 `MAX_PULL_ITERATIONS` / `MAX_PUSH_ITERATIONS` terminate with
  `status: 'partial'`.
- E10 a pulled change for a row with a queued local edit is dropped
  (`shadowed`), the cursor still advances, and a `tombstoned` rejection
  writes the local tombstone (§5a). A rejection with an unrecognized reason
  writes nothing.
- **Property (fast-check):** for any generated set of changes,
  `filterShadowedChanges` returns an order-preserving subset containing no
  shadowed key. **Property:** for any generated set of changes,
  `sortChangesForApply` (a) is a permutation of its input, (b) never places
  a child table's change before a parent table's, (c) preserves `seq` order
  within a table.
- **Property:** `nextBackoffMs` is monotonically non-decreasing in `attempt`
  and never exceeds `maxMs`, paired with a unit test that attempt 0 is
  exactly `base` (so a mutant returning a constant `maxMs` still dies).
- **Property:** `buildClientChange` never returns a change with both a
  non-null payload and a non-null `deletedAt` — i.e. it always satisfies the
  server's `ClientChangeSchema.refine`, asserted by parsing the result.
- Photo queue: `selectNextUpload` prefers the oldest non-exhausted entry;
  `applyUploadResult` retires on success, increments on retryable failure,
  and marks `failed` at `MAX_PHOTO_ATTEMPTS = 5`; a `413`/`quota_exceeded`
  is **not** retryable (retrying a too-large photo forever is a battery bug).

**`app/src/db/queries/sync-store.test.ts`** (root vitest, better-sqlite3 via
`createTestDb`) — the adapter and, crucially, the triggers:

- T1 inserting a firearm queues exactly one outbox row.
- T2 five updates to one row leave one outbox row, with a rising `rev`.
- T3 a write performed with `applying = 1` queues nothing.
- T4 `clearOutboxEntry` with a stale `rev` deletes nothing.
- T5 `applyChanges` upserts a create, tombstones a delete, and leaves the
  outbox empty afterwards.
- T6 a tombstone for a row this device has never seen is a no-op, not a
  crash.
- T7 `readRow` on a soft-deleted row reports `deletedAt`.

**`backend/test/sync-client.spec.ts`** (Workers pool — the real Worker, real
D1, real better-auth, in-process) — the end-to-end requirement:

- I1 sign-up returns a bearer token; the transport authenticates with it.
- I2 **two simulated devices**, each with its own in-memory `LocalStore`,
  same account: device A creates a session + two series; A syncs; B syncs; B
  holds the identical rows.
- I3 B edits the session, syncs; A syncs; A sees B's edit (LWW through the
  server).
- I4 **delete both ways**: A tombstones a series and syncs; B syncs and the
  row is tombstoned locally. Then B tombstones the session, syncs; A syncs
  and sees it.
- I5 tombstone-wins across devices: B (offline) edits a row A has already
  deleted; B syncs — the push is `rejected: tombstoned`, B's outbox is
  cleared, and B's next pull tombstones the row locally.
- I6 a second account cannot see the first account's rows.
- I7 idempotency: a push whose response is dropped, replayed, acks
  `duplicate` and creates no second row.

## 10. Must NOT (negative constraints)

- N1 `shared/` imports nothing from React Native, Expo, Cloudflare or
  `node:*` — `sync-client` imports only `../sync` and `zod`.
- N2 No existing test regresses; the 14 `backend/test/sync.spec.ts` cases and
  every `app/src/db/queries/*.test.ts` still pass unmodified.
- N3 No PII, credential, token or real photo enters the tree. Test accounts
  are `device-a@example.invalid` style synthetic addresses; the only
  configured URL is the `https://api.shotledger.app` placeholder.
- N4 Nothing is deployed. `wrangler deploy` is not run, and no Cloudflare
  account is contacted.
- N5 No new dependency is installed in any package.
- N6 The app stays fully usable signed-out; no screen requires an account to
  render, and no local write path can fail because sync is unavailable.

## 11. Known limits (declared, not hidden)

- **Hard deletes are not synced** (§2). `wipeDemoData` is dev-only; a
  production hard delete would leave the server row alive. Adding DELETE
  triggers is possible but a hard-deleted row has no payload to send, so the
  correct fix is "the app never hard-deletes", which is already true outside
  the dev screen.
- **`settings`, `session_tags`, `shot_marks` and the vault do not sync** —
  the protocol's table enum excludes them (protocol spec §1, still marked
  VERIFY for the maintainer). Photo _scoring marks_ therefore do not travel
  with a synced session; the score does.
- **One local write can be pushed twice as two changes** if it is edited
  again mid-push. Both are accepted; the later `seq` wins. Correct, slightly
  chatty.
- **No conflict UI.** LWW is resolved silently, per ADR 0003 ("one user, two
  devices, LWW-per-row: the hard part doesn't exist here").
- **Photo download is best-effort**: a pulled `series.photo_uri` points at a
  file that exists only on the origin device until the download queue
  fetches it. Until then the series renders without its photo rather than
  blocking.
- **The web build cannot sync.** `app/src/db/client.web.ts` exposes a null
  `db`; the Account & sync screen renders its sign-in form but reports sync
  as unavailable there, matching the existing Webshooter posture.
- The server-side `sync_sequence` concurrency race documented in
  `sync-protocol-spec.md` §5 is inherited unchanged; the client's
  single-loop discipline (§7) is exactly the client-side assumption that
  spec relies on, now actually implemented.
