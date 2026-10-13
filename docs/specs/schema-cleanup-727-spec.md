# Schema cleanup (#727) — executable specification

> Old-coder SPEC. Evidence report, once written:
> `docs/specs/schema-cleanup-727-evidence.md`. Inputs: the two audits on #727
> (2026-10-11, 2026-10-12), the re-check of 2026-10-13, and the maintainer's
> rulings in the project thread of 2026-10-13.
>
> **Approval status:** approved first-hand by the maintainer on 2026-10-13
> ("approved", project thread, 17:43 UTC), covering §1–§3 and §6; §4 (PR B)
> is an outline and gets its own approval.

- **Tier: 3.** It changes the synced row format of four tables, the
  WebShooter/ShotLog dedupe keys, and the firearm maintenance counter that
  drives the maintenance-due notification. A mistake duplicates imports,
  shows a wrong "rounds since maintenance", or fires (or misses) a
  notification.
- **Pre-1.0 (hard rule 8):** every change is made in place. One regenerated
  `0000_baseline.sql` per PR, no compatibility path, no protocol version bump.
  D1 needs no migration: `sync_rows.payload` is opaque JSON and the app drops
  payload keys it does not know (`app/src/db/queries/sync-store.ts:106-108`).

## 1. Settled inputs (maintainer, 2026-10-13)

1. Drop `sessions.webshooter_competition_id`, `sessions.external_synced_at`,
   `shots.is_inner_ten_decimal` (no reader anywhere).
2. Keep `sessions.external_source`; strip the source prefix from
   `sessions.external_ref`.
3. `sessions.ten_count` and `inner_ten_count` stay as they are. They become
   droppable once the ShotLog importer reads ShotLog 5.4's per-shot export
   (separate work).
4. Replace `series.note` with an `is_shoot_off` flag, as on `falt_stations`.
5. Derive rounds since maintenance from `maintenance_events.round_count_at`
   instead of storing it on `firearms`.
6. Mark round-count adjustments with an `is_adjustment` flag instead of the
   magic `kind = 'adjustment'`.
7. Keep `falt_stations.photo_uri` (station photos are planned, without
   assisted scoring).

## 2. Scope, split into two PRs

**PR A — columns and keys (this spec, §3).** Items 1, 2, 4, 6, plus the
stale comments (§3.5).

**PR B — derived maintenance counter (§4).** Item 5. Separate because it
removes counter writes from every write path (phone and web: series, fält,
rounds-only, bulk edit, session edit, import) and changes the JSON export.

Not in scope: excluding a shoot-off series from the session score (§5 Q1),
the ShotLog per-shot import, `sessions.kind` in Home, `series.is_total_override`.

## 3. PR A

### 3.1 Dropped columns (item 1)

- **C1** `app/src/db/schema.ts`, the baseline SQL and its `baseline sha256`
  line no longer have the three columns. The web row builders
  (`shared/src/sync-client/rows.ts`) no longer emit them.
- **C2** WebShooter and ShotLog imports still create the same sessions,
  series and shots (existing import tests pass unchanged apart from the
  removed fields).
- **C3** A pulled payload that still carries one of the three keys applies
  without error and the key is ignored (`sync-store.ts` behaviour today; a
  test pins it for these three keys).

### 3.2 `external_ref` without the prefix (item 2)

- **R1** WebShooter: `buildExternalRef(363, 35937)` returns `'363:35937'`
  (was `'webshooter:363:35937'`).
- **R2** ShotLog: `buildShotlogRef(row)` returns the 16 hex characters alone
  (was `'shotlog:<hex>'`). Same hash, same inputs.
- **R3** Every exact match compares `(external_source, external_ref)`, never
  the ref alone:
  - WebShooter reconcile (`reconcile.ts` `findExactMatch`): a session with
    `external_source = 'shotlog'` whose ref happens to equal a WebShooter
    ref is **not** a match.
  - ShotLog dedup (`shotlog/dedup.ts`): the mirror case.
  - Eligibility for the heuristic tier (`sessions.ts` ~L193): unchanged
    meaning — a session with any `external_ref` is not eligible.
- **R4** The JSON export and import carry `externalSource` and `externalRef`
  as today, with the ref now unprefixed. The schema description in
  `shared/src/json-export/types.ts` and the generated JSON Schema say so.
- **R5** `external_source` is non-null whenever `external_ref` is non-null
  (writers already set both; a test pins it for both importers).

### 3.3 `series.is_shoot_off` (item 4)

- **S1** `series.note` (TEXT) is replaced by `series.is_shoot_off`
  (INTEGER NOT NULL DEFAULT 0).
- **S2** The WebShooter mapping sets `isShootOff: true` for
  `results_distinguish` rows and `false` elsewhere (was the note
  `'särskjutning'`). `docs/specs/webshooter-integration-spec.md` §A.6 and
  `docs/implementation-plan.md` §6.3 are amended: a flag, not a note.
- **S3** Scoring is unchanged: a shoot-off series still counts as an
  ordinary scored series, as today (§5 Q1).
- **S4** The session detail screen shows a "Shoot-Off" chip (the existing
  `station.shootOff` string) on a shoot-off series, and the web session view
  does the same. This is the flag's reader.
- **S5** The JSON export carries `isShootOff` per series; import restores it.

### 3.4 `maintenance_events.is_adjustment` (item 6)

- **A1** New column `is_adjustment` INTEGER NOT NULL DEFAULT 0.
- **A2** `adjustFirearmRoundCount` writes `is_adjustment = 1` and leaves
  `kind` empty (`''`). The reason stays in `notes`.
- **A3** The firearm screen labels an event "Adjustment" when
  `is_adjustment = 1`, never because `kind` happens to read "adjustment". A
  user-typed kind "adjustment" shows as typed.

### 3.5 Stale comments

- `app/src/db/schema.ts` ~L426 ("nine synced tables", "migration 0004") and
  `shared/src/sync/protocol.ts` ~L22 ("12 tables") say 14 tables and the
  baseline.

### 3.6 Invariants (must not change)

- **N1** The 14 synced tables, their outbox triggers and the sync protocol
  version are unchanged apart from the columns above.
- **N2** Every existing test passes, changed only where it asserts a removed
  column or the old ref/note format.
- **N3** `pnpm check` green; 100% coverage and the 95% mutation floor on the
  touched modules in `stryker.config.json`.
- **N4** `docs/manual/` EN + SV updated where a user sees a change (the
  Shoot-Off chip; the adjustment label if the manual describes it).

## 4. PR B — derived rounds since maintenance (outline; detailed after PR A)

- **M1** `firearms.rounds_since_maintenance` is dropped.
- **M2** Rounds since maintenance =
  `max(0, round_count − round_count_at of the newest non-deleted event with is_adjustment = 0)`,
  or `round_count` when there is none. One shared function in
  `shared/src/firearms/`, used by the phone and the web.
- **M3** Logging maintenance no longer writes the firearm. Deleting the
  newest maintenance event restores the previous figure (today it does not).
- **M4** Every write path that moved both counters moves only
  `round_count`.
- **M5** The maintenance-due notification compares the derived figure
  before and after a move, with the same crossing rule as today.
- **M6** The JSON export gains the firearm's maintenance events (kind,
  date, `round_count_at`, `is_adjustment`, notes) and drops
  `roundsSinceMaintenance`, so the figure survives export → import (§5 Q2).

## 5. Open questions

- **Q1** Should a shoot-off series be left out of the session score and
  stats, as a fält shoot-off station already is? Not in this spec: it touches
  every sighter-exclusion site (~150 in 39 files). Proposed as its own issue.
- **Q2** (PR B) The JSON export has no maintenance events today, so
  without M6 an export → wipe → import loses the figure.
- **Q3** Your phone's data across the baseline reset: the plan is backup
  bundle → clear app data → restore. Before PR A is marked ready I check that
  a bundle made before the change restores. If it does not, I come back to
  you before adding anything.

## 6. Setup plan

- Node 26.11.1 and pnpm 12 (as pinned). No new dependency.
- Branch `refactor/727-schema-cleanup` for PR A. DCO-signed Conventional
  Commits. Draft PR until the gauntlet is green.
- Files added: this spec and its evidence report.
