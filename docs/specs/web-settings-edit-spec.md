# Editing account and compliance settings on the web — executable specification

> Old-coder SPEC for layer 3 of #301 (web write paths). Evidence report, once
> written: `docs/specs/web-settings-edit-evidence.md`. Decision record:
> ADR 0019 (web writes by pushing rows through `/sync/push`; settings sync
> per user for an allowlist of five keys). Builds on layer 2 (#669, the web
> write client, `docs/specs/web-series-entry-spec.md`).
>
> **Approval status:** approved first-hand by the maintainer on 2026-10-08
> (C1–C8, R1–R12), with three changes recorded as R13–R15: an unset profile is
> not pre-highlighted (C3, R6), the phone's two compliance functions move to
> `shared/` (C4), and the pickers are radio groups (§3.2).

- **Tier: 3.** It writes synced `settings` rows. A malformed row is not
  caught on the web: it reaches every phone on the account. A value the
  phone does not expect (a skill class `"4"`, a profile id the phone does
  not know) changes what the phone's compliance status and class defaults
  say, silently.
- **Scope:** `shared/src/sync-client/{rows,settings-edit}.ts` (a settings row
  builder; the build for the five keys, on #669's reader), three option lists
  and two compliance functions moved to `shared/` (§2 C4), `web/src/settings/` (a Settings page), `web/src/api.ts`
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
case is stored, the page shows the case the phone derives from the firearms
(`resolveComplianceCase`, from the pulled firearms) and says it was proposed,
with the phone's reason. It is not written unless the user changes it — the
phone's rule that a derivation never authors a choice. _Changed by R13:_ when
no profile is stored, no profile is highlighted and the case section shows
nothing; one line says no profile is chosen and the phone uses its
language's default. The function is the phone's own, in `shared/` (R14).

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
No value is restated in `web/`. _Completed by R14:_ the phone's
`resolveDefaultProfileSelection` and `resolveComplianceCase` move to
`shared/src/compliance/` too. The reader of the five keys,
`readAccountSettings`, is #669's (`shared/src/sync-client/account-settings.ts`,
#669 R26).

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
(the phone's fallbacks: `null`, `false`; `readAccountSettings` in
`shared/src/sync-client/account-settings.ts`, #669's P1–P4). It is
overwritten only if the user sets that field. A stored case is kept as-is: whether it applies is the
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
// shared/src/sync-client/account-settings.ts (#669)
interface AccountSettings {
  birthYear: number | null;
  skillClass: SkillClass | null;
  competesInWomensClasses: boolean;
  complianceProfile: ProfileSelection | null;   // null = no choice stored
  complianceProfileVariant: string | null;      // null = no choice stored
}
readAccountSettings(rows: ReadonlyMap<string, Payload>): AccountSettings

// settings-edit.ts
buildSettingsChanges(before, after, pulled, { newChangeId, now, currentYear })
  → { ok: true; changes: ClientChange[] } | { ok: false; errors: SettingsError[] }
newSettingRow(key, value, now, pulled?): Payload            // rows.ts

// shared/src/compliance/ (moved from the phone, R14)
resolveDefaultProfileSelection(locale: string): ProfileSelection
resolveComplianceCase(selection, storedVariantId, facts): ResolvedComplianceCase
```

- `readAccountSettings` applies C7. A row whose payload `id` is not its key
  is ignored (`isSyncableSettingRow`).
- `buildSettingsChanges` compares each key of `before` and `after` in
  `SYNCED_SETTING_KEYS` order and emits a change for each one that differs.
  A changed value is validated first; any invalid value refuses the whole
  build (`{ key, kind: 'notAllowed' }`), nothing built:
  birth year ∈ `birthYearOptions(currentYear)`; skill class ∈ `SKILL_CLASSES`;
  women's classes a boolean; profile ∈ `PROFILE_SELECTIONS`; case ∈ the
  variants of `after`'s profile. A case changed under a profile that offers
  no cases, or with no profile stored, is dropped, not refused (R4, R13).
  Changing a value to `null` is refused (C6).
- Each change: fresh `clientChangeId`, `tableName: 'settings'`,
  `rowId = key`, `deletedAt: null`, `updatedAt = now`.

### 3.2 Web (`web/src/settings/`)

- `model.ts` (pure): the form = `AccountSettings` as stored (an unset
  profile stays unset, R13); the shown case and whether it was proposed, from
  `resolveComplianceCase`, nothing while no profile is stored;
  `hasChanges`; `needsBirthYearConfirm`.
- `save.ts`: Save/Retry as #669's `entry/save.ts` (C8), without the
  context pull.
- `settings.tsx`: renders. Birth year a `<select>`, class and profile and case
  as radio groups (native `<input type="radio">` under a `role="radiogroup"`
  named by its heading, so the arrow keys move the choice; R15), women's
  classes a checkbox. Save is disabled while nothing
  changed, while saving, and offline.

## 4. Scenarios

Every scenario maps 1:1 to a named test (name = id + title).

```gherkin
Feature: option lists (shared, vitest)
  Scenario: O1 SKILL_CLASSES is 1, 2, 3
  Scenario: O2 birthYearOptions(2026) runs 2016 down to 1926, 91 years
  Scenario: O3 PROFILE_SELECTIONS is none, then every registered profile

Feature: reading the pulled rows (moved to #669 as P1–P4,
         shared/src/sync-client/account-settings.test.ts; R16)
  Scenario: R1 each key's JSON text is decoded                        → P1
  Scenario: R2 absent rows read as unset: null, null, false, null, null → P2
  Scenario: R3 unparsable, wrong-typed and unknown values read as unset (C7) → P3
  Scenario: R4 a row whose payload id is not its key is ignored        → P4

Feature: the phone's compliance functions, moved (shared/src/compliance/*.test.ts; R14)
  Scenario: D1 the default profile is Sweden for a Swedish locale, None otherwise
  Scenario: C1–C6 resolveComplianceCase, the phone's tests moved unchanged

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
  Scenario: U1 the form opens on the stored values; an unset profile stays unset
              and shows no case (R13); an unset case shows the derived case as proposed
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
- **N8** `web/src/settings/` imports nothing from `app/src/` (R14; grep gate
  beside N1).

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

Appended after rebasing onto #669's review fixes (8860a12):

- **R8 (C8, as #669 R13/R14; new U7, U8).** A held request carries the id of
  the account it was built for. Save checks the signed-in account first: a
  different account drops the held request and says so
  (`web.settings.accountChanged`), so a Retry after signing in as someone
  else pushes nothing; no valid session keeps it held. While a request is
  held, the one action button reads **Retry** and resends it unchanged,
  without asking the birth-year question again. `web/src/settings/*.ts` joins
  the Stryker `mutate` list and with it the 100% coverage gate.

Appended after rebasing onto #669's full-review fixes (`caffb4d`) and the
full review of PR #672:

- **R9 (new U9).** A build that throws (for example `crypto.randomUUID`
  missing on a non-secure origin) fails the save with "Could not save"
  instead of leaving the page in "saving"; the page also guards the promise,
  as #669's R18.
- **R10 (new U10).** An answer whose acks do not match the request
  (`pushChanges` → `failed` with `unconfirmed`) may have landed, so the
  request is held for Retry with its own message, as #669's R19.
- **R11 (new U11).** Saved but the refresh failed: Save stays disabled, edits
  included, until the page is reloaded, so the stale baseline cannot push the
  same keys a second time.
- **R12 (new U12; replaces R8's account check as the main guard).** The page
  uses the shared inline sign-in (`web/src/sign-in-again.tsx`) and App's
  `onReauthenticated`. The same account clears the signed-out notice and
  keeps a held request; another account reloads the logbook and remounts the
  page (`key={generation}`), so nothing built from the old account's rows can
  be pushed to the new one. R8's held-request check stays as defence in depth.
  The page wrapper no longer repeats the form's `settings` class.

Approved first-hand by the maintainer on 2026-10-08 (C1–C8, R1–R12), with
three changes from an independent review:

- **R13 (C3 and R6 changed; B10, U1, U2 changed).** With no profile stored,
  the profile picker highlights nothing, and one muted line says no profile
  is chosen and the phone uses its language's default
  (`web.settings.profileUnset`). The browser's language is no longer used:
  it is not the phone's, so the web could show None where a Swedish phone
  shows Sweden. The case section shows nothing until a profile is chosen,
  because the cases depend on a profile the web cannot know. Choosing a
  profile still writes it (R6 stands). `buildSettingsChanges` loses
  `SettingsDeps.defaultProfile`: a case is checked against `after`'s stored
  profile only, and a case changed with no profile stored is dropped, as
  under a profile with no cases (R4). B10 now pins that drop and that
  choosing a profile writes it; B5 loses its "checked against the shown
  default" example.
- **R14 (C4 completed; new D1, N8).** The phone's pure
  `resolveDefaultProfileSelection` (`app/src/features/compliance/profile.ts`)
  and `resolveComplianceCase` (`…/resolve-case.ts`) move unchanged to
  `shared/src/compliance/default-profile.ts` and `resolve-case.ts`, exported
  from `@shotledger/shared`. Their jest tests (C1–C6) move with them to
  vitest unchanged, and D1 is new (the function had no test). The phone's
  `useComplianceProfile` hook stays in `app/` and imports both. The web
  imports `resolveComplianceCase` from `shared/`; after R13 it no longer
  calls `resolveDefaultProfileSelection`. N8 gates that
  `web/src/settings/` imports nothing from `app/src/`.
- **R15 (§3.2).** The class, profile and case pickers are radio groups:
  native radio inputs, styled as the earlier pills, inside a
  `role="radiogroup"` named by the field's heading. Tab enters the group at
  the chosen option (the first when none is), and the arrow keys move the
  choice, which is an edit like a click. No rendering test (the web package
  tests pure modules); checked in the browser.

Appended after rebasing onto #669's rulings round (`a0c61f5`):

- **R16 (scope; R1–R4 moved).** #669 R26 moved the read half of this
  module — `readAccountSettings`, `AccountSettings`, `SyncedSettingKey`,
  `SKILL_CLASSES`, `PROFILE_SELECTIONS` — to
  `shared/src/sync-client/account-settings.ts`, with R1–R4 as its P1–P4.
  `settings-edit.ts` keeps only the build and imports the reader; the
  duplicate definitions and tests are gone. `#settings` joins
  `web/src/shell/route.ts` (#669 R27), and the menu reads Sessions,
  Statistics, Enter Series, Settings, then Account. W1–W4 sign in at
  `https://localhost`, the origin better-auth now trusts locally (#677).
