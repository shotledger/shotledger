# Merge duplicate ammo lots — executable specification

> Old-coder SPEC for #784 (split out of #301): merge two ammo lots that are
> really the same lot, on the **phone and the web together**. Decision
> record: ADR 0019 ("Merge duplicate ammo lots" row of its write table).
> Open questions it settles: `docs/specs/web-bulk-edit-spec.md` §6.
> Evidence report: `docs/specs/ammo-lot-merge-evidence.md` (after code).
>
> **Approval status: approved by the maintainer on 2026-10-13** ("yes, do
> that", in reply to "The code starts once you approve the spec"), M1–M9 as
> written.

- **Tier: 3.** It repoints synced `sessions` rows and tombstones a synced
  `ammo_lots` row that other devices reference. A wrong payload replicates to
  every device; a tombstone is terminal for its id.
- **Scope:**
  - phone: `mergeAmmoLots` in `app/src/db/queries/ammo-lots.ts`; a **Merge
    Into Another Lot** action on the lot screen
    (`app/src/app/ammo/[id]/index.tsx`), using the existing `OptionPicker`
    and `ConfirmSheet`;
  - shared: `shared/src/sync-client/ammo-lot-merge.ts` (new, pure builder for
    the web's push);
  - web: a **Merge Ammo Lots** panel on the Bulk Edit page
    (`web/src/bulk/merge*.ts`, one block in `bulk.tsx`);
  - `ammo.merge*` and `web.bulk.merge*` strings in `app/src/i18n/{en,sv}.json`;
  - tests: `app/src/db/queries/ammo-lots.test.ts`,
    `app/src/db/queries/web-ammo-merge.test.ts`,
    `backend/test/web-ammo-merge.spec.ts`, builder and page-model tests;
  - `docs/manual/guides/firearms-and-ammunition{,.sv}.md` and
    `editing-many-sessions-on-the-web{,.sv}.md`; ADR 0019 consequences
    gain one bullet (the straggler case, M7).

## 1. Settled inputs (not re-asked)

1. ADR 0019: the web pushes whole rows through `/sync/push`, online only, one
   action is one push, same per-row last-write-wins as a second phone. Its
   write table fixes the rows: every session on the duplicate repointed to
   the kept lot, then the duplicate tombstoned.
2. Parity (CLAUDE.md rule 11): the web adds no capability the phone lacks, so
   the phone ships the same merge in the same PR.
3. The phone already turns a `tombstoned` rejection of its own push into a
   local tombstone (`tombstoneFromRejection`, `shared/src/sync-client/shadow.ts`).
4. Pre-1.0 (hard rule 8): no schema change, no protocol change, no new column
   such as `merged_into`.

## 2. Key choices (for approval)

**M1. A merge is "repoint, then tombstone". Nothing else changes.** Every
_live_ session whose `ammo_lot_id` is the duplicate gets the kept lot's id and
`updated_at = now`. The duplicate gets `deleted_at = updated_at = now`. The
kept lot's row is not written.

**M2. The kept lot absorbs nothing** (issue's proposal). Its quantity, notes,
caliber, purchase date and load fields stay as they are; the duplicate's are
dropped with it. The user fixes the quantity by hand. The confirmation says
so. _Alternative:_ add the quantities. Not recommended: "quantity" is
whatever the user last typed (boxes bought, rounds left), so a sum is often
wrong, and the merge would then also write the kept lot's row, widening the
race in M8.

**M3. Deleted sessions are left alone.** A tombstoned session keeps its old
`ammo_lot_id`: a tombstone is terminal, the server would reject the edit, and
nothing reads a deleted session's lot.

**M4. Any two different live lots may merge.** No caliber or handload check:
the lot picker shows each lot's label and caliber, and the confirmation names
both lots and the session count. A lot with no sessions may be merged (it is
then simply removed); this is not a separate Delete action.
_Alternative:_ allow only the same caliber. Not recommended: a lot with no
caliber set is common, and the user is the judge of "the same lot".

**M5. The phone: from the duplicate's own screen.** The lot screen gains
**Merge Into Another Lot** below Save. It opens a picker of every other live
lot (label · caliber), then a confirmation: _"Move N sessions from ‘A’ to ‘B’
and delete ‘A’? ‘A’s quantity and notes are not carried over."_ Confirm runs
`mergeAmmoLots(db, duplicateId, keptId)` in one SQLite transaction and goes
back to the list; the outbox triggers queue the rows as for any edit. No lot
other than the duplicate offers itself; with no other live lot the button is
hidden.

**M6. The web: a panel on Bulk Edit.** The web has no ammo page, and ADR 0019
files the merge under bulk edit. The panel has two pickers — **Duplicate**
and **Keep** — each listing the live lots (label · caliber · N sessions), and
**Merge**. Apply pulls `sessions` and `ammo_lots` afresh, builds one push,
and reports as Bulk Edit does (offline blocks it, a network or sign-out
failure holds the request for an identical Retry, an answered push
refreshes). More than `PUSH_BATCH_MAX` (500) changes is refused before
sending, naming the number, as bulk edit's B3; the phone has no such limit
because its outbox batches. Same confirmation text as the phone.

**M7. A straggler session names a deleted lot; it renders as no lot**
(the issue's open question 2). A phone that edits or creates a session on the
duplicate offline and pushes after the merge wins that row (last-write-wins),
so the session names the tombstoned lot. The FK holds (tombstones are soft).
It shows as today for any deleted lot: no lot on the phone's session screen
(`getAmmoLot` skips deleted lots), "–" on the web; editing the session lets
the user pick the kept lot. Nothing repairs it automatically: no device
knows which lot the duplicate went into without a new column (§1.4).
_Alternative:_ a `merged_into` column so readers follow the link. Not
recommended for one user pre-1.0; ADR 0019 gains the consequence instead.

**M8. An offline edit to the duplicate after the merge is lost** (the issue's
open question 3, as proposed). The server rejects it as `tombstoned`; the
phone tombstones the lot locally (§1.3). Same as between two phones. Two
crossed merges (A into B on one device, B into A on another, both offline)
leave both lots deleted and their sessions as in M7; accepted for the same
reason.

**M9. No new dependency.**

## 3. Design

### 3.1 Phone (`app/src/db/queries/ammo-lots.ts`)

```ts
mergeAmmoLots(db, duplicateId, keptId) →
  { ok: true; moved: number } | { ok: false; error: 'sameLot' | 'unknownLot' }
```

One `db.transaction`: verify both live and different, `UPDATE sessions SET
ammo_lot_id = kept, updated_at = now WHERE ammo_lot_id = dup AND deleted_at
IS NULL`, then `softDeleteAmmoLot(dup)`. Returns how many sessions moved.

### 3.2 Builder (`shared/src/sync-client/ammo-lot-merge.ts`, pure)

```ts
buildAmmoLotMerge(duplicateId, keptId, { sessions, ammoLots }, deps) →
  { ok: true; changes: ClientChange[]; moved: number }
  | { ok: false; errors: MergeError[] }
MergeError = sameLot | unknownLot (either not live) | tooManyChanges(max, needed)
```

A moved session is `{ ...pulled, ammo_lot_id: kept, updated_at: now }`
(unknown keys survive). The duplicate is a tombstone change (`payload: null`,
`deletedAt = updatedAt = now`). Changes in `APPLY_ORDER` (the `ammo_lots`
tombstone, then `sessions`); the push is one D1 transaction, so the order is
not observable, and a pulling device sorts by table anyway (`order.ts`).

### 3.3 Web page (`web/src/bulk/`)

`merge-model.ts` (pure): the lot options with session counts, the
confirmation numbers, and the apply deps; `merge-apply.ts` follows
`apply.ts`'s held-request and outcome rules (reused where the types allow).

| Outcome              | Message                                          |
| -------------------- | ------------------------------------------------ |
| applied              | Moved N sessions to ‘B’ and deleted ‘A’          |
| applied, refused     | … R changes were refused (deleted elsewhere)     |
| duplicate gone       | ‘A’ was already deleted on another device        |
| network / signed out | as Bulk Edit: **Retry** resends the held request |
| builder error        | same lot / lot no longer here / too many changes |

## 4. Scenarios

Every scenario maps 1:1 to a named test.

```gherkin
Feature: phone merge (app/src/db/queries/ammo-lots.test.ts)
  Scenario: A1 live sessions on the duplicate move to the kept lot with updated_at now; others untouched
  Scenario: A2 a deleted session on the duplicate keeps its lot (M3)
  Scenario: A3 the duplicate is soft-deleted; the kept lot's row is byte-for-byte unchanged (M2)
  Scenario: A4 same lot → sameLot; an unknown or deleted lot → unknownLot; nothing written
  Scenario: A5 the outbox holds one sessions change per moved session and one ammo_lots change (triggers)
  Scenario: A6 getAmmoLotUsage of the kept lot equals the sum of both lots' usage before

Feature: builder (shared/src/sync-client/ammo-lot-merge.test.ts)
  Scenario: K1 each live session on the duplicate is its pulled payload with ammo_lot_id = kept, updated_at = now; unknown keys survive
  Scenario: K2 the duplicate is one tombstone change; no change for the kept lot or any other row
  Scenario: K3 a session with deleted_at in its payload is not written
  Scenario: K4 same lot → sameLot; either lot absent or deleted → unknownLot
  Scenario: K5 a duplicate with no sessions: only the tombstone
  Scenario: K6 over PUSH_BATCH_MAX → tooManyChanges(max, needed); exactly 500 allowed
  Scenario: K7 every change parses with ClientChangeSchema, fresh ids, rowId = id, in APPLY_ORDER
  Scenario: K8 property: over a random logbook, applying the built changes leaves no live session on the duplicate, the same set of sessions per lot otherwise, and touches nothing else

Feature: on the phone's schema (app/src/db/queries/web-ammo-merge.test.ts)
  Scenario: P1 web changes applied with applyChangesSync give the same sessions and lots as mergeAmmoLots on a twin
  Scenario: P2 nothing applied is re-queued (outbox empty after apply)

Feature: round trip (backend/test/web-ammo-merge.spec.ts, Workers pool, real D1)
  Scenario: W1 a merge pushed by the web is pulled by a second device: sessions on the kept lot, duplicate tombstoned
  Scenario: W2 resending the same request answers duplicate for every change
  Scenario: W3 a later push editing the duplicate is rejected tombstoned (M8)
  Scenario: W4 a later push of a session naming the duplicate is accepted (M7)

Feature: page model (web/src/bulk/merge*.test.ts)
  Scenario: U1 the options: live lots only, label · caliber · live session count; Keep excludes the chosen Duplicate
  Scenario: U2 offline blocks Merge; network/sign-out holds the request; Retry resends it identically
  Scenario: U3 an answered push refreshes; outcome text per §3.3
```

**Must NOT:** N1 no schema, protocol or endpoint change; N2 no row written
but the duplicate and its live sessions (K2, K8, A1, A3); N3 no column dropped
from a rewritten session (K1); N4 no browser storage in `web/src/bulk/`
(existing grep gate); N5 no existing test weakened; `pnpm check` green.

Running-app checks (screenshots in the session, never in the repo, demo data
only): the phone's merge on the web preview of the app, and the web panel.

## 5. Setup plan

- **Git:** branch `feature/issue-784-merge-ammo-lots` off `main`; this spec
  committed first, then one DCO-signed Conventional Commit per green layer
  (phone query, builder, web panel, phone UI, docs, evidence). Rebased on
  `main` if #727 (PR #779) lands first and overlaps.
- **Gauntlet:** `pnpm check` (100% coverage on the `stryker.config.json`
  globs, which include `shared/src/sync-client/*.ts`), Stryker on the new
  builder, fast-check (K8), the backend Workers pool (W1–W4), the three docs
  gates.
- **New dependencies:** none.
