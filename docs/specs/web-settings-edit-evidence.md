# Evidence report — editing account and compliance settings on the web (Tier 3)

Spec: [`web-settings-edit-spec.md`](web-settings-edit-spec.md), including its
§7 Revisions R1–R16. R4–R7 answer an independent review of PR #672; R8
follows #669's review fixes; R9–R12 answer the full review of PR #672 after
the rebase onto `caffb4d`; R13–R15 are the maintainer's three changes at
approval; R16 is the rebase onto #669's rulings round (`a0c61f5`). The
numbers below are from the fresh run after R16.

- **Spec approval:** approved first-hand by the maintainer on 2026-10-08
  (C1–C8, R1–R12), with three changes recorded as R13–R15 (unset profile not
  pre-highlighted; the two compliance functions moved to `shared/`; real
  radio groups).
- **Source state:** commit `72588676` (branch `feat/web-edit-settings`, on
  `feat/web-series-entry-impl` (#669) at `d546999a`). This PR's own code is
  that of `bf70d4dd`; the rebase brought in only #669's verification fixes.
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, fast-check 4.10.2; backend vitest 4.1.11 with
  `@cloudflare/vitest-plugin`); Node 26.10.0.
- **Entry point:** `pnpm check`; `cd backend && npx vitest run
--testTimeout=60000`; `npx stryker run --mutate <the four modules below>`.
- **Independent verification:** round 2 verified `72588676` and returned
  `passed`; its description findings were fixed in this report afterwards.
  See _Independent verification_ below.

## Failure model (Tier 3)

| Way this can hurt                                                         | Layer that catches it                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A row the phone cannot apply (wrong columns, `null` in `value`)           | A1 (column parity), A2 (applied through `applyChangesSync` on the real schema), B5 (null) |
| A value the phone would never write (class `"4"`, unknown profile, case)  | B5 (each refused, nothing built), B7 (only the phone's lists are generated)               |
| A device-local key or another table written                               | B4, B7 (`settings` only, `isSyncableSettingRow`); the server's own 400 (layer 1, B3)      |
| A settings tombstone, which would lock the key forever                    | B7 (`deletedAt` and `deleted_at` null); hand mutant M3 below                              |
| Clobbering a phone's concurrent edit of another key                       | C2 (changed keys only), B6, W3, browser check 7                                           |
| A lost response, retried, writes twice or differently                     | W2 (replay → `duplicate`, no seq moves), U5, browser check 6 (identical request bodies)   |
| A default (locale profile, derived case) silently written as a choice     | B1, B10, U1, U4 (nothing changed → Save blocked); browser checks 1 and R13 (Save off)     |
| The web shows a profile the phone does not use (browser ≠ phone language) | U1, B10 (R13: nothing highlighted, no case); browser checks R13 in EN and SV              |
| An unrecognised stored value shown as something else or overwritten       | R3, B6 (unchanged values are neither validated nor written)                               |
| Settings left in browser storage                                          | N1 grep gate (negative control below)                                                     |
| The phone's Settings screens change behaviour                             | O1–O3, C1–C6, D1 pin what moved; `pnpm typecheck:app`; jest 708/708                       |

## Spec → test mapping

| Scenario                                                            | Test                                                                                  | Status |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| O1, O2                                                              | `shared/src/disciplines/eligibility.test.ts` › O1, O2                                 | pass   |
| O3                                                                  | `shared/src/compliance/profile-registry.test.ts` › O3                                 | pass   |
| R1–R4 (moved to #669, R16)                                          | `shared/src/sync-client/account-settings.test.ts` › P1…P4                             | pass   |
| D1, C1–C6 (R14)                                                     | `shared/src/compliance/default-profile.test.ts` › D1; `resolve-case.test.ts` › C1…C6  | pass   |
| B1–B6 (B5 per R1)                                                   | `settings-edit.test.ts` › B1…B6                                                       | pass   |
| B7 property (fast-check, 300 runs; reaches `none` and unset, R4)    | `settings-edit.test.ts` › B7                                                          | pass   |
| B8 (R7), B9 (R4), B10 (R13)                                         | `settings-edit.test.ts` › B8, B9, B10                                                 | pass   |
| A1–A3                                                               | `app/src/db/queries/web-settings.test.ts`                                             | pass   |
| W1–W4                                                               | `backend/test/web-settings.spec.ts` (Workers pool, real D1 + better-auth)             | pass   |
| U1–U3 (U1, U2 per R13), U4 (nothing changed)                        | `web/src/settings/model.test.ts`                                                      | pass   |
| U4, U5, U6 (per R2); empty build (R4); U7, U8 (R8); U9–U12 (R9–R12) | `web/src/settings/save.test.ts`                                                       | pass   |
| N1 no browser storage                                               | `save.test.ts` › N1 grep gate                                                         | pass   |
| N8 no imports from `app/src` (R14)                                  | `save.test.ts` › N8 grep gate                                                         | pass   |
| N2 settings only, allowlisted                                       | B4, B7                                                                                | pass   |
| N3 no tombstone, no null                                            | B5, B7                                                                                | pass   |
| N4 no outbox, no auto retry                                         | U5 (push only on Save/Retry); `save.ts` has no timer                                  | pass   |
| N5 no endpoint/protocol/dep change                                  | W1 (real `/sync/push`); diff touches no `backend/src`, no `package.json`, no lockfile | pass   |
| N6 phone unchanged                                                  | O1–O3, C1–C6, D1; `pnpm typecheck:app`; jest 708/708                                  | pass   |
| N7 no shooting-data table                                           | B4, B7 (`tableName` always `settings`)                                                | pass   |
| Browser checks (R15 radio keyboard included)                        | headless Chrome over CDP against `wrangler dev`; see below                            | pass   |

## Gauntlet (final fresh run, after the last code edit)

| Layer                                           | Command                                                                                                                                                                                 | Result                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check` (vitest TZ pinned to Europe/Stockholm by #669)                                                                                                                             | exit 0; vitest 186 files, 3114 tests passed; jest 62 suites, 708 tests passed; i18n 1238 keys, 0 issues (at `72588676`, verifier's rerun) |
| Coverage (gated)                                | `pnpm check` (100% threshold; `web/src/entry/*.ts`, `web/src/reauth.ts`, `web/src/settings/*.ts` and `shared/src/compliance/**` in scope)                                               | 100% statements 3637/3637, branches 2283/2283, functions 854/854, lines 3094/3094 (at `72588676`)                                         |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                                                                                                      | 19 files, 196 tests passed (W1–W4 included)                                                                                               |
| Mutation                                        | `npx stryker run --mutate shared/src/sync-client/settings-edit.ts,shared/src/compliance/default-profile.ts,shared/src/compliance/resolve-case.ts,web/src/settings/model.ts` (after R16) | 127 killed, 3 survived, all equivalent (below): 97.69%; `default-profile.ts` 6/6                                                          |
| Property-based                                  | B7 (fast-check, 300 runs)                                                                                                                                                               | pass                                                                                                                                      |
| Property suite alone                            | 4 hand mutants, `-t B7` (before R13; B7's assertions unchanged since)                                                                                                                   | 4/4 killed (below)                                                                                                                        |
| Suite health                                    | `npx vitest run --sequence.shuffle shared/src/sync-client shared/src/compliance web/src app/src/db/queries/web-settings.test.ts` × 3                                                    | 443 tests passed each time                                                                                                                |
| reqstool                                        | `pnpm reqstool:tags && pnpm reqstool:status` (after a fresh `pnpm check`)                                                                                                               | 21 passed, 0 failed, 0 SVCs missing tests                                                                                                 |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check`                                                                                                                  | built; 25 translated pages current; no dangling anchors                                                                                   |
| Supply chain                                    | `pnpm licenses:check` (in `pnpm check`); diff review                                                                                                                                    | no dependency added or removed; no new network, storage or env use                                                                        |

**Survivors.** Three, all equivalent; each rests on
`getProfileDefinition(null)` finding no profile, as `'none'` does:

- `settings-edit.ts:39` `profile === null` → `false` (`offeredCases`):
  `getProfileDefinition(null)` reads `PROFILES[null]`, `undefined`, so the
  result is `[]` either way. The check is there for the type.
- `model.ts:48` `if (selection === null) return NO_CASE` → `if (false)`:
  `resolveComplianceCase(null, …)` then returns no case and `offeredCases`
  `[]`, the same view as `NO_CASE`.
- `resolve-case.ts:39` `storedVariantId !== null &&` → `true`: no variant id
  is `null`, so `some(...)` is false for a null id either way. Moved
  unchanged (R14); `app/` was outside Stryker before.

The earlier reader survivors (`row === undefined`, the empty `catch`) left
with the reader to #669's `account-settings.ts`. Three are in lines this
change did not touch: `profile-registry.ts:52` and `:91`, and
`eligibility.ts:169` (`isJunior`). Recorded, not fixed here (scope).

**Property suite alone** (`-t B7`), each mutant applied, run, restored with
`git checkout`:

| Mutant                                             | Result |
| -------------------------------------------------- | ------ |
| M1 every key counts as changed                     | killed |
| M2 `value: String(value)` instead of JSON text     | killed |
| M3 a change carries `deletedAt: now` (a tombstone) | killed |
| M4 a valid skill class is refused (fail-closed)    | killed |

After R4, removing the drop clause (a case under a profile with none) turns
B7 alone red, and removing `newSettingRow`'s `...pulled` spread turns B8 red.

**Negative controls.** N1: appending `// localStorage` to `save.ts` turned
the gate red; restored, green. N8: appending an import from
`../../../app/src/…` to `model.ts` turned the gate red; removed, green.

**RED for R13.** B10 and the new U1/U4 assertions pass against the old code
when it is given no default, because an absent default finds no profile.
Run as the old page called it — a Swedish browser, `defaultProfile: 'se'` —
B10 failed (the old build wrote a case with no profile stored), and U1 and
U4 failed (the old model showed Sweden's cases and counted a case change).
D1 passed on first run against the moved function; a throwaway mutant
(`startsWith` → `includes`) turned it red, restored. A2 passed on first run against the existing
builder, so it was proven with a throwaway mutant (`String(value)` in
`newSettingRow`): A2 failed, restored, green. R1's new B5 example was run
against `?? 'se'` first and failed.

## Real execution (browser checks)

`wrangler dev` on port 8799 with its own persisted state, a synthetic account
seeded through `/sync/push` (birth year 1975, class 2, one owned pistol, one
session), the built web app served by the Worker, headless Chromium over CDP.
Every check below printed PASS. Screenshots are in the session scratchpad,
not the repo.

1. The page opens on 1975 and class 2; Save is disabled; no case picker under
   **None** (the English browser's default profile).
2. **Sweden (FAP 551-3)** shows the case picker with **Already Have One**
   proposed, and the phone's reason "Because you have a pistol or revolver
   on file marked as your own."
3. Birth year 1980, class 3, women's classes on, **First Handgun**, Save →
   the phone's birth-year confirmation; nothing pushed until **Change**.
4. **Change** → one `/sync/push`; the server held all five rows with the
   expected JSON text.
5. Reloaded: the page shows 1980, class 3, Sweden, First Handgun, "Your own
   choice".
6. Offline → Save disabled, "You are offline…". A push failed in flight →
   "Could not reach the server. Your changes are still here." and **Retry**;
   Retry sent a byte-identical request body and saved.
7. A second device set birth year 1985 after the page opened; the web then
   saved only women's classes. The server held 1985 and `false`, and the page
   showed 1985 after its refresh.
8. Swedish UI at 390 px wide: no horizontal scroll (`scrollWidth` 390).

After R4–R7, on fresh synthetic accounts (`scratchpad/s301/drive-r4.mjs`),
all PASS: with no profile stored, choosing the shown **None** enables Save
and stores `"none"` (R6); Sweden saved, then a case picked and the profile
switched back to None → saved, profile `"none"`, no case row (R4); the form
fieldset is disabled while a held push is in flight and enabled after (R5).
The original 16 checks pass again on a fresh account.

After R8 (`scratchpad/s301/drive-r8.mjs`, two fresh accounts A and B), all
PASS: a push lost in flight holds A's request; A's session revoked elsewhere
→ "You have been signed out…", the button reads **Retry**, the inline
sign-in shows; signing in there as B and pressing Retry → "You are now
signed in to another account, so your changes were not sent…", no
`/sync/push` sent, B's class unchanged, A's class unchanged.

After R12 that same run (`drive-r8.mjs`) instead shows the page reloading as
B with no Retry offered; still no `/sync/push`, both accounts unchanged.
`drive-review.mjs` (two fresh accounts, A born 1975 and B born 1990), all
PASS:

- the same account signing in again clears the signed-out notice, keeps the
  draft, and the next Save stores it to A;
- A's session revoked, then a fresh Save, then inline sign-in as B: the page
  shows B's 1990, the notice is gone, A's draft is gone and Save is off; a
  class change then saves to B from B's own row while A is untouched;
- the push succeeds but the refresh pull fails: "Saved. Reload…", Save is
  off, and stays off after another edit.

`drive-settings.mjs` (16 checks) and `drive-r4.mjs` pass again on fresh
accounts; `drive-r4.mjs` gained a wait after reading a status mid-render.

After R13–R16 (`scratchpad/drive-r13.mjs`, `wrangler dev` with its own
state, the built web app, headless Chrome over CDP, two fresh synthetic
accounts; `.claude/skills/run-app`'s COOP/COEP proxy is for the phone app's
OPFS database and is not needed here), all PASS:

- a new account opens with two radio groups (class, profile), no profile
  checked, no case group, Save off, and one muted line: "No profile chosen.
  Your phone uses the default for its language." In Swedish at 390 px: "Ingen
  profil vald. Telefonen använder standardvalet för sitt språk.";
- keyboard: Tab from the birth year enters the class group at 1 without
  choosing it; ArrowRight twice chooses 3, ArrowLeft 2; Tab twice reaches
  the profile group at None without choosing it; ArrowRight chooses Sweden,
  the line goes and the case group appears with the derived case; the focus
  ring shows on the focused pill;
- Save → "Saved."; after a reload the page shows class 2 and Sweden.

## Layers not run as specified

- **SUBSTITUTED:** mutation ran on the four modules R13–R16 changed or
  moved, not the whole `stryker.config.json` list. Cannot detect a weakened test elsewhere,
  which this change does not touch.
- **SUBSTITUTED:** suite health is three shuffled runs of the changed suites,
  not every suite.
- **N-A:** the web page's React rendering has no automated test (the web
  package tests pure modules only, as in #669); the browser checks cover it.

## Structural blind spot

The phone's apply path is exercised on better-sqlite3, not expo-sqlite (A2).

## Known limits

- Two devices editing the same key: the later push wins (ADR 0019). The web
  does not re-pull before Save (C2), so a phone's edit of the same key made
  while the page was open is overwritten without a warning.
- A stored value the web does not recognise reads as unset and is
  overwritten only if the user sets that field (C7).

## Honest notes

- The independent review found R4: a reachable edit sequence (case, then
  None) that the build refused with a message that explained nothing, and
  B5 asserted that refusal. The author's adversarial pass missed it.

- The coverage gate failed once (99.95% branches): the "case with no profile
  stored" branch had no test. Added as B5's R1 example, proven against a
  mutant, not by touching the code.
- The first narrow-width screenshot showed the menu, now four items, and the
  account button overflowing 390 px. Fixed in CSS (R3).
- The Swedish run first rendered English: headless Chromium ignores `--lang`
  for `navigator.language`; the driver overrides it.
- After the rebase onto `a0c61f5`, W1–W4 failed with a 500 at sign-up: #677
  has better-auth trust only its configured origins, and this spec still
  signed in from `https://example.com`. It now uses `https://localhost`, as
  the other backend specs do (R16).

## Independent verification

- Verifier: Claude Code, Fable 5.1; fresh context; given the repo @
  `72588676` + the task contract + the SPEC + the entry point. Not given the
  builder's conversation. Correlation broken: task context. Not broken:
  model.
- Rounds: 2 (cap 2). Round 1 (`39b8391`): the findings recorded above
  (R4–R7). Round 2 (`72588676`) verdict: `passed`.
- Attacked in round 2: the run (every gate reproduced from `72588676`);
  spec vs contract (the web's rows and behaviour against the phone's
  `personal.tsx`, `compliance.tsx`, `use-compliance-profile.ts`,
  `setSetting`/`getSetting` and `applyOne`; two devices, Retry, account
  switch, a default written as a choice, the moved functions); test-gaming
  (14 hand mutants, all killed, and Stryker on the seven touched gauntlet
  modules: 387 mutants, 382 killed, 1 timeout, 4 survived, all proved
  equivalent, 98.97%); a throwaway jsdom probe of the render layer (R13
  nothing highlighted and the hint line, R15 labelled radio groups, the
  birth-year confirmation, Retry without asking again, the form lock); the
  N1 and N8 gates fed known-bad input (both fail); the mapping in both
  directions (complete).
- Findings, graded by the maintainer as description, fixed and disclosed,
  no new round:
  1. This report named the pre-rebase state (`bf70d4dd` on `a0c61f5`) and
     its numbers; it now names `72588676` with the rerun numbers.
  2. The mutation row above covers four modules; the diff also touches
     `rows.ts`, `save.ts` and `eligibility.ts`. The verifier ran them:
     `rows.ts` 50/50, `save.ts` 111/111, `eligibility.ts` one survivor
     (`isJunior`) that predates this PR and is equivalent.
  3. The spec's "C1–C6" and `firearm-ownership-evidence.md`'s "C1–C5" do not
     disagree: that report predates C6, which #333 added. The moved file
     holds six.
- Canary: not run.
- Fixed after the last verified state, therefore unverified: none (only
  this report changed).
