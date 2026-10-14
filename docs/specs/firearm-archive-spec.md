# Archive a firearm (#799)

**Spec approval: approved** by the maintainer on 2026-10-13, including the
licence-check rules below.

A sold, returned or retired firearm leaves the active lists and the pickers;
everything it owns stays. Tests: `app/src/db/queries/firearm-archive.test.ts`
(ids below), `app/src/features/firearms/archive-firearm.test.ts`,
`app/src/db/json-export/round-trip.test.ts`, `web/src/firearms/active.test.ts`,
`web/src/settings/model.test.ts`.

## Data

- `firearms.archived_at` (text, nullable): NULL is active. Folded into the
  baseline, as every schema change pre-1.0 (CLAUDE.md rule 8). An install on
  the old baseline needs its data cleared.
- `archiveFirearm` stamps it and bumps `updated_at`; archiving again keeps the
  first date (A3). `restoreFirearm` clears it; on an active firearm it is a
  no-op (A4). Neither touches a tombstoned firearm (A5).
- **Sync**: no protocol change. The payload is the row column for column, so
  `archived_at` travels with the next push of the row (S1) and applies on pull,
  including a pulled NULL that restores (S2). An older build drops the unknown
  column, as `applyOne` already does for any newer column.
- **JSON export**: `FirearmExport.archivedAt`, defaulting to null for files
  that lack it; `formatVersion` stays 1. Import writes it like every other
  descriptive field (the file wins).

## What reads it

| Reader                                                     | Archived firearm                      |
| ---------------------------------------------------------- | ------------------------------------- |
| Firearms list                                              | Behind **Show Archived**, no chips    |
| New session, WebShooter import, web entry and bulk pickers | Not offered (L1)                      |
| Session edit, phone and web                                | Offered only to its own sessions      |
| Default firearm for a weapon group                         | Never proposed (P1)                   |
| License Check screen (#815)                                | Not listed                            |
| Firearm detail                                             | Opens; Archived card with **Restore** |
| Session list filter, statistics, export, import matching   | Unchanged: history (L1, L2, H1)       |
| Maintenance-due notification                               | Silent (N1)                           |
| Licence expiry reminders                                   | Cancelled; restored on **Restore**    |

## Licence check (FAP 551-3)

- **Sessions shot with it still count** towards 5 §/6 § activity (C1). The
  requirement is on the shooter's shooting, not on a firearm held today
  (`docs/manual/explanation/license-activity.md`, "What counts").
- **It is not a firearm the shooter has**: it leaves the ownership facts that
  propose the 5 §/6 § case (C2, phone and web alike) and the weapon groups the
  overall activity covers (C3). Groups of a tombstoned firearm drop out too
  (C4), which they did not before.
- Its own licence activity chip and the two per-firearm föreningsintyg
  criteria are not shown: there is no licence to keep and no permit to renew.
