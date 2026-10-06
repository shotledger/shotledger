# ADR 0019: The web app writes by pushing rows through `/sync/push`

Status: accepted (2026-10-06)

Supersedes ADR 0013's "the web app never writes". The rest of ADR 0013
stands: the web app is still a separate complement over `/sync/pull`, with
no SQLite and nothing kept after the tab closes.

## Context

#301 holds the web write paths ADR 0013 deferred: keyboard series entry,
bulk edit (retag sessions, fix a firearm link across a season, merge
duplicate ammo lots, move sessions between locations) and editing account
and compliance settings. ADR 0013 named two routes to a write path — narrow
write endpoints on the Worker, or reopening architecture A — and ruled out
an outbox in the browser.

Two tables blocked even expressing these: `session_tags` and `settings` were
outside `SYNC_TABLE_NAMES` (sync-protocol spec §1, open `VERIFY`).

## Decision

Maintainer's ruling, 2026-10-06:

1. **The web app pushes changed rows through the existing `/sync/push`,
   online only.** No browser database, no outbox, no retry from browser
   storage. To the server the web is one more device, with the same per-row
   last-write-wins by server order (ADR 0003, protocol R1–R4). No new write
   endpoint and no new conflict semantics.
2. **`session_tags` syncs.** Each link gets its own UUIDv7 id and the common
   columns. Unlink is a tombstone, and re-linking writes a new row, since a
   tombstone is terminal for its id. No unique constraint over the pair:
   two devices linking the same pair offline produce two live rows, and
   readers dedupe. Concurrent link and unlink resolve add-wins.
3. **`settings` syncs per user, for an allowlist only** — `birthYear`,
   `skillClass`, `competesInWomensClasses`, `complianceProfile`,
   `complianceProfileVariant` (`SYNCED_SETTING_KEYS`). A synced setting is
   one row whose id is the key itself, so every device writes the same row
   and the later push wins. Its `value` is the stored JSON text. A setting is
   never tombstoned; clearing one writes `null`. Device-local keys (backup
   folder, timer setups, flags, consents, online location lookup, the
   Optional Fields switches, …) never sync: the app's triggers skip them, the
   server refuses a push carrying one, and the apply step drops one.
4. **A tag name is not unique on disk.** Two devices creating "KM" offline
   produce two rows; a unique index would make the second device's pull fail
   on every cycle. Readers resolve a name to its earliest live tag
   (`shared/src/tags/canonical.ts`), so duplicates show as one tag, and a
   deleted tag can be created again by name.

The protocol version does not change (hard rule 8): the server's storage
was already generic per table.

## How a web edit becomes pushed rows

A push replaces a whole row; there is no field-level patch. So the web
writer pulls, edits the pulled payload, and pushes full rows, parents before
children, in as few requests as `PUSH_BATCH_MAX` allows.

| Web action                       | Rows pushed                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Retag sessions                   | a new `session_tags` row per added link; a tombstone per removed link id                       |
| Fix a firearm link over a season | each affected `sessions` row with the new `firearm_id`                                         |
| Merge duplicate ammo lots        | every `sessions` row on the duplicate repointed to the kept lot, then the duplicate tombstoned |
| Move sessions between locations  | each `sessions` row with the new `location`                                                    |
| Edit account/compliance settings | one `settings` row per changed key                                                             |
| Keyboard series entry            | new `sessions`, `series` and `shots` rows                                                      |

A `rejected` ack (`tombstoned`) means the row was deleted on another
device; the web re-pulls rather than retrying.

## Consequences

- The phone stays complete without the web; the web adds no capability the
  phone lacks, only a keyboard and a wide screen for the same edits.
- A web edit and a phone edit to the same row race like two phones: the
  later push wins the whole row. A phone that edited a session offline can
  overwrite a web bulk edit of that session's other fields. Accepted, as it
  already is between two phones.
- A web edit that fails in flight is lost with the tab; the user redoes it.
  That is the price of "no browser outbox".
- Same-name tag copies stay on disk until something merges them. A web
  "merge tags" edit would repoint the links and tombstone the copy, like an
  ammo-lot merge; nothing needs it for correctness.
- The privacy table gains the five account settings under Sync.
