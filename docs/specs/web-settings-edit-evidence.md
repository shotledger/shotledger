# Evidence report — editing account and compliance settings on the web (Tier 3)

Spec: [`web-settings-edit-spec.md`](web-settings-edit-spec.md), including its
§7 Revisions R1–R12. R4–R7 answer an independent review of PR #672; R8
follows #669's review fixes; R9–R12 answer the full review of PR #672 after
the rebase onto `caffb4d`. The numbers below are from the fresh run after
R12.

- **Spec approval: not obtained.** The run that wrote the spec could not get
  the maintainer's approval first-hand, so the correlation-breaking review has
  not happened. Key choices C1–C8 and revisions R1–R12 are listed in the PR for
  approval after the fact. Confidence is correspondingly lower.
- **Source state:** commit `a4bcdc5d` (the last code change; the spec
  revisions and this report are docs committed on top). Branch
  `feat/web-edit-settings`, on `feat/web-series-entry-impl` (#669) at `caffb4d`.
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, fast-check 4.10.2; backend vitest 4.1.11 with
  `@cloudflare/vitest-plugin`); Node 24.12.0.
- **Entry point:** `pnpm check`; `cd backend && npx vitest run
--testTimeout=60000`; `npx stryker run --mutate <the four modules below>`.
- **Independent verification:** one round, by a fresh-context verifier
  relayed through the coordinator, on `39b8391`. Two confirmed findings
  (R4, R5) and three plausible ones (R6, R7, a manual sentence) were fixed.
  A full review then found R9–R12. None of the fixed states (R4–R12, last
  `a4bcdc5d`) has been re-verified: declared downgrade.

## Failure model (Tier 3)

| Way this can hurt                                                        | Layer that catches it                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| A row the phone cannot apply (wrong columns, `null` in `value`)          | A1 (column parity), A2 (applied through `applyChangesSync` on the real schema), B5 (null) |
| A value the phone would never write (class `"4"`, unknown profile, case) | B5 (each refused, nothing built), B7 (only the phone's lists are generated)               |
| A device-local key or another table written                              | B4, B7 (`settings` only, `isSyncableSettingRow`); the server's own 400 (layer 1, B3)      |
| A settings tombstone, which would lock the key forever                   | B7 (`deletedAt` and `deleted_at` null); hand mutant M3 below                              |
| Clobbering a phone's concurrent edit of another key                      | C2 (changed keys only), B6, W3, browser check 7                                           |
| A lost response, retried, writes twice or differently                    | W2 (replay → `duplicate`, no seq moves), U5, browser check 6 (identical request bodies)   |
| A default (locale profile, derived case) silently written as a choice    | B1, U1, U4 (nothing changed → Save blocked); browser check 1 (Save disabled on open)      |
| An unrecognised stored value shown as something else or overwritten      | R3, B6 (unchanged values are neither validated nor written)                               |
| Settings left in browser storage                                         | N1 grep gate (negative control below)                                                     |
| The phone's Settings screens change behaviour                            | O1–O3 pin the moved lists; `pnpm typecheck:app`; jest 698/698                             |

## Spec → test mapping

| Scenario                                                            | Test                                                                                  | Status |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| O1, O2                                                              | `shared/src/disciplines/eligibility.test.ts` › O1, O2                                 | pass   |
| O3                                                                  | `shared/src/compliance/profile-registry.test.ts` › O3                                 | pass   |
| R1–R4                                                               | `shared/src/sync-client/settings-edit.test.ts` › R1…R4                                | pass   |
| B1–B6 (B5 per R1)                                                   | `settings-edit.test.ts` › B1…B6                                                       | pass   |
| B7 property (fast-check, 300 runs; reaches `none` and unset, R4)    | `settings-edit.test.ts` › B7                                                          | pass   |
| B8 (R7), B9 (R4), B10 (R6)                                          | `settings-edit.test.ts` › B8, B9, B10                                                 | pass   |
| A1–A3                                                               | `app/src/db/queries/web-settings.test.ts`                                             | pass   |
| W1–W4                                                               | `backend/test/web-settings.spec.ts` (Workers pool, real D1 + better-auth)             | pass   |
| U1–U3, U4 (nothing changed)                                         | `web/src/settings/model.test.ts`                                                      | pass   |
| U4, U5, U6 (per R2); empty build (R4); U7, U8 (R8); U9–U12 (R9–R12) | `web/src/settings/save.test.ts`                                                       | pass   |
| N1 no browser storage                                               | `save.test.ts` › N1 grep gate                                                         | pass   |
| N2 settings only, allowlisted                                       | B4, B7                                                                                | pass   |
| N3 no tombstone, no null                                            | B5, B7                                                                                | pass   |
| N4 no outbox, no auto retry                                         | U5 (push only on Save/Retry); `save.ts` has no timer                                  | pass   |
| N5 no endpoint/protocol/dep change                                  | W1 (real `/sync/push`); diff touches no `backend/src`, no `package.json`, no lockfile | pass   |
| N6 phone unchanged                                                  | O1–O3; `pnpm typecheck:app`; jest 698/698                                             | pass   |
| N7 no shooting-data table                                           | B4, B7 (`tableName` always `settings`)                                                | pass   |
| Browser checks                                                      | headless Chromium over CDP against `wrangler dev`; see below                          | pass   |

## Gauntlet (final fresh run, after the last code edit)

| Layer                                           | Command                                                                                                                                                                                                                               | Result                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check` (vitest TZ pinned to America/Sao_Paulo by #669)                                                                                                                                                                          | exit 0; vitest 3022 tests passed; jest 61 suites, 698 tests passed; i18n 1239 keys, 0 issues                |
| Coverage (gated)                                | `pnpm check` (100% threshold; `web/src/entry/*.ts`, `web/src/reauth.ts` and `web/src/settings/*.ts` in scope)                                                                                                                         | 100% statements 3576/3576, branches 2266/2266, functions 841/841, lines 3048/3048                           |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                                                                                                                                                    | 15 files, 157 tests passed (W1–W4 included)                                                                 |
| Mutation                                        | `npx stryker run --mutate web/src/settings/save.ts,web/src/settings/model.ts` (after R12); earlier: settings modules + `settings-edit.ts` 98.56%, `settings-edit.ts,rows.ts` 98.47%, with `eligibility.ts,profile-registry.ts` 97.58% | 163 killed, 0 survived: 100%; the two `settings-edit.ts` survivors from earlier runs are equivalent (below) |
| Property-based                                  | B7 (fast-check, 300 runs)                                                                                                                                                                                                             | pass                                                                                                        |
| Property suite alone                            | 4 hand mutants, `-t B7`                                                                                                                                                                                                               | 4/4 killed (below)                                                                                          |
| Suite health                                    | `npx vitest run --sequence.shuffle shared/src/sync-client web/src app/src/db/queries/web-settings.test.ts` × 3                                                                                                                        | 230 tests passed each time                                                                                  |
| reqstool                                        | `pnpm reqstool:tags && pnpm reqstool:status`                                                                                                                                                                                          | 21 passed, 0 failed, 0 SVCs missing tests                                                                   |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check`                                                                                                                                                                | built; 24 translated pages current; no dangling anchors                                                     |
| Supply chain                                    | `pnpm licenses:check` (in `pnpm check`); diff review                                                                                                                                                                                  | no dependency added or removed; no new network, storage or env use                                          |

**Survivors.** After R4–R7 two remain in the new code, both equivalent
(R4's rewrite removed the third, `?? 'none'`). From the earlier run:

- `settings-edit.ts:50` `row === undefined` → `false`: `isSyncableSettingRow`
  already returns false for an `undefined` payload, so the branch is taken
  either way. Kept for the reader: `null` would mean a tombstone there.
- `settings-edit.ts:55` `catch { return undefined; }` → `catch {}`: the
  function falls through to the same `undefined`.
- `settings-edit.ts:90` `?? 'none'` → `?? ''`: the registry has no profile
  `''` either, so both find no cases. R1's test kills the mutants that matter
  (`?? 'se'`).

Three are in lines this change did not touch and were not introduced by it:
`profile-registry.ts:52` and `:91` (`getProfile`'s variant fallback and
`resolveDefaultVariantId`'s default argument) and `eligibility.ts:169`
(`isJunior`). They are recorded, not fixed here (scope).

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
the gate red; restored, green. A2 passed on first run against the existing
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

## Layers not run as specified

- **SUBSTITUTED:** mutation ran on the four changed shared modules, not the
  whole `stryker.config.json` list. Cannot detect a weakened test elsewhere,
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
