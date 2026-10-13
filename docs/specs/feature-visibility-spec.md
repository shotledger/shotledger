# Hide the features you don't use — executable specification

> Old-coder SPEC for #801. Evidence report: `docs/specs/feature-visibility-evidence.md`.
> Decision records: ADR 0019 (settings sync per user, for an allowlist).
>
> **Approval status: not obtained (autonomous run).** Written and implemented
> overnight on 2026-10-13 at the maintainer's request to take #801 end to end
> while he slept. This spec is the artifact to review after the fact; any
> change he asks for lands as a follow-up.

- **Tier: 3 for the sync part, normal UI testing for the rest.** Five keys join
  `SYNCED_SETTING_KEYS`. A wrong rule leaks a device-local key, refuses a valid
  push, or lets the web write a value the phone does not read.
- **Scope:** `shared/src/features/` (the feature list and its reader),
  `shared/src/sync/protocol.ts` (allowlist), `shared/src/sync-client/`
  (account settings reader and writer), `app/src/db/migrations/0000_baseline.sql`
  (the settings triggers' WHEN clause; baseline reset, hard rule 8), the phone
  entry points in §3, `web/src/settings/`, `web/src/entry/`, `web/src/edit/`,
  `web/src/sessions/`, `app/src/i18n/{en,sv}.json`, `docs/manual/` EN + SV.
- **Not in scope:** maintenance and cleaning (#800 is reworking it on another
  branch; a follow-up can add it), tags, the share card, location lookup (already
  opt-in), external sites (each already has its own switch, ADR 0010), the
  Optional Fields switches (they stay device-local), Records and statistics.

## 1. Settled inputs (from the issue, not re-asked)

1. A **Features** page in Settings with one switch per optional area; core
   logging and statistics stay on.
2. Hiding an area removes its entry points. It never deletes data, and turning
   it back on restores everything.
3. Hidden areas keep working underneath: sync, export, backup and compliance
   counting are unchanged.
4. Stored in `settings` and synced, so the web shows the same areas (PRODUCT.md
   principle 5).

## 2. Design

### 2.1 The areas (`shared/src/features/visibility.ts`)

| Feature id        | Setting key           | Area                                             |
| ----------------- | --------------------- | ------------------------------------------------ |
| `licenseActivity` | `showLicenseActivity` | The licence activity status and firearm criteria |
| `photos`          | `showPhotos`          | Target photos and photo scoring                  |
| `timer`           | `showTimer`           | The shot timer                                   |
| `sightSettings`   | `showSightSettings`   | Sight settings (clicks) per firearm              |
| `ammoLots`        | `showAmmoLots`        | Ammunition lots                                  |

- One boolean key per area, not one list: two devices hiding two different
  areas offline then both keep their change, since each key is its own row
  (last write wins per row, ADR 0003). It also keeps the web writer's
  per-key comparison as it is.
- **Unset reads as shown.** Only the stored JSON `false` hides an area;
  `true`, `null`, a non-boolean or a malformed value read as shown. A fresh
  install shows everything, and nothing an old or foreign writer produced can
  hide an area by accident.

### 2.2 Rule for every entry point

**Hidden means: no way in to start something new in that area, and its own
screens leave the menus. Anything already recorded on a session or firearm
still shows where it is recorded.** This is the Optional Fields rule (#569)
applied to whole areas. Routes stay registered, so a deep link still opens.

### 2.3 Sync

- `SYNCED_SETTING_KEYS` gains the five keys, in table order, after the
  existing five. The app's settings triggers list the same ten.
- `PROTOCOL_VERSION` stays 1 and the server storage is unchanged (hard rule 8).
  The server's allowlist check reads `isSyncableSettingRow`, so it accepts the
  new keys without a code change.
- The DB baseline is reset (the WHEN clause changes), with the `baseline sha256`
  line in `migrations.js` updated.

## 3. Behaviour

### 3.1 Shared (Tier 3)

- **F1** `readFeatureVisibility(get)` returns all five `true` when `get`
  returns `undefined` for every key.
- **F2** A key whose decoded value is `false` reads as hidden; `true`, `null`,
  `0`, `"false"` and `undefined` read as shown.
- **F3** `FEATURE_IDS` and `FEATURE_SETTING_KEYS` are pinned value by value,
  in the table's order.
- **S1** `SYNCED_SETTING_KEYS` equals the ten keys, in order; each new key is
  `isSyncedSettingKey`. Device-local keys (`theme`, `trackHandloads`,
  `photoTrainingConsent`) still are not.
- **S2** `readAccountSettings` reads each `show*` key: absent → `true`,
  stored `false` → `false`, stored `"x"` (not JSON) → `true`, tombstone-shaped
  or foreign-id row → `true`.
- **S3** `buildSettingsChanges` pushes one `settings` row per changed `show*`
  key, valued `true`/`false`, in `SYNCED_SETTING_KEYS` order, and refuses a
  non-boolean (`notAllowed`).
- **S4** The phone's settings triggers enqueue each new key and still skip a
  device-local key (`app/src/db/queries/settings.test.ts`, real schema).
- **S5** A row the web builds for a `show*` key applies to the phone's schema
  and reads back through the phone's own reader as the same value.
- **S6** The backend accepts a push of a `show*` key and still refuses a
  device-local key (`backend/test/`).

### 3.2 Phone

- **P1** Settings shows a **Features** row opening `/settings/features`: one
  switch per area, with a one-line hint each and an intro saying hiding never
  deletes anything. A switch writes its key at once.
- **P2** `licenseActivity` hidden: no licence activity chip on Home, no chip
  per firearm on the Firearms tab, and no Licence Activity or Firearm Criteria
  card on a firearm. Settings → Compliance stays (it is a setting), and the
  licence card on a firearm stays (it is the licence, not the activity).
  Compliance PDF and notifications are unchanged.
- **P3** `photos` hidden: no Photos row in Tools; adding or opening an empty
  series goes straight to the keypad (no photo/keypad choice, a remembered
  "photo" is not followed); the series screen has no Add/Replace Photo
  button; the session edit form has no series-entry-mode control; Settings has
  no Improve Automatic Scoring row. A series that already has a photo keeps
  its photo icon and thumbnail, and the group view stays.
- **P4** `timer` hidden: no Timer row in Tools.
- **P5** `sightSettings` hidden: no Sight Settings card on a firearm and no
  Sights button on a session. The session stopwatch stays.
- **P6** `ammoLots` hidden: the Firearms tab shows firearms only (no
  Firearms/Ammo switch, no ammo FAB); Statistics has no Compare Ammo row; New
  Session has no Ammo Lot picker and saves no lot; Edit Session shows the
  picker only when the session already has a lot. A session's lot still shows
  on its detail.
- **P7** The Tools tab is hidden when the timer and photos are both hidden and
  no external site is enabled, since it would be empty.
- **P8** A change made on another device shows after the next sync and on the
  next screen focus, without a restart.

### 3.3 Web (mirrors the phone)

- **W1** Settings has a **Features** section with one checkbox per area (all
  five, as on the phone), saved with the page's one Save.
- **W2** `photos` hidden: series entry has no photo upload; Sessions has no
  pick-photos controls and `#compare` shows the Sessions list. A series photo
  that exists still shows on the detail and the edit form.
- **W3** `ammoLots` hidden: series entry has no Ammo Lot field and pushes no
  lot; the edit form shows the field only when the session has a lot. The
  detail still shows a lot that is set.
- **W4** `licenseActivity`, `timer`, `sightSettings`: the web shows none of
  them, so only the switch applies.

### 3.4 Must not

- **N1** Hiding writes nothing but its own setting row: no session, series,
  photo, ammo lot, firearm or sight setting is changed or deleted.
- **N2** Export, backup and sync carry hidden areas' data unchanged.
- **N3** Compliance status is computed as before.
- **N4** Existing tests keep passing, unweakened.

## 4. Setup plan

- No new dependency.
- Files added: `shared/src/features/{index,visibility,visibility.test}.ts`,
  `app/src/app/settings/features.tsx`, `app/src/features/settings/feature-visibility.ts`,
  this spec and its evidence report, `docs/manual/guides/hiding-features{,.sv}.md`.
- `stryker.config.json` `mutate` gains `shared/src/features/*.ts`.
- Branch `feature/issue-801-hide-unused-features-ubbn4j`, Conventional Commits, DCO sign-off.
