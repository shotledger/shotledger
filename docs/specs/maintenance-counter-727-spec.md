# Derived rounds since maintenance (#727, PR B) — executable specification

> Old-coder SPEC. Evidence report:
> `docs/specs/maintenance-counter-727-evidence.md`. Inputs: the outline in
> [`schema-cleanup-727-spec.md`](./schema-cleanup-727-spec.md) §4 and §5 Q2,
> and the maintainer's ruling of 2026-10-13 (item 5 there: derive the figure
> from `maintenance_events.round_count_at`).
>
> **Approval status:** awaiting the maintainer's approval. The draft PR
> implements this text so the review can read both; nothing merges before
> approval.

- **Tier: 3.** It changes the synced `firearms` row, every write path that
  moves a firearm's round counter (phone and web), the maintenance-due
  notification and the JSON export format. A mistake shows a wrong "Rounds
  Since Maintenance", fires or misses the notification, or loses the figure
  across export and import.
- **Pre-1.0 (hard rule 8):** made in place. The `0000_baseline.sql` is
  regenerated and its journal stamp bumped, as in PR A. The JSON export stays
  `formatVersion: 1`. D1 needs nothing: payloads are opaque JSON and the app
  drops keys it does not know.

## 1. Behavior

- **M1** `firearms.rounds_since_maintenance` is dropped from the schema, the
  baseline, the web row builders and the JSON export.
- **M2** Rounds since maintenance is computed, never stored:
  `max(0, round_count − round_count_at)` of the **reference event**, or
  `round_count` when the firearm has none. The reference event is the
  firearm's newest non-deleted maintenance event with `is_adjustment = 0`,
  newest by `performed_at`, ties broken by `id` (UUIDv7, creation order).
  One pure function in `shared/src/firearms/` computes it; the phone's
  firearm list and detail screens use it. The web shows no maintenance figure
  today and gains none.
- **M3** Logging maintenance writes only the event (with `round_count_at` =
  the firearm's current `round_count`, as today) and no longer writes the
  firearm. Deleting the reference event makes the previous one the reference,
  so the earlier figure comes back.
- **M4** Every write that moved both counters moves only `round_count`: the
  phone's `applyRoundCountDelta` (series, fält, rounds-only, imports) and
  `adjustFirearmRoundCount`; the web's `withRoundsAdded` and `withRoundsMoved`
  (`shared/src/sync-client/rows.ts`). An adjustment still moves the derived
  figure by the same amount, because it moves `round_count` and is never a
  reference event.
- **M5** The maintenance-due notification compares the derived figure before
  and after a counter move, with the existing crossing rule
  (`shouldNotifyMaintenanceDue`). Saving a new interval compares against the
  derived figure, as it compares against the stored one today. Logging or
  deleting a maintenance event does not notify.
- **M6** The JSON export gains a top-level `maintenanceEvents` array: `id`,
  `firearmId`, `performedAt`, `kind`, `roundCountAt`, `isAdjustment`, `notes`
  for every non-deleted event of an exported firearm, adjustments included.
  Phone (`build-export.ts`) and web (`archive.ts`) write it. The import
  upserts each event by `id`, attached to the firearm the file's `firearmId`
  resolved to, and drops an event naming a firearm the file does not carry,
  as it does a license. A bad entry is skipped on its own
  (`invalid-maintenance-event`). The import preview does not list events.
  Export → wipe → import therefore restores the figure.

## 2. Behavior changes a user can see

1. Deleting the newest maintenance entry restores the figure it reset
   (today the figure stays at what the reset left).
2. Logging a cleaning dated **before** the newest one records it without
   resetting the figure (today any log resets it to 0).
3. Two devices no longer overwrite each other's figure through sync: one
   logging maintenance while the other saves a series ends with the same
   figure on both.

## 3. Known limits (accepted, unchanged in kind from today)

- **Rounds removed from before the reference event.** Deleting or editing
  down a session fired before the last cleaning lowers `round_count` but not
  `round_count_at`, so the figure drops by those rounds (floored at 0) and
  later rounds refill that gap first. Today's stored counter has the same
  error. Fixing it needs per-session dating of every counter move, which is
  out of scope.
- **A file exported before this change** has no `maintenanceEvents`. A
  firearm the import inserts from it shows `round_count` as its figure until
  maintenance is logged. The maintainer chose not to carry the phone's data
  across (2026-10-13).
- **A firearm matched by name** to a different local firearm gets the file's
  events, whose `round_count_at` values come from the file's counter. Licenses
  are attached the same way today.

## 4. Tests (behavior → test)

| Id  | Test                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | `migrations.test.ts` (baseline hash), `web-rows.test.ts` A1 column parity, `rows.test.ts`                                                              |
| M2  | `shared/src/firearms/maintenance-counter.test.ts`: no events; one event; adjustment ignored; deleted ignored; newest by date not by creation; tie by id; floor at 0 |
| M3  | `maintenance-events.test.ts`: log leaves the firearm row untouched; delete the newest restores the previous figure                                   |
| M4  | `round-count.test.ts`, `maintenance-events.test.ts` (adjust), `rows.test.ts` (`withRoundsAdded`/`withRoundsMoved` emit no `rounds_since_maintenance`) |
| M5  | `maintenance-due.test.ts`: crossing from a move with a logged event; no notification when below; none on log or delete                               |
| M6  | `from-rows.test.ts`, `import.test.ts` (valid, invalid entry skipped, missing array defaults to `[]`), app `round-trip.test.ts` (figure survives), `import-round-counters.test.ts`, `archive.test.ts` |

Tests change only where they assert the dropped column or the old export
shape.

## 5. Gates

`pnpm check`, `pnpm mutation` (touched modules), `pnpm mutation:schema`,
backend `pnpm test -- --testTimeout=60000`, the three docs gates. Real
execution: the web preview with `/dev` demo data (log, adjust, delete an
event, watch the figure) and a JSON export → wipe → import.

## 6. Docs

Manual EN + SV: `guides/firearms-and-ammunition` (what the figure counts
from, deleting an entry restores it), `guides/exporting-sessions` (the export
now carries maintenance history; example JSON), regenerated export JSON
Schema. `docs/implementation-plan.md` schema block. No new dependency.

## 7. Coordination

#800 (time-based reminders) needs the same reference event; it should import
`latestMaintenanceEvent` from `shared/src/firearms/` rather than pick its own.
#799 and #800 also edit `firearms`; whichever merges second regenerates the
baseline.
