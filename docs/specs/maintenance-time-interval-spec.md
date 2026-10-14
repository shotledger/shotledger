# Maintenance by time as well as by rounds — spec

Issue [#800](https://github.com/shotledger/shotledger/issues/800).

**Spec approval: not obtained (autonomous run).** The issue text is the input;
this document is the artifact for review after the fact. Tier 2 (normal
feature): no money, auth or regulation. The risk is a reminder that is wrong
or silent, addressed by the tests named under each rule.

## Problem

Maintenance reminders were by round count only. A firearm shot rarely, or put
away for the winter, never came due, though it may need service after months
in a safe.

## Rules

- **M1 Optional time interval.** `firearms.maintenance_interval_months`
  (INTEGER, NULL = none), next to `maintenance_interval_rounds`. The phone
  accepts whole months 1–120 (`MAINTENANCE_INTERVAL_MONTHS_MAX`); blank clears
  it. No default and no built-in schedule: a recommended interval per weapon
  group would be a guessed value (root `CLAUDE.md` rule 4).
- **M2 What it counts from.** The latest `performed_at` of the firearm's live
  maintenance events, excluding round-count adjustments (not maintenance);
  with none, the firearm's `created_at`. The same event the derived rounds
  since maintenance counts from (#727, `latestMaintenanceEvent`), so both
  halves restart together. (`lastMaintenanceAtByFirearm`,
  `maintenanceCountedFrom`.)
- **M3 Calendar months, local days.** Due day = the local day counted from,
  plus N calendar months, clamped to the month's last day (31 Jan + 1 →
  28/29 Feb). (`maintenanceDueDay`.)
- **M4 Status.** The time half uses the round half's thresholds on elapsed
  days: amber from 80 % of the interval's days, red from the due day.
  The firearm's status is the worse of the two halves; `unknown` only when
  neither interval is set. (`maintenanceTimeStatus`, `maintenanceDue`.)
- **M5 Saying why.** When due, the detail screen names each limit reached:
  "Due: 500 rounds since the last maintenance", "Due: 6 months since the last
  maintenance" (or "since the firearm was added" under M2's fallback). While
  a time interval is set and not yet reached it shows "Next maintenance by
  <date>". The firearms list chip uses the combined status.
- **M6 Notification.** A local notification at 09:00 local time on the due
  day (`maintenanceTimeNotificationAt`, `MAINTENANCE_REMINDER_HOUR`), on the
  existing **Maintenance** channel and text. All time reminders are replaced
  together (`replaceMaintenanceTimeReminders`), so a changed interval, a
  logged maintenance or a deleted firearm leaves none stale. They are
  refreshed at app start, on return to the foreground and after each
  completed sync (an interval or maintenance from another device), never
  prompting for permission; saving an interval prompts. Saving an interval
  that is already reached notifies at once, as before for rounds. An archived
  firearm gets no time reminder (#799); archiving and restoring refresh the
  set.
- **M7 Export and sync.** The JSON export carries `maintenanceIntervalMonths`
  (1–120 or null; absent reads as null), and an import restores it. Sync is
  table-agnostic (`sync_rows` payloads), so the column travels with no
  protocol change; the web's counter moves spread the pulled row and keep it.
- **M8 Web.** The web has no firearm or maintenance screen, so there is
  nothing to mirror; its writes keep the column (M7). Stated, not silent.

## Evidence

| Rule   | Test                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1     | `app/src/features/firearms/round-adjustment.test.ts` (`parseMaintenanceIntervalMonths`)                                                                    |
| M2     | `app/src/db/queries/maintenance-events.test.ts`, `app/src/features/firearms/maintenance.test.ts`                                                           |
| M3, M4 | `shared/src/firearms/maintenance-time.test.ts` (TZ Europe/Stockholm; 100 % mutation score)                                                                 |
| M5     | Web preview screenshots on the PR (demo data)                                                                                                              |
| M6     | `maintenance-time.test.ts` (`maintenanceTimeNotificationAt`), `maintenance.test.ts`, `archive-firearm.test.ts`                                             |
| M7     | `shared/src/json-export/import.test.ts`, `round-trip.property.test.ts`, `app/src/db/json-export/round-trip.test.ts`, `app/src/db/queries/web-rows.test.ts` |

## Out of scope

- Per-weapon-group recommended intervals (M1).
- A notification for a time limit that passed while the app was never
  opened beyond the scheduled one; the status shows it on next open.
