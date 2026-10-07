# Editing account and compliance settings on the web — executable specification

> Old-coder SPEC for layer 3 of #301 (web write paths). Evidence report, once
> written: `docs/specs/web-settings-edit-evidence.md`. Decision record:
> ADR 0019 (web writes by pushing rows through `/sync/push`; settings sync
> per user for an allowlist of five keys). Builds on layer 2 (#669, the web
> write client, `docs/specs/web-series-entry-spec.md`).
>
> **Approval status: not yet approved by the maintainer.** The run that wrote
> this spec could not obtain approval first-hand; the key choices in §2 are
> listed in the PR for approval after the fact.

- **Tier: 3.** It writes synced `settings` rows. A malformed row is not
  caught on the web: it reaches every phone on the account. A value the
  phone does not expect (a skill class `"4"`, a profile id the phone does
  not know) changes what the phone's compliance status and class defaults
  say, silently.
- **Scope:** `shared/src/sync-client/{rows,settings-edit}.ts` (a settings row
  builder; read and build for the five keys), three option lists moved to
  `shared/` (§2 C4), `web/src/settings/` (a Settings page), `web/src/api.ts`
  (the push call renamed for both writers), `web/src/shell/`, app tests that
  apply web-built settings rows to the phone's real schema, one backend
  round-trip spec, `docs/manual/` EN + SV, `app/src/i18n/{en,sv}.json`
  (`web.settings.*`).
- **Not in scope:** any key outside `SYNCED_SETTING_KEYS`; device-local
  settings (language, theme, Optional Fields, timers, consents, backup); the
  märke table the phone's Personal page shows (derived, read-only); any
  shooting-data table; bulk editing (the remaining #301 item).

## 1. Settled inputs (not re-asked)

1. ADR 0019: the web pushes whole changed rows through `/sync/push`, online
   only; no browser database, no outbox. A synced setting is one row whose id
   is the key; `value` is the stored JSON text; a setting is never tombstoned.
2. `SYNCED_SETTING_KEYS` = `birthYear`, `skillClass`,
   `competesInWomensClasses`, `complianceProfile`, `complianceProfileVariant`
   (`shared/src/sync/protocol.ts`). The server already refuses any other key
   (`400 setting_not_synced`).
3. One Save is one `/sync/push`; Retry resends the identical request (#669 C2).

## 2. Key choices (for approval)

**C1. One Settings page, two sections, one Save.** A **Settings** page in the
shell menu (`#settings`), after Enter Series. Section **Personal**: Birth
Year, Your Class, Women's Classes (the phone's Settings → Personal). Section
**Compliance**: the profile, and the case within it when the profile offers
more than one (the phone's Settings → Compliance). One **Save** pushes every
changed key in one request.
_Alternative:_ save each field as it changes, like the phone. Not
recommended: on the web every change is a network round trip that can fail,
and one failure state per field is harder to read than one per page.

**C2. Only changed keys are pushed.** "Changed" means the value on the form
differs from the value the page opened with. Each changed key is one
`settings` row: `{ id: key, value: JSON.stringify(v), created_at, updated_at:
now, deleted_at: null }`, `created_at` kept from the pulled row (now when
there is none), exactly what the phone's `setSetting` writes. A key the user
did not touch is not pushed, so a phone's concurrent edit of another key
survives. Two devices editing the same key: the later push wins (ADR 0019).
No re-pull before Save: a settings row has nothing to merge, so a fresh pull
would not change what is pushed.

**C3. Unset values show the phone's defaults and are not written.** When no
profile is stored, the page shows the phone's locale default
(`resolveDefaultProfileSelection`, here from the browser's language). When no
case is stored, it shows the case the phone derives from the firearms
(`resolveComplianceCase`, from the pulled firearms) and says it was proposed,
with the phone's reason. Neither default is written unless the user changes
it — the phone's rule that a derivation never authors a choice. Both functions
are the phone's own, imported from `app/src/features/compliance/`.

**C4. Option lists come from one place.** The phone's allowed values are
inline in its screens today. They move to `shared/` unchanged and both the
phone and the web import them:

- `SKILL_CLASSES = ['1', '2', '3']` → `shared/src/disciplines/eligibility.ts`
  (beside the `SkillClass` type);
- `birthYearOptions(currentYear)`: years `currentYear − 10` down to
  `currentYear − 100`, newest first → same file;
- `PROFILE_SELECTIONS = ['none', ...profile ids]` →
  `shared/src/compliance/profile-registry.ts`.

Profile cases come from `getProfileDefinition(...).variants`, as on the phone.
No value is restated in `web/`.

**C5. Changing a set birth year asks first.** As on the phone, changing a
birth year that was already set is confirmed before saving, with the phone's
strings (`settings.birthYearChange*`): the veteran classes and age-reduced
märke thresholds recompute for sessions already logged. Setting it the first
time is not confirmed.

**C6. Nothing can be cleared.** The phone offers no way to unset any of the
five, so neither does the web: a field that is unset shows a placeholder, and
once set it can only be changed to another allowed value.

**C7. A stored value the web does not recognise reads as unset.** Unparsable
JSON, a wrong type, a skill class outside `SKILL_CLASSES`, a profile outside
`PROFILE_SELECTIONS` or a birth year that is not an integer shows as unset
(the phone's fallbacks: `null`, `false`). It is overwritten only if the user
sets that field. A stored case is kept as-is: whether it applies is the
profile's call (`resolveComplianceCase` treats a retired one as unset).
A birth year that is a valid integer but has aged out of the picker's range is
shown, kept in the list, and not written unless changed.

**C8. Failure handling is #669's.** `pushChanges` and the held-request rules
are reused: network and signed-out failures keep the request for **Retry**;
an edit drops it; offline disables Save; a signed-out failure offers the
inline sign-in. After a save, the page pulls the account again, so
Statistics uses the new birth year. A rejected settings ack (only possible if
some client tombstoned the row, which no ShotLedger client does) reads as
"Could not save".

## 3. Design

### 3.1 Shared, pure (`shared/src/sync-client/settings-edit.ts`, `rows.ts`)

```ts
interface AccountSettings {
  birthYear: number | null;
  skillClass: SkillClass | null;
  competesInWomensClasses: boolean;
  complianceProfile: ProfileSelection | null;   // null = no choice stored
  complianceProfileVariant: string | null;      // null = no choice stored
}
readAccountSettings(rows: ReadonlyMap<string, Payload>): AccountSettings
buildSettingsChanges(before, after, pulled, { newChangeId, now, currentYear })
  → { ok: true; changes: ClientChange[] } | { ok: false; errors: SettingsError[] }
newSettingRow(key, value, now, pulled?): Payload            // rows.ts
```

- `readAccountSettings` applies C7. A row whose payload `id` is not its key
  is ignored (`isSyncableSettingRow`).
- `buildSettingsChanges` compares each key of `before` and `after` in
  `SYNCED_SETTING_KEYS` order and emits a change for each one that differs.
  A changed value is validated first; any invalid value refuses the whole
  build (`{ key, kind: 'notAllowed' }`), nothing built:
  birth year ∈ `birthYearOptions(currentYear)`; skill class ∈ `SKILL_CLASSES`;
  women's classes a boolean; profile ∈ `PROFILE_SELECTIONS`; case ∈ the
  variants of `after`'s profile (the stored one, else the locale default
  the caller resolved). Changing a value to `null` is refused (C6).
- Each change: fresh `clientChangeId`, `tableName: 'settings'`,
  `rowId = key`, `deletedAt: null`, `updatedAt = now`.

### 3.2 Web (`web/src/settings/`)

- `model.ts` (pure): the form = `AccountSettings` with the profile resolved
  (C3); the shown case and whether it was proposed, from
  `resolveComplianceCase`; `changedKeys`; `needsBirthYearConfirm`.
- `save.ts`: Save/Retry as #669's `entry/save.ts` (C8), without the
  context pull.
- `settings.tsx`: renders. Birth year a `<select>`, class and profile and case
  as radio groups, women's classes a checkbox. Save is disabled while nothing
  changed, while saving, and offline.

## 4. Scenarios

Every scenario maps 1:1 to a named test (name = id + title).

```gherkin
Feature: option lists (shared, vitest)
  Scenario: O1 SKILL_CLASSES is 1, 2, 3
  Scenario: O2 birthYearOptions(2026) runs 2016 down to 1926, 91 years
  Scenario: O3 PROFILE_SELECTIONS is none, then every registered profile

Feature: reading the pulled rows (shared/src/sync-client/settings-edit.test.ts)
  Scenario: R1 each key's JSON text is decoded
    Given rows birthYear "1980", skillClass "\"2\"", competesInWomensClasses "true",
          complianceProfile "\"se\"", complianceProfileVariant "\"<a se case>\""
    Then readAccountSettings returns exactly those values
  Scenario: R2 absent rows read as unset: null, null, false, null, null
  Scenario: R3 unparsable, wrong-typed and unknown values read as unset (C7)
  Scenario: R4 a row whose payload id is not its key is ignored

Feature: building the push (shared/src/sync-client/settings-edit.test.ts)
  Scenario: B1 nothing changed → no changes
  Scenario: B2 one changed key → one settings change
    Then rowId = key, payload = { id, value: JSON text, created_at from the pulled row,
         updated_at: now, deleted_at: null }, updatedAt = now, deletedAt null
  Scenario: B3 a key with no pulled row gets created_at = now
  Scenario: B4 all five changed → five changes in SYNCED_SETTING_KEYS order,
              each parses with ClientChangeSchema, passes isSyncableSettingRow,
              and its value fits TEXT_LIMITS.settings.value
  Scenario: B5 a value outside the phone's lists is refused, naming the key; nothing built
    Examples: birth year 2020 and 1900 in 2026, 1980.5; skill class "4";
              profile "xx"; a case the profile does not offer; any key set to null
  Scenario: B6 an unchanged value is never validated or written
              (a birth year aged out of range survives a save of another key)
  Scenario: B7 property: for any two valid settings (fast-check), the changed rowIds
              are exactly the keys whose values differ, and JSON.parse of each value
              equals the edited value; no change is a tombstone

Feature: on the phone's schema (app/src/db/queries/web-settings.test.ts, better-sqlite3)
  Scenario: A1 column parity: newSettingRow's keys are the settings table's columns
  Scenario: A2 web-built settings apply on the phone
    Given the phone has birthYear 1975 set and nothing else
    When web-built changes for all five keys are applied with applyChangesSync
    Then getSetting returns each edited value, and the phone's
         resolveComplianceCase reports the edited case as the shooter's explicit choice
  Scenario: A3 nothing applied is re-queued (the outbox stays empty)

Feature: round trip (backend/test/web-settings.spec.ts, Workers pool, real D1)
  Scenario: W1 web settings pushed through the real HTTP transport are pulled by device B
  Scenario: W2 resending the same request answers duplicate and moves no seq
  Scenario: W3 per-key rows: B's later edit of skillClass survives the web's birthYear save;
              the web's later edit of the same key wins
  Scenario: W4 a revoked session token → unauthenticated, and nothing is stored

Feature: the page model (web/src/settings/*.test.ts)
  Scenario: U1 the form opens on the stored values; an unset profile shows the
              browser-language default; an unset case shows the derived case as proposed
  Scenario: U2 the case picker is offered only when the profile has more than one case
  Scenario: U3 changing an already-set birth year needs confirmation; setting it the first time does not
  Scenario: U4 Save is blocked offline, while saving, and when nothing changed
  Scenario: U5 a failed save holds the request; Retry resends it unchanged; an edit drops it
  Scenario: U6 a save refreshes the account; a rejected ack reads as failed
```

Browser checks (headless Chromium against local `wrangler dev`, synthetic
account; screenshots in the session scratchpad, never in the repo): change
the birth year (confirm), class, women's classes and the case, Save, reload,
see them; see the birth year on Statistics; save while offline; a second
device's edit of another key survives.

## 5. Must NOT

- **N1** No settings in browser storage: no `localStorage`, `sessionStorage`
  or IndexedDB in `web/src/settings/` (grep test, as #669's N1).
- **N2** Only the `settings` table, only `SYNCED_SETTING_KEYS` (B4, B7).
- **N3** Never a settings tombstone, never a `null` written (B5, B7).
- **N4** No outbox, no automatic retry (U5).
- **N5** No new endpoint, protocol change, server change or dependency.
- **N6** The phone's behaviour does not change: the moved lists keep the
  phone's values (O1–O3), and `pnpm check` stays green.
- **N7** No shooting-data table is written.

## 6. Setup plan

- **Isolation:** worktree `~/tmp/sl-301-settings`, branch
  `feat/web-edit-settings`, on top of `feat/web-series-entry-impl` (#669, not
  merged). The main checkout is shared with other sessions.
- **Git:** this spec committed first, then one commit per green layer, all
  DCO-signed Conventional Commits with explicit paths. PR stacked on #669.
- **Gauntlet:** existing. `pnpm coverage` (the `mutate` globs already cover
  `shared/src/sync-client/*.ts`, `shared/src/disciplines/*.ts` and
  `shared/src/compliance/**`), `pnpm mutation` (Stryker), fast-check for B7,
  the backend Workers pool for W1–W4, `pnpm check`, the docs gates. No new
  gauntlet files.
- **New dependencies:** none.

## 7. Revisions

Appended during implementation. None loosens a constraint.

- **R1 (B5 widened).** Changing the case while no profile is stored at all
  is refused too. The coverage gate found that branch untested; the example
  was added to B5 and watched failing against a mutant first.
- **R2 (U6 refined).** A rejected settings ack refreshes the account before
  the page says "Could not save", so the page shows what the server holds.
- **R3 (scope).** A fourth menu item made the phone-width menu and the
  account button overflow the screen. `web/src/styles.css` lets the narrow
  menu wrap and the account button truncate; no other page changes.

Appended after an independent review of PR #672 (2026-10-07):

- **R4 (B5 narrowed, new B9).** A case changed under a profile that offers
  no cases is **dropped from the build, not refused**: pick a case, switch to
  None, Save used to refuse the whole save with an unexplained "Could not
  save". Now the profile is saved and the case row is left as it was. B5's
  "case under None" example moves to B9. B7's generator now also produces
  profile `none` and an unset profile, so a regression is caught. The web's
  change detection agrees with the build, so a dropped case alone does not
  enable Save, and a build with no changes sends nothing.
- **R5 (C8).** The form is locked while a save is in flight, so an edit can
  no longer be overwritten by the refresh that follows. The web's language is
  fixed at page load (`web/src/i18n.ts`, no switcher), and the opened values
  no longer depend on it (R6), so no language change can reset the draft.
- **R6 (C3 changed, new B10).** An unset profile stays unset in the form; the
  page shows the locale default beside it. Choosing a profile — the shown
  default included — writes it, as tapping it does on the phone. A case is
  checked against the shown default while no profile is stored
  (`SettingsDeps.defaultProfile`).
- **R7 (new B8).** A pulled column this build does not know survives the
  rewrite of a settings row (pins `newSettingRow`'s spread).
