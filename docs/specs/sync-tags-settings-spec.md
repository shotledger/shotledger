# Sync `session_tags` and account settings — executable specification

> Old-coder SPEC for layer 1 of #301 (web write paths). Evidence report, once
> written: `docs/specs/sync-tags-settings-evidence.md`. Decision record:
> `docs/adr/0019-web-writes-through-sync-push.md`.
>
> **Approval status: Approved 2026-10-06 by the maintainer (relayed by the
> orchestrator session), with revision 1 (tag-name uniqueness folded in).**

- **Tier: 3.** Sync engine and protocol. A wrong rule here silently loses a
  tag link, resurrects an unlinked one, wedges a device's pull, or leaks a
  device-local setting (a backup folder path, a consent flag) to the server.
- **Scope:** `shared/src/sync/` (table enum, settings allowlist),
  `shared/src/tags/` (canonical tags and live links, revision 1),
  `shared/src/sync-client/order.ts`, `backend/src/routes/sync.ts` (allowlist check),
  `app/src/db/` (schema, baseline, triggers, `sync-store.ts`, `tags.ts`,
  `settings.ts`, `stats.ts`), `web/src/` (read side: `pull.ts`,
  `stats-inputs.ts`, `account/archive.ts`, `statistics.tsx`).
- **Not in scope:** any web write UI or web push client (later #301 layers),
  the web tag-filter control, `shot_marks`, the Vault.

## 1. Settled inputs (maintainer, 2026-10-06 — not re-asked)

1. The web app writes by pushing changed rows through the existing
   `/sync/push`, online only: no browser database, no browser outbox, the
   same per-row last-write-wins as a second phone. ADR 0019 records it and
   supersedes ADR 0013's "never writes".
2. `session_tags` syncs: it gains `id`/`created_at`/`updated_at`/`deleted_at`
   (UUIDv7 id), joins `SYNC_TABLE_NAMES`, and gets outbox triggers. The DB
   baseline is **reset**, not migrated (hard rule 8).
3. `settings` syncs **per user, through an allowlist** of account/compliance
   keys only. Device-local keys never sync.

## 2. Design

### 2.1 Protocol (`shared/src/sync/protocol.ts`)

- `SYNC_TABLE_NAMES` gains `'session_tags'` and `'settings'` (14 tables).
- `PROTOCOL_VERSION` and `MIN_SUPPORTED_PROTOCOL_VERSION` **stay 1** (hard
  rule 8: pre-1.0, no version bump for a format only this machine produced).
- New `SYNCED_SETTING_KEYS = ['birthYear', 'skillClass',
'competesInWomensClasses', 'complianceProfile',
'complianceProfileVariant'] as const` — exactly the five values of the
  app's `SETTINGS_KEYS` named in input 3 (verified against
  `app/src/db/queries/settings.ts`). Plus `isSyncedSettingKey(id)`.
- The server's storage is unchanged: `sync_rows` is generic, so **no D1
  migration**. The wire shapes (`ChangeRow`, `ClientChange`) are unchanged.

### 2.2 `session_tags` row shape and id scheme

```
session_tags  id TEXT PK (UUIDv7, newId()), created_at, updated_at,
              deleted_at, session_id FK sessions, tag_id FK tags
              INDEX (session_id, tag_id)   -- NOT unique
```

- **Random UUIDv7 per link, not a deterministic id from the pair.** A
  tombstone is terminal for its row id (protocol R2), so a deterministic id
  would make "untag, then tag again" impossible forever. With a fresh id,
  re-linking writes a new row and the old tombstone stays dead.
- **No unique constraint on `(session_id, tag_id)`, not even a partial one
  over live rows.** Two devices tagging the same session offline produce two
  live rows with different ids; a unique index would make applying the second
  one fail, roll back the pull transaction, and wedge that device's sync on
  every later cycle. Duplicates are therefore legal on disk and every reader
  dedupes.
- **A link is live iff `deleted_at IS NULL`.** Unlink becomes a soft delete
  (today it is a hard `DELETE`, which sync never sees).
- Semantics are add-wins: an unlink tombstones only the link rows the
  unlinking device knows about. A concurrent link it never saw survives.

### 2.3 `settings` row shape and id scheme

```
settings  id TEXT PK (the key name itself, e.g. 'birthYear'),
          value TEXT NOT NULL (JSON-encoded, as today),
          created_at, updated_at, deleted_at
```

- The `key` column is **renamed `id`** and the table gains the common
  columns (`...common` in `schema.ts`), so the generic sync adapter
  (`readRowSync`, `applyOne`, keyed on `"id"`) handles it unchanged. Device-
  local keys live in the same table and simply never reach the outbox.
- **Deterministic id = the key name.** One row per allowlisted key per user;
  the server keys rows by `(user_id, table_name, row_id)`, so the per-user
  scope is free. Two devices editing `birthYear` write the same row, and the
  later push wins (R3), exactly like an edit to a session.
- **The wire `value` is the stored JSON text**, not a decoded value:
  `{"id":"birthYear","value":"1980",...}`, `{"id":"complianceProfile",
"value":"\"se\"",...}`. A web writer pushes the same shape.
- **A setting is never tombstoned.** Clearing one (birth year back to
  "unknown") writes `value: "null"` as a live row. A tombstone with a
  deterministic id would be terminal: the key could never be set again on
  that account. Defence in depth: `getSetting` reads a tombstoned row as
  absent.
- **The allowlist is enforced in three places:**
  1. The app's settings triggers fire only `WHEN new.id IN (<the five>)`.
  2. `POST /sync/push` refuses the whole request, before any write, when a
     `settings` change's `rowId` is not allowlisted:
     `400 { error: 'setting_not_synced', clientChangeId }` — the same
     check-the-batch-first pattern as the 413 payload cap. This is what keeps
     a web writer (or any client) from parking a device-local key server-side.
  3. The app's apply step drops a pulled `settings` row whose id is not
     allowlisted (so shrinking the allowlist later cannot write a stale
     server row into a device-local key).

### 2.4 Client engine

- `APPLY_ORDER` gains `settings` (first; no FKs) and `session_tags` (after
  `sessions`; `tags` already precedes it).
- `SYNC_TABLES` in `sync-store.ts` gains both tables. The apply path stays
  generic except for the 2.3 (3) allowlist drop.
- Triggers: `session_tags` gets the standard insert + update pair; `settings`
  gets the pair with the extra allowlist predicate in `WHEN`.
- `TEXT_LIMITS` gains `settings: { value: 64 }` (every allowlisted value is
  a small JSON scalar; the size test needs every synced text column bounded).
  `session_tags` has no free-text column.

### 2.5 Query layer (`app/src/db/queries/`)

- `addSessionTag(s, t)`: no-op when a live link `(s, t)` exists; otherwise
  inserts a new row with `newId()`, `created_at = updated_at = now`.
- `removeSessionTag(s, t)`: `UPDATE … SET deleted_at = now, updated_at = now
WHERE session_id = s AND tag_id = t AND deleted_at IS NULL` — every live
  duplicate goes.
- `listTagsForSession`, `listTagsBySession`, and the three `stats.ts` reads
  of `session_tags`: live links only, one entry per `(session, tag)`.
- Link dedupe and tag-name resolution: §2.8 (revision 1).
- `setSetting`: upsert by id, `updated_at = now` on every write,
  `created_at` on insert only. `getSetting`: unchanged lookup by id; a row
  with `deleted_at` set reads as the fallback.
- Seed/wipe (`seed.ts`) keeps its hard deletes (dev-only, as today).

### 2.6 Web read side (the "only if trivial" part — it is)

- `WEB_TABLES` gains `session_tags` and `settings`.
- `statsInputs` feeds the live links into the three builders, and returns
  `birthYear` parsed from the `birthYear` settings row (null when absent or
  unparsable), which `statistics.tsx` passes instead of the hard-coded
  `null` — so the guldserie tile appears on the web as on the phone.
- `sessionsJson` (the account download) carries each session's tags, like
  the phone's export.
- **Deferred:** the tag-filter control in `web/src/report/filters.tsx` and a
  session-detail tag list (no session-detail page exists on the web yet).
  The filter state already carries `tagIds`; only the control is missing.

### 2.8 Tag names (revision 1)

`tags.name` loses its `UNIQUE` constraint (a plain index stays). Any unique
constraint, even one over live rows only, wedges a pull when two devices
create the same name concurrently, so duplicates are legal on disk and the
name is resolved on read and on create, in one pure module,
`shared/src/tags/canonical.ts`, that the phone and the web both call:

- **Canonical tag of a name** = the live tag with that exact name and the
  smallest id (UUIDv7: the earliest created). Names compare exactly, as today.
- `canonicalTags(tags)` — the live tags, one per name, canonical id, sorted
  by name (binary order, as SQLite's `ORDER BY name`).
- `liveSessionTags(tags, links)` — live links to live tags, each `tagId`
  replaced by its name's canonical id, one per `(session, tag)`.
- `tagNamesBySession(tags, links)` — each session's tag names, sorted, once.

App query layer on top of it:

- `getTagByName` / `getOrCreateTag` return the canonical tag; a name with no
  live tag (never created, or every copy deleted) creates a new row — so
  re-creating a deleted tag works.
- `listTags` = `canonicalTags`. The stats reads use `liveSessionTags`;
  `listTagsBySession` uses `tagNamesBySession`; `listTagsForSession` returns
  each name once with its canonical id.
- `addSessionTag(s, t)` is a no-op when `s` has a live link to any live tag
  named like `t`. `removeSessionTag(s, t)` tombstones `s`'s live links to
  every tag named like `t`. `softDeleteTag(id)` tombstones every live tag of
  that name.
- Two concurrently created "KM" tags therefore show as one "KM" everywhere,
  and filtering by it matches sessions linked to either copy. Nothing merges
  the rows on disk; a later layer may, by repointing links and tombstoning
  the copy, like an ammo-lot merge.

### 2.7 How the later web write layers map onto pushed rows (for ADR 0019)

| Web action                       | Rows pushed                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Retag sessions                   | New `session_tags` rows (fresh UUIDv7) for added links; a tombstone per live link id removed                                 |
| Fix a firearm link over a season | One `sessions` row per affected session, full payload with the new `firearm_id`, new `updated_at`                            |
| Merge duplicate ammo lots        | Every `sessions` row pointing at the duplicate repointed to the kept lot, then a tombstone for the duplicate `ammo_lots` row |
| Move sessions between locations  | One `sessions` row per session, new `location` text                                                                          |
| Edit account/compliance settings | One `settings` row per changed allowlisted key, deterministic id = key, `value` JSON text                                    |
| Keyboard series entry            | New `sessions`, `series`, `shots` rows (fresh UUIDv7 ids) in one push, parents first                                         |

Rules the web writer will follow (recorded in ADR 0019, built in later
layers): pull first, edit the pulled payload and push the **whole** row
(a push replaces the row; there is no field-level patch); one push request
per user action where it fits `PUSH_BATCH_MAX`, parents before children;
repoint before tombstoning; a `rejected`/`tombstoned` ack means the row was
deleted elsewhere and the web re-pulls; nothing is retried from browser
storage after the tab closes.

## 3. Scenarios

Every scenario maps 1:1 to a named test (name = scenario id + title).

```gherkin
Feature: protocol and allowlist (shared, vitest)
  Scenario: P1 the table enum carries the two new tables
    Then SYNC_TABLE_NAMES contains 'session_tags' and 'settings'
    And  ClientChangeSchema parses a change for each
  Scenario: P2 the settings allowlist is exactly five keys
    Then SYNCED_SETTING_KEYS equals [birthYear, skillClass,
         competesInWomensClasses, complianceProfile, complianceProfileVariant]
    And  isSyncedSettingKey('backupFolder') is false, ('birthYear') is true
  Scenario: P3 apply order puts each child after its parents
    Then APPLY_ORDER is a permutation of SYNC_TABLE_NAMES
    And  'session_tags' comes after both 'sessions' and 'tags'
  Scenario: P4 (replaced by N2, revision 1)

Feature: server allowlist (backend, Workers pool)
  Scenario: B1 a session_tags row round-trips
    When device A pushes a session_tags row, then pulls from cursor 0
    Then the pull returns it with the same payload
  Scenario: B2 an allowlisted setting round-trips under its key id
    When A pushes settings rowId 'birthYear' with payload value "1980" (JSON text)
    Then a pull returns rowId 'birthYear' with that payload
  Scenario: B3 a non-allowlisted setting refuses the whole push
    When A pushes [a valid sessions row, settings rowId 'backupFolder']
    Then the response is 400 { error: 'setting_not_synced', clientChangeId }
    And  a pull from cursor 0 returns neither row (nothing was written)
  Scenario: B4 two devices write the same setting: the later push wins
    When A pushes birthYear '1980' and then B pushes birthYear '1981'
    Then a pull returns one birthYear row, value '1981'

Feature: app schema and capture (vitest over better-sqlite3)
  Scenario: A1 the baseline creates the new shapes
    Then session_tags has id/created_at/updated_at/deleted_at/session_id/tag_id
    And  there is no unique index over (session_id, tag_id)
    And  settings has id/value/created_at/updated_at/deleted_at, no 'key'
  Scenario: A2 both new tables carry the outbox trigger pair
    Then sync_outbox_session_tags_{insert,update} and
         sync_outbox_settings_{insert,update} exist
  Scenario: A3 only allowlisted settings reach the outbox
    When setSetting writes each of the five allowlisted keys
    Then the outbox holds one 'settings' entry per key, row_id = key
    When setSetting writes every other SETTINGS_KEYS value and FLAG_OVERRIDES_KEY
    Then the outbox gains no 'settings' entry
  Scenario: A4 applying a pulled row does not re-queue it
    When a pulled session_tags row and a pulled birthYear row are applied
    Then the outbox is empty

Feature: tag links (app queries)
  Scenario: T1 tagging is idempotent on the live pair
    When addSessionTag(s1, t1) runs twice
    Then exactly one live row exists and the outbox has one entry
  Scenario: T2 untagging tombstones, never deletes
    When removeSessionTag(s1, t1)
    Then the row still exists with deleted_at set and is queued for push
  Scenario: T3 untag then retag writes a new id
    When addSessionTag, removeSessionTag, addSessionTag on (s1, t1)
    Then two rows exist: the first tombstoned, the second live with a new id
  Scenario: T4 readers dedupe and skip tombstones
    Given two live rows (s1,t1) with different ids and one tombstoned (s1,t2)
    Then listTagsForSession(s1), listTagsBySession and the stats reads
         return t1 once and never t2
  Scenario: T5 untag removes every live duplicate
    Given two live rows (s1,t1)
    When  removeSessionTag(s1, t1)
    Then  no live (s1,t1) row remains

Feature: tag names (shared canonical module + app queries, revision 1)
  Scenario: N1 duplicate live names collapse to the earliest id
    Given live tags (id 01…a, 'KM') and (id 01…b, 'KM') and a tombstoned (01…0, 'KM')
    Then  canonicalTags returns one 'KM' with id 01…a
  Scenario: N2 links to either copy map to the canonical id, once
    Given s1 linked to 01…a and to 01…b, s2 linked to 01…b
    Then  liveSessionTags gives (s1, 01…a) and (s2, 01…a), nothing else
  Scenario: N3 tombstoned links and links to deleted tags are dropped
  Scenario: N4 tagNamesBySession lists each name once, sorted
  Scenario: N5 re-creating a deleted tag succeeds with a new id
    When createTag('KM'), softDeleteTag(it), getOrCreateTag('KM')
    Then a second live 'KM' row with a new id is returned, and no error
  Scenario: N6 tagging a session through either copy is one tag
    Given two live 'KM' tags a and b, and s1 linked to a
    When  addSessionTag(s1, b)
    Then  no new link row is written
  Scenario: N7 untagging through either copy removes both links
    Given s1 linked to a and to b (both 'KM')
    When  removeSessionTag(s1, a)
    Then  both links are tombstoned
  Scenario: N8 the baseline has no unique index on tags.name

Feature: settings (app queries)
  Scenario: S1 setSetting stamps updated_at on every write
  Scenario: S2 clearing a synced setting writes a live 'null', never a tombstone
    When setSetting(birthYear, null)
    Then the row has value 'null' and deleted_at NULL
  Scenario: S3 a tombstoned settings row reads as the fallback
  Scenario: S4 a pulled non-allowlisted settings row is dropped on apply
    When applyChanges gets settings rowId 'backupFolder'
    Then the local backupFolder setting is unchanged

Feature: two devices end to end (backend/test/sync-client.spec.ts — the real
         engine on two in-memory stores against the real Worker)
  Scenario: E1 a tag added on A appears on B
  Scenario: E2 a tag removed on A disappears on B
  Scenario: E3 both devices tag the same session offline: B shows it once
  Scenario: E4 add wins over a concurrent remove it never saw
    Given A and B have both pulled session s1 and tag t1
    And   A links (s1,t1) as L1 and syncs; B, offline since, links (s1,t1) as L2
    When  A unlinks (tombstones L1) and syncs, then B syncs, then A syncs
    Then  s1 is tagged t1 on both devices, through L2
  Scenario: E5 birth year set on A reaches B; the later of two edits wins
  Scenario: E7 both devices create tag 'KM' offline: both sync, one 'KM' each
    When A and B each create 'KM' and tag a different session with it, then sync twice
    Then neither sync fails, each device's listTags has one 'KM', and
         filtering by it matches both sessions on both devices
  Scenario: E8 a tag deleted on A and re-created by name syncs to B
  Scenario: E6 a device-local setting written on A never reaches the server or B

Feature: web read side (vitest)
  Scenario: W1 the web pulls session_tags and settings
  Scenario: W2 statsInputs gives a tagged session its tag ids, once each,
              and ignores tombstoned links
  Scenario: W3 statsInputs reads birthYear from the settings row
              (null when absent or unparsable)
  Scenario: W4 the account download carries each session's tag names
```

## 4. Must NOT

- N1 No change to `PROTOCOL_VERSION`, the wire schemas' shapes, or the D1
  schema; no new D1 migration.
- N2 No device-local setting key reaches `/sync/push` from the app, and the
  server stores none from any client (A3, B3, E6).
- N3 No unique constraint over `(session_id, tag_id)` or `tags.name`; no
  settings tombstone written by the app (A1, S2, N8).
- N4 The app never hard-deletes a synced row outside `seed.ts`'s dev wipe
  (`removeSessionTag` is the one that changes; grep gate over
  `app/src/db/queries` for `db.delete(` on a synced table, with a negative
  control).
- N5 `shared/` stays free of RN/Workers imports; no new dependency anywhere.
- N6 No existing test is weakened or deleted; baseline failures recorded
  before the first change.
- N7 The web app still never pushes (its existing invariant test stays
  green); no web write UI in this PR.
- N8 One `0000_baseline.sql` only; its sha256 line in `migrations.js`
  updated; triggers and seed rows carried over by hand and asserted.

## 5. Docs that change in this PR

- `docs/adr/0019-web-writes-through-sync-push.md` (new).
- `docs/adr/0013-…`: status line becomes "accepted (2026-10-06);
  its 'the web app never writes' stance is superseded by ADR 0019", and the
  never-writes consequence bullet is edited in place to point at 0019 (ADR
  0015's pre-1.0 rule: edit in place, the replacement says "Supersedes").
  Architecture B itself stays accepted.
- `docs/specs/sync-protocol-spec.md` §1: the `VERIFY` resolved, citing the
  2026-10-06 ruling; §2 enum count.
- `docs/specs/sync-app-spec.md` §2 and §11: the two tables leave the
  "not synced" lists.
- `docs/implementation-plan.md` §3: `session_tags` and `settings` lines; the
  "Still open: the VERIFY…" note marked resolved.
- `web/CLAUDE.md`: the "What is not synced" line.
- Manual, EN + SV: `reference/privacy.md` (the Sync row names the five
  account settings that follow the account), `guides/your-account-on-the-web.md`
  (the download now carries tags; the report shows the guldserie tile).

## 6. Setup plan (what approving this authorizes)

- **Isolation:** worktree `~/tmp/sl-301-sync`, branch
  `feat/sync-session-tags-settings` from `origin/main` (1baa579), deps
  installed. The main checkout is not touched.
- **Git:** Conventional Commits, `-s`, explicit paths. Commit this spec at
  approval, then checkpoint at each GREEN. Push and open a PR with
  `Refs #301`, assigned to the maintainer.
- **Baseline reset:** regenerate `app/src/db/migrations/0000_baseline.sql`
  with drizzle-kit from `schema.ts`, carry the triggers and the
  `sync_control` seed row over by hand, update the `migrations.js` sha256
  line. The orchestrator is told before regenerating, since a parallel
  session regenerating the baseline at the same time would collide.
- **Gauntlet:** `pnpm check` (types, lint, format, i18n, vitest with
  coverage, jest); backend `pnpm --filter backend test` (Workers pool);
  `pnpm mutation` scoped to the changed `shared/src/sync*/` files and the new
  `shared/src/tags/` (added to Stryker's `mutate` list); **manual mutation** (3–5 mutants each, recorded in
  EVIDENCE) for the app-side `tags.ts`/`settings.ts`/`sync-store.ts`, the
  backend allowlist check, which Stryker does not
  cover; the docs gates (`mkdocs build --strict`, translation and anchor
  checks); a real-execution pass: two devices against `wrangler dev`, and
  the web report in a browser showing a synced tag and the guldserie tile
  (screenshots under `~/tmp/screens-301/`, not attached anywhere).
- **New dependencies:** none.

## 7. What this means for the maintainer's phone and account

The baseline reset means **the installed app cannot open its database after
upgrading** (the journal no longer matches). Concretely:

- The phone must be wiped (`adb shell pm clear app.shotledger`) and the new
  build installed.
- `.shotledger` backups taken before this build are refused by restore
  (`checkSchemaCompatibility`), so they are not a way back.
- Two ways to repopulate:
  1. **Re-import the cleaned ShotLog export** (Settings → Import Sessions),
     as after the last reset. Tags come back from the import. Then re-enter
     the five account settings once. **The account on the server already
     holds the old rows under the old ids**, so before signing in again,
     delete the account (or its data) from Account & Sync, or every session
     ends up twice.
  2. **Sign in on the wiped phone and let sync restore it.** Everything that
     already syncs comes back; tag links and the five settings do not (they
     were never on the server) and must be redone by hand. No duplicates.
- Sessions logged on the phone since the last ShotLog import exist only on
  the phone and on the server; option 1 loses them unless they are re-entered,
  option 2 keeps them.

## 8. Found on the way

- `tags.name` was `UNIQUE` across live and tombstoned rows: a concurrent
  same-name tag wedged the second device's pull, and re-creating a deleted
  tag failed locally. Fixed in this PR (revision 1, §2.8).

## Revisions

1. **2026-10-06, at approval.** The maintainer folded the tag-name fix (§8)
   into this PR: §2.8 and scenarios N1–N8, E7–E8 added; N3 extended; scope
   gains `shared/src/tags/`. Consequence for §2.5/P4: link dedupe now lives in
   `liveSessionTags`, which every caller uses, so `analytics-rows/rows.ts`
   stays unchanged and P4 is replaced by N2. §7 keeps both recovery routes;
   the maintainer chooses at upgrade time.
