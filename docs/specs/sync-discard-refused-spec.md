# Discard a refused change (#942)

**Status: draft, awaiting the maintainer's approval.** No implementation
code is written until it is approved (old-coder, Tier 3: it pushes from the
sync engine's side of the phone).

Follow-up to #856 (PR #857): `sync-family-refusal-spec.md` §11.9, "The way
out", and Q2 of Revision 3, which made the Discard action a follow-up.

## 0. In short

A refused row (a **bad row**: an `invalid` mark, reason `invalid_payload`)
holds back its family on the server until it arrives fixed, or it or its
session is deleted. When no edit can fix it (it exists only on a lost device,
or no screen reaches the bad field), the only way out today is deleting the
whole session.

This change adds **Discard** next to each bad row on Account & Sync, on the
phone and on the web. Discard pushes a **tombstone of the bad row**. The
server never refuses a tombstone (family-refusal C3), needs no stored copy of
the row (N5), and releases the family in that same batch, without the bad
row (scenario DISCARD, already tested in `backend/test/sync-family-refusal.spec.ts`).

**No server, protocol, schema or migration change.** It is client code on
both clients, one shared module, strings and the manual.

## 1. Today

- The pull's `refusals` list names every bad and waiting row of the account
  (`shared/src/sync/protocol.ts` `RefusalEntrySchema`); a waiting row names
  its `blocker`.
- Phone: `app/src/app/account.tsx` shows `account.refusedChanges` (invalid
  marks) and `account.heldChanges` (waiting marks) as counts only.
- Web: `web/src/account/account.tsx` `Refusals` shows the same two counts,
  computed the same way (`countMarks(marksFromRefusals(...))`).
- The web already pushes directly through the shared `pushChanges`
  (`shared/src/sync-client/direct-push.ts`). The phone pushes only through
  its outbox, and the outbox cannot send a row this device does not hold
  (`runPush`: `buildClientChange` returns null and the entry is cleared).

## 2. Design

### 2.1 One shared action (`shared/src/sync-client/discard.ts`, new)

```ts
discardRefused(transport, ref: RowRef, now: string, newId: () => string)
  : Promise<{ kind: 'discarded'; arrival: number } | { kind: 'failed'; error: SyncErrorKey }>
```

- Sends exactly one change: `{ clientChangeId: newId(), tableName, rowId,
payload: null, deletedAt: now, updatedAt: now }`, through `pushChanges`.
- `discarded` when the one ack is `applied`, `duplicate` with no reason, or
  `rejected` / `duplicate` with reason `tombstoned` (the row was already
  deleted: the user's intent holds).
- `failed` on a transport error, an unconfirmed answer (acks that do not
  match), or any other rejection. A retry sends a new tombstone; a tombstone
  is idempotent on the server, so a lost answer followed by a retry is safe.

Both clients call this one function, so the change sent and the verdict read
are the same on both (rule 11).

### 2.2 What each bad row shows (`shared/src/sync-client/refusal-list.ts`, new)

```ts
badRows(refusals: readonly RefusalEntry[], lookup: (ref) => LiveOrDeletedRow | undefined)
  : BadRow[]
```

One entry per `invalid_payload` refusal, in the list's order, with:

- `tableName`, the kind shown ("Shot", "Series", "Session", ...; one i18n key
  per synced table, `account.refusal.kind.<table>`);
- `waiting`: how many `family_refused` entries name it as `blocker`;
- `root`: its family's root (`familyKind`, walking `ownerOf` up through
  `lookup`), or the row itself when it is a root; `null` for ammo lots, tags
  and settings, or when a row on the way up is not found;
- `context`: for a session root, its name and date (date alone when the name
  is empty); for a firearm root, the firearm's label; `null` when not found;
- `held`: whether `lookup` found the bad row itself. Not found shows "Not on
  this device"; Discard still works.

`lookup` is the phone's local DB (`readRow`, deleted rows included) and, on
the web, the pulled tables. The rule is the same; the phone usually knows
more rows, because a bad row is never stored on the server, so the web finds
one only when the server stores an older valid version of it, or its
parents.

### 2.3 Phone

- **Account & Sync**, below the "refused" line: one row per bad row. Title
  `kind`, plus ` · context` when known; subtitle `account.refusal.waiting`
  when `waiting > 0`, and `account.refusal.notOnDevice` when not `held`;
  trailing destructive small button **Discard**. Waiting rows get no button.
- **Confirm** (`Alert.alert`, as Account's Delete): title
  `account.refusal.confirmTitle`, body `confirmBody`, plus `confirmMember`
  for a session-family member that is not the root, or `confirmRoot` for a
  root (session or firearm). Cancel sends nothing.
- **Run inside the one sync loop** (ARCHITECTURE.md § Sync: no concurrent
  independent loops). `requestDiscard(ref)` in `sync-controller.ts` queues the
  ref; the loop runs queued discards, one at a time, before its next cycle,
  never while a cycle is pushing. Then it runs a full cycle.
- **On `discarded`**, in one local transaction (`LocalStore`, new
  `applyDiscard(ref, now, arrival)`): apply the tombstone with the outbox
  triggers suppressed, exactly as a pulled tombstone (`applyOne`; a row this
  device never held is a no-op), and drop the row's mark up to `arrival`
  (`applyMarkUpdate` `drop`). The following cycle's pull replaces every mark
  from the server's `refusals`, so released waiting rows leave the held count
  and arrive as rows.
- **On `failed`**: nothing local changes; the mark stays. Account & Sync shows
  `account.refusal.discardFailed` under that row until the next attempt.
- **Signed out or offline**: Account & Sync shows no sync card when signed
  out; offline, Discard fails with the network message like Sync Now.

### 2.4 Web (mirrors §2.3, rule 11)

- `Refusals` lists the same rows, same strings, same order, from the same
  `badRows` with the pulled tables as `lookup`.
- **Discard** opens an inline confirm card (`role="alertdialog"`, as Delete
  Session in `web/src/edit/delete.tsx`) with the same body lines. Disabled
  while offline (`useOnline`) or while a discard runs.
- On `discarded`, the page reloads the account (`refresh` in `app.tsx`), so
  the list and counts come from a fresh pull. On `failed`, the same
  `discardFailed` line, and the button stays for a retry.

### 2.5 Counters and side effects

**Discard moves no firearm counter**, on either client. A shot or station the
phone recorded already moved the firearm's round count, and the firearm row
syncs on its own. A pulled tombstone from another device does not move
counters either; Discard behaves like one. (Q2.)

A discarded session root takes its family with it: the server applies the
waiting rows under the deleted session (H7′), and both clients hide a deleted
session's rows as they do today.

### 2.6 Strings (sv + en; rule 5 casing)

| Key                             | en                                                                                            | sv                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `account.refusal.discard`       | Discard                                                                                       | Kasta                                                                                |
| `account.refusal.confirmTitle`  | Discard Refused Change?                                                                       | Kasta nekad ändring?                                                                 |
| `account.refusal.confirmBody`   | This deletes the refused change on all your devices, and any older version the server stores. | Ändringen tas bort på alla dina enheter, liksom en äldre version som servern sparat. |
| `account.refusal.confirmMember` | The rest of the session will sync without it.                                                 | Resten av passet synkas utan den.                                                    |
| `account.refusal.confirmRoot`   | Everything that belongs to it is deleted with it.                                             | Allt som hör till den tas bort med den.                                              |
| `account.refusal.waiting`       | {{count}} change(s) wait on it                                                                | {{count}} ändring(ar) väntar på den                                                  |
| `account.refusal.notOnDevice`   | Not on this device                                                                            | Finns inte på den här enheten                                                        |
| `account.refusal.discardFailed` | Couldn't discard the change. Try again.                                                       | Kunde inte kasta ändringen. Försök igen.                                             |
| `account.refusal.kind.<table>`  | one per synced table: Session, Series, Shot, Station, Session Tag, Firearm, License, …        | Pass, Serie, Skott, Station, Passetikett, Vapen, Licens, …                           |

The phone's `app/src/i18n/*.json` holds them; the web reads the phone's
strings as it already does for `account.refusedChanges`.

### 2.7 Manual

`docs/manual/guides/backup-and-restore.md`, "When the server refuses a
change": add a **Discard** paragraph next to "until the refused change
arrives fixed, or until it or its session is deleted" (what it deletes, that it works from any device and the
web, that the rest of the session then syncs), on the same branch.

## 3. Scenarios

```gherkin
Feature: Discard a refused change

  Scenario: LIST one row per bad row, with its waiting count
    Given refusals: shot T2 invalid; series R1 and shot T3 family_refused, blocker T2;
      license L1 invalid
    Then badRows lists T2 with waiting 2, then L1 with waiting 0
    And no row is listed for R1 or T3

  Scenario: CTX a member found locally names its session
    Given T2 is held, its series R1 and session S1 too, S1 named "Kväll" on 2026-11-20
    Then T2's root is S1 and its context is "Kväll" and 2026-11-20

  Scenario: CTX-NONAME a session with an empty name shows its date alone

  Scenario: CTX-FIREARM a license names its firearm's label

  Scenario: GONE a bad row not on this device
    Given lookup finds nothing for T2
    Then held is false, root and context are null, and Discard is offered

  Scenario: SEND discard pushes exactly one tombstone
    When the user confirms Discard on T2 at 2026-11-25T20:00:00.000Z
    Then one push carries one change: shots/T2, payload null,
      deletedAt and updatedAt 2026-11-25T20:00:00.000Z, a fresh clientChangeId

  Scenario: OK an applied ack is discarded
  Scenario: OK-DUP a duplicate ack with no reason is discarded
  Scenario: OK-TOMB a tombstoned rejection (or its duplicate replay) is discarded
  Scenario: FAIL-NET a transport error fails, and nothing local changes
  Scenario: FAIL-UNCONFIRMED acks that do not match fail
  Scenario: FAIL-OTHER any other rejection fails

  Scenario: E2E discard releases the family on the server (backend, real worker)
    Given device A pushed S1, R1, an invalid T2 and a valid T3, so T2 is bad and T3 waits
    When device B, which never held T2, discards T2
    Then B's pull shows no refusals, T3 is stored, and T2 is a tombstone
    And A's next cycle clears both its marks

  Scenario: E2E-ROOT discarding a refused session applies its waiting rows under the deleted session

  Scenario: PHONE-LOCAL on discarded, the local row is tombstoned without queueing
    Given T2 is held and has an own invalid mark
    When the discard is acked applied at arrival 7
    Then T2 has deleted_at set, the outbox is unchanged, and T2's mark is gone

  Scenario: PHONE-LOCAL-NEWER a mark that arrived after the discard's arrival stays

  Scenario: PHONE-FAIL a failed discard leaves the row, the outbox and the mark as they were

  Scenario: LOOP a discard requested during a cycle runs after it, never alongside
    Given a cycle is running
    When requestDiscard(T2) is called
    Then the push for T2 starts only after the cycle ends, and a cycle runs after it

  Scenario: CANCEL cancelling the confirm sends nothing (phone and web)

  Scenario: WEB the web lists the same rows and discards through the same function,
    then reloads the account

  Scenario: WEB-OFFLINE Discard is disabled offline

  Scenario: COUNTER discard moves no firearm's round count
```

## 4. Must NOT

- change the server, the protocol, the DB schema or any migration;
- change how marks are set, dropped or counted, outside `applyDiscard`;
- offer Discard on a waiting row;
- push a discard concurrently with a sync cycle on the phone;
- move a firearm counter;
- add a dependency;
- edit or weaken an existing test.

## 5. Setup plan

- Tools: none new. Gates: `pnpm check`; `pnpm gauntlet` (Stryker) on the two
  new shared files; backend tests per `backend/CLAUDE.md`; docs gates per
  `docs/CLAUDE.md`.
- Files added: `shared/src/sync-client/discard.ts`,
  `shared/src/sync-client/refusal-list.ts` and their tests; a DISCARD case in
  `backend/test/sync-client.spec.ts`; the evidence report
  `docs/specs/sync-discard-refused-evidence.md`.
- Files changed: `shared/src/sync-client/ports.ts` (`applyDiscard`),
  `app/src/db/queries/sync-store.ts`, `app/src/features/sync/sync-controller.ts`,
  `app/src/app/account.tsx`, `web/src/account/account.tsx`, both i18n files,
  the manual page, `docs/implementation-plan.md` (changelog line).
- Git: branch `feature/942-discard-refused-change`; this spec is committed
  first; DCO sign-off and `Assisted-by: Claude Code` on every commit.
- New dependencies: none.
- Verification: one independent review against the final source state before
  the evidence report is written (`old-coder/references/verifier.md`).
- Screenshots: web and the phone's web preview, `/dev` demo data with a
  synthetic refused shot, saved to `/mnt/project-files/screenshots/942-discard/`.

## 6. Questions for the maintainer

- **Q1 Approve the design?** Discard on each bad row on Account & Sync, on both
  clients, pushing a tombstone through one shared function; on the phone, run
  inside the one sync loop. **Recommended: yes.**
- **Q2 Discard moves no firearm counter** (§2.5)? **Recommended: yes**, as a
  tombstone pulled from another device moves none.
- **Q3 Swedish label "Kasta"** for Discard (vs "Ta bort", which the app uses
  for Delete)? **Recommended: "Kasta"**, so the two actions read differently.

## Revisions

- **Draft (2026-11-25).** First draft, before implementation.
