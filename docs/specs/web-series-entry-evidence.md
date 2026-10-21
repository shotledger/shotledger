# Evidence report — web series entry and the web write client (Tier 3)

Spec: [`web-series-entry-spec.md`](web-series-entry-spec.md), including its
§7 Revisions R1–R28.

- **Spec approval:** first-hand, by the maintainer on 2026-10-08: C1–C3 and
  C7–C9 as written; C4 and C5 as deferrals, with follow-up issues #688 (fält
  entry), #689 (rounds-only and final series), #690 (tags on a new web
  session), #691 (photo upload from the web) and #692 (edit and delete a
  session on the web); C6 changed (prefill from the synced profile); R1–R25
  approved, R15 changed to `Europe/Stockholm`. R26 (the C6 change as built)
  and R27 (the rebase), written after that, were approved on 2026-10-08 too,
  as the spec header records. R28 (the start-time guard) was ordered by the
  maintainer on 2026-10-09 when grading verification round 2; the exact
  accepted form is the builder's decision under that instruction (spec R28).
- **Source state:** code at `395f80f` on branch `feat/web-series-entry-impl`,
  whose base is `origin/main` at `7cde3bf` (#694 merged, so vitest runs in
  `Europe/Stockholm`); the commits after it change only this report.
  Verification round 2 saw `9570009`; the code since then is `87ac95c` (one
  test) and `395f80f` (R28).
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, fast-check 4.10.2, TypeScript 6.0.2 / native 7.0.2;
  backend vitest 4.1.11 with `@cloudflare/vitest-plugin` 1.3.6).
- **Entry point:** `pnpm check` (types, i18n, licenses, lint, format, vitest
  with the 100% coverage gate, jest); `cd backend && npx vitest run`;
  `pnpm mutation` (or the `--mutate` subset below).
- **Independent verification:** round 3 verified `0bbaf53` (the code of
  `395f80f` plus this report) and returned `passed`. Its two description
  findings were fixed afterwards in a test case and a source comment, with no
  change to behaviour. See _Independent verification_ below.

## Failure model (Tier 3)

| Way this can hurt                                                 | Layer that catches it                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A `NOT NULL` column pushed as `null` wedges every phone's sync    | A1 (column parity), A2 (apply on the real schema; mutant `kind: null` → `NOT NULL constraint failed`) |
| A typed token stored as a different value than the keypad stores  | T1–T7; parse goes through `pressKey`; T7 against an independent oracle                                |
| Half an entry lands (session without shots, shots without series) | One push = one D1 batch (C2); W1; D5 refuses a mismatched ack set                                     |
| A lost response, retried, saves the session twice                 | W2 (replay → all `duplicate`, no new rows); U2; U7 (R13); browser check 3                             |
| The firearm counter drifts from what the phone would have written | E11, R4/R5, A2 (100 → 110), W1 (+12 incl. sighters), browser check 6                                  |
| A foreign key the phone does not have (firearm, ammo lot)         | E14 (both refused before sending)                                                                     |
| A request the server refuses for size                             | E13 (500 changes fit, 501 refused; every payload ≤ `MAX_PAYLOAD_BYTES`)                               |
| A session stored with an empty or malformed `started_at`          | E15 (R28): the builder refuses it, whatever the page does                                             |
| Shooting data left in the browser                                 | N1 grep gate (negative control below)                                                                 |
| An automatic retry loop                                           | U2 "nothing retries on its own"; no timer in `save.ts`                                                |
| The phone's new-session form changes behaviour                    | H1–H5 pin the moved helpers; app typecheck; jest suite                                                |
| The web prefills a klass or event the phone would not             | H4, H5 (the phone's own functions), F1–F3; browser check 8                                            |
| A malformed synced setting breaks the form or prefills garbage    | P3, P4, F3 (reads as unset); browser check 8 (garbled account)                                        |

## Spec → test mapping

| Scenario                                   | Test                                                                                                                 | Status |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------ |
| T1–T5                                      | `shared/src/scoring/series-text.test.ts` › T1…T5                                                                     | pass   |
| T6 format∘parse identity (fast-check, 500) | `series-text.test.ts` › T6                                                                                           | pass   |
| T7 parse ⇔ keypad (fast-check, 1000, R7)   | `series-text.test.ts` › T7                                                                                           | pass   |
| R1–R5                                      | `shared/src/sync-client/rows.test.ts`                                                                                | pass   |
| A1–A3                                      | `app/src/db/queries/web-rows.test.ts`                                                                                | pass   |
| E1–E15 (E15 per R28)                       | `shared/src/sync-client/session-entry.test.ts` (E2–E4, E9–E13, E15 have several cases each)                          | pass   |
| H1–H5 (H3 per R3, H4–H5 per R26)           | `shared/src/disciplines/session-defaults.test.ts`                                                                    | pass   |
| O1, O3 (R26)                               | `eligibility.test.ts`, `compliance/profile-registry.test.ts`                                                         | pass   |
| P1–P4 (R26)                                | `shared/src/sync-client/account-settings.test.ts`                                                                    | pass   |
| F1–F3 prefill (C6 as changed)              | `web/src/entry/model.test.ts` › prefill from the synced profile                                                      | pass   |
| D1–D6 (D2 per R5)                          | `shared/src/sync-client/direct-push.test.ts`                                                                         | pass   |
| W1–W4                                      | `backend/test/web-write.spec.ts` (Workers pool, real D1 + better-auth)                                               | pass   |
| U1–U4, U7 (R13), U8 (R14)                  | `web/src/entry/save.test.ts`                                                                                         | pass   |
| U9 (R19), U10 (R18)                        | `web/src/entry/save.test.ts`                                                                                         | pass   |
| U12 (R21)                                  | `web/src/entry/save.test.ts` (the held request) and `web/src/entry/model.test.ts` (`sendsTheSame`)                   | pass   |
| R20                                        | `shared/src/sync-client/http/current-user.test.ts`                                                                   | pass   |
| R22                                        | `web/src/reauth.test.ts`                                                                                             | pass   |
| U5, U6; local time, CET and CEST (R15)     | `web/src/entry/model.test.ts`, `web/src/entry/started-at.test.ts`                                                    | pass   |
| N1 no browser storage                      | `save.test.ts` › N1 grep gate                                                                                        | pass   |
| N2 no outbox, no auto retry                | U2 (push count stays 1), D6                                                                                          | pass   |
| N3 no new endpoint / protocol              | E13 (`PushRequestSchema`), W1 (real `/sync/push`)                                                                    | pass   |
| N4 no `NOT NULL` as `null`                 | A1, A2                                                                                                               | pass   |
| N5 only session, series, shots, firearm    | E1, E11, W1 (exact table list)                                                                                       | pass   |
| N6 `settings` read only, no `session_tags` | E1 (exact tables built); grep: `settings` appears in `web/src/entry/` only as `readAccountSettings(tables.settings)` | pass   |
| N7 phone unchanged                         | H1–H5; `pnpm typecheck:app`; jest 714/714                                                                            | pass   |
| Browser checks                             | headless Chromium over CDP against `wrangler dev`; see below                                                         | pass   |

## Gauntlet (final fresh run, after the last code edit)

Run on 2026-10-09 at `395f80f`, after the last code edit (R28).

| Layer                                           | Command                                                                                                                                 | Result                                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                                                                                            | exit 0; vitest 180 files, 3073 tests passed; jest 714 passed                                                                                                           |
| Coverage (gated)                                | `pnpm check` (`vitest run --coverage`, 100% threshold)                                                                                  | 100% statements 3542/3542, branches 2208/2208, functions 825/825, lines 3014/3014 (incl. `web/src/entry/*.ts`, `web/src/reauth.ts`, `account-settings.ts`)             |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                                                      | 18 files, 192 tests passed (W1–W4 included)                                                                                                                            |
| Mutation (R28 round)                            | `npx stryker run --mutate shared/src/sync-client/session-entry.ts`                                                                      | 219 killed, 0 timeout, 0 survived, 0 no-coverage: 100%. The only module whose code changed; `entry.tsx` (one `case`) is outside the gates, as every `.tsx`             |
| Mutation (prefill round, 2026-10-08)            | `npx stryker run --mutate shared/src/sync-client/account-settings.ts,shared/src/disciplines/session-defaults.ts,web/src/entry/model.ts` | 274 killed + 1 timeout, 7 survived, 0 no-coverage: 97.52% (all 7 equivalent, below)                                                                                    |
| Mutation (before the rebase)                    | `npx stryker run --mutate <the five shared modules + web/src/entry/{model,save}.ts + web/src/reauth.ts>`                                | 686 killed + 1 timeout, 5 survived, 0 no-coverage: 99.28% (all 5 equivalent, below); those modules other than `model.ts` and `session-defaults.ts` are unchanged since |
| Mutation, not run                               | `shared/src/disciplines/eligibility.ts`, `shared/src/compliance/profile-registry.ts`                                                    | each gained only a module-level lookup table (`SKILL_CLASSES`, `PROFILE_SELECTIONS`), which `ignoreStatic` skips; O1 and O3 pin every value                            |
| Property-based                                  | T6 (500 runs × 2 modes), T7 (1000 runs × 2 modes)                                                                                       | pass                                                                                                                                                                   |
| Property suite alone                            | 3 hand mutants of the token grammar, `-t property`                                                                                      | 3/3 killed (after R7's near-miss tokens were added; before that, accepting `11` survived)                                                                              |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=301 shared/src/sync-client/session-entry.test.ts web/src/entry`                      | 4 files, 67 tests passed (this round); the earlier round's shuffled run of the PR's suites: 33 files, 340 tests passed                                                 |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check`                                                                  | built, 25 translated pages current, no dangling anchors                                                                                                                |
| reqstool                                        | `pnpm reqstool:tags && pnpm reqstool:status` (after `pnpm check`, since Stryker overwrites the JUnit file)                              | exit 0; 21 tests passed, 0 failed, 0 SVCs missing tests                                                                                                                |
| Supply chain                                    | `pnpm licenses:check`                                                                                                                   | 97 packages, invariants hold; `uuidv7@1.2.1` was already in the lockfile (C7), no new package                                                                          |

**R28's tests, watched failing.** Before the guard, the eight E15 refusal
cases and the "collected with the other errors" case failed (9 failed, 23
passed); the valid-timestamp case passed, since it pins what the builder
already did, and Stryker's `length === 24` → `!== 24` mutant is the one it
kills. The 501-change E13 case pins existing behaviour, so it was proved with
a throwaway mutant instead: with `changes.length > PUSH_BATCH_MAX + 1` it was
the only test of the file to fail (1 failed, 21 passed); restored, 22 passed.

**The accepted start time (R28).** `YYYY-MM-DDTHH:mm:ss.sssZ`, 24 characters,
that survives `new Date(s).toISOString() === s`. That is what the web's
`startedAtIso` writes (`Date.prototype.toISOString`) and what the phone's
new-session form writes (`new Date().toISOString()`). An offset other than
`Z`, whole seconds without milliseconds, a date alone, a rolled-over date
(`2026-02-30`) and a six-digit extended year are refused, not normalized.

**The five surviving mutants are equivalent.** Four in `web/src/entry/model.ts`:
`newRow`'s `lastKey += 1` → `-= 1` (keys stay unique, which is all a key
needs); `programOf`'s `programId === null ?` → `false ?` (`getProgram(null)`
is undefined, so null either way); the date regex losing `^` or `$` (every
string only the looser regex admits is one `new Date` rejects, probed:
`12026-10-07`, `x2026-10-07`, `2026-10-071`). The fifth, in the shared module:
`firstDisciplineFor`'s `(…)?.id` → `(…).id`. `disciplinesForRegulations`
never returns an empty list, because the generic disciplines survive every
filter (REGULATIONS.md § Regelverk), so `available[0]` is always defined. The line moved
verbatim from the phone.

The fresh run of this round has those same five (`firstDisciplineFor`'s
`?.`, and `model.ts`'s four, at their new line numbers) and two more, in
`account-settings.ts`, the reader moved down from #672, where its evidence
classed them the same way: `row === undefined` → `false`
(`isSyncableSettingRow` already answers false for an `undefined` payload, so
the branch is taken either way; the check stays for the type narrowing), and
`catch { return undefined; }` → `catch {}` (the function then falls off its
end, which returns `undefined` too). The new shared helpers (`eventsUnder`,
`preferredEventId`, `shooterClassesInOrder`) and the prefill in `model.ts`
leave no survivor. `SKILL_CLASSES` and `PROFILE_SELECTIONS` are lookup tables
under `ignoreStatic`; O1 and O3 pin every value.

## Real execution (browser checks)

`wrangler dev` on port 8797 with a synthetic account (seeded through
`/sync/push`), the built web app served by the Worker, a headless Chromium
driven over CDP. Screenshots are in the session scratchpad, not the repo.

1. Competition, Precision, six series typed by keyboard only (Enter between
   rows): row totals 48·1X, 47·1X, 42, 48·1X, 46, 46.
2. A typed `11` → "Series 3: “11” (shot 6) is not a shot.", nothing sent.
3. The push reached the server and its response was dropped → "Could not
   reach the server…" with **Retry**; Retry → "Saved.", and the account held
   exactly one new session (6 → 7).
4. Statistics then counted the new session.
5. Offline (DevTools network emulation) → Save disabled, "You are offline…".
6. Session signed out elsewhere → "You have been signed out…" and the inline
   sign-in; signing in again and saving a training session with a firearm
   chosen by keyboard → saved, `weapon_group` derived from the gun
   (`spsf:C`), firearm `round_count` 0 → 5.
7. Swedish UI renders (`Serie 1`, `Provserie`).

Re-run after the rebase and the profile prefill (2026-10-08), same set-up
(`wrangler dev` on port 8797, the built web app, headless Chrome over CDP;
three synthetic accounts seeded through `/sync/push`). Screenshots are in
`~/tmp/sl-301-entry-shots/`, outside the repo.

8. Prefill. An account whose synced profile is born 1964, klass 2, women's
   classes: training shows no Class field; Competition preselects **2** and
   lists `2, Dam2, VetY, 1, 3, Jun, Dam1, Dam3, VetÄ`; Weapon Group A
   reorders it to `2, 1, 3, …`; ISSF → Air Pistol preselects the women's open
   event and lists it first. An account with no profile, and one whose
   synced values are malformed (`"1964"` as a string, klass `"4"`), both
   preselect no klass, list the klasser in the federation's order and
   preselect the men's open event.
9. A competition typed and saved there answers "Saved."; the menu reads
   Sessions, Statistics, Enter Series, Account, and Sessions lists the new
   session (48p).

## Layers not run as specified

- **SUBSTITUTED:** mutation ran on the eight new modules (`--mutate`), not the
  whole `stryker.config.json` list; the other modules are unchanged. Each
  later round re-ran it on the gauntlet modules it touched: the prefill round
  on three, after the first rebase (the second rebase, onto `7cde3bf`, a
  typescript-eslint bump and #694, changed no code under test); the R28
  round on `session-entry.ts`. Cannot detect: a weakened test elsewhere,
  which this change does not touch.
- **SUBSTITUTED:** suite health is one shuffled run (seed 301) of the new
  suites, not every suite. Cannot detect order dependence elsewhere.
- **N-A:** the browser checks in §4 are manual by design; they ran headless
  rather than in a desktop browser.
- **NOT RE-RUN:** the browser checks, for R28. The page already kept an
  incomplete date out (Save disabled, `runSave` returns early), so the new
  `invalidStartedAt` message cannot be reached through the page; what a user
  sees does not change, and the manual needs no change.

## Structural blind spot

The phone's apply path is exercised on better-sqlite3, not expo-sqlite (A2,
R12). A difference in how expo-sqlite binds a value would not show here.

## Known limits

- A firearm row tombstoned on another device before the web's push is
  rejected (W3) while the session still names it. A device that never had
  that firearm row applies the tombstone as a no-op, and the session then
  names a firearm that device does not have. The phone does not enforce
  foreign keys: SQLite leaves them off unless a connection turns them on, and
  only test code does (`app/src/db/test-db.ts`, `migrations.test.ts`);
  `app/src/db/client.ts` does not, and expo-sqlite 57.0.3's build flags do
  not change the default (`defer_foreign_keys` in the apply transaction is
  then a no-op). So the session applies with a dangling firearm reference
  rather than failing; how each screen shows that has not been checked on a
  device. Two phones share this; it is not new with the web.
- The firearm counter can be overwritten by a phone that edited the same
  firearm offline (C1, ARCHITECTURE.md § Web app, races).
- Edit and delete of a saved session stay on the phone (C5, #692).
- The preselected klass is kept when the discipline changes, so a
  competition under an ISSF discipline (no klass picker) stores the klass
  beside its event. The phone does the same today; mirrored here (R26), not
  changed.
- Eligibility is judged in the year the form opened, not the year of the
  session's date, as on the phone (whose sessions are always "now"). A past
  session typed on the web can therefore be ranked for this year's age.

## Independent review (round 1) and what changed

A fresh-context verifier reviewed PR #669 at `d6e1168`. Findings, as graded
by the coordinating session, and their fixes:

- **MEDIUM, behavioural:** after a lost response, Save and Enter built a new
  request with fresh ids, so the session (and the firearm increment) could be
  stored twice. Fixed (R13): while a request is held every submit resends it;
  U7 kills the mutant that makes `submitRequest` return null. Verified in the
  browser: lost response, then Ctrl+Enter → exactly one new session (14 → 15).
- **LOW:** the local-time test passed under UTC for a mutant reading the input
  as UTC. Fixed (R15): vitest pinned to a UTC−3 zone; the `…Z` mutant now
  fails under `TZ=UTC` too.
- **LOW:** surviving mutants in `model.ts` (weapon group reset, decimal reset,
  the `decimalShown` guard). Killed by new tests; `web/src/entry/*.ts` joined
  the mutation and coverage gates (R16).
- **PLAUSIBLE:** Retry after signing in to another account would push one
  account's session into another. Fixed (R14), U8.
- **Minor docs:** Enter in a fixed format, "never saved twice", and row errors
  naming a sighter row "Series N". Fixed (R17).

## Full PR review (after verifier round 1) and what changed

The maintainer asked for every finding of the full review of #669 to be fixed
(state `8860a12`). Each is a revision in the spec:

- **R22 (Medium):** after the inline sign-in the page kept the old account's
  logbook under the new token. Now App reloads through its loading path and
  remounts every page when another user signs in; the same user only clears
  the notice. Pure decision in `web/src/reauth.ts` (tests R22, gated). Browser:
  signed out, signed in inline as a second synthetic account → the shell shows
  that account, the firearm list is its (empty) one, the typed row is cleared.
- **R18 (Medium):** a throwing build left the page "saving". Caught in
  `save()` (U10) and once more in the page.
- **R19:** an ack mismatch is `unconfirmed` and held (U9, D5).
- **R21:** Enter / Add Series keep a held request (U12, `sendsTheSame`).
  Browser: lost response, Enter in the last row → a new row, button still
  Retry, Retry saved once.
- **R23:** the form is disabled while saving. Browser: fieldset disabled while
  a push was held back, enabled after. Disabling took the focus, so the page
  now gives it back; found in the browser, not by a test.
- **R20:** a 5xx/408/429 from get-session is a network failure (tests in
  `http/current-user.test.ts`; the first draft of that test passed vacuously,
  because `classifySyncError(null)` is `network` — it now asserts a throw).
- **R24:** documented in ARCHITECTURE.md § Web app. The finding's premise that a slow browser
  clock makes a phone discard the update is not how the protocol works: the
  winner is decided by server order (R3), so the clock only shows as an edit
  time. The overwrite race is the real cost, and is what the ADR records.
- **R25:** `submitRequest` kept as the tested seam; findings 9 and 10 not done,
  with reasons.

## Honest notes

- The rebase onto main (Sessions page, target photos, the Cloudflare
  preparation) took judgement in three places the gates then caught: a
  closing brace lost between main's styles and the entry styles (Prettier's
  CSS parse), a comma between the `web.photos` and `web.entry` i18n blocks
  (JSON parse), and `web-write.spec.ts` still calling `https://example.com`,
  which main's auth configuration now refuses (W1–W4 failed with a sign-up
  500 until it used `https://localhost`, as main's other specs do). Each was
  folded into the commit it belongs to.
- The Sessions page keys its photo picks to the tables object, so the
  refresh after a save would have dropped them; the refresh now carries the
  picks over (R27). No test pins it; it was found by reading the merge.

- While fixing R13 a `git checkout` used to restore a throwaway mutant reverted
  the uncommitted rewrite of `save.ts`; it was rewritten and committed before
  any further mutant runs, and the mutants were then re-run on the committed
  file.

- First browser run found a real bug: the inline sign-in form was nested in
  the entry form, so Enter in it submitted the wrong form. Fixed (R10).
- Lint found an effect that set state (focus handling); rewritten without it.
- Mutation found redundant branches in the builder and push reader; they
  were simplified rather than tested around, and four assertions were added
  (error messages, the `PUSH_BATCH_MAX` boundary from below, a blank name, a
  one-shot series length). That E13 case pinned 500 changes fitting, not 501
  being refused, so a `> PUSH_BATCH_MAX + 1` mutant survived; this report
  claimed the exact boundary until verification round 2 found it. The 501
  case is now pinned.

## Independent verification

- Verifier: Claude Code, Fable 5.1; fresh context each round; given the
  repo @ `9570009` (round 2) or `0bbaf53` (round 3) + the task contract + the
  SPEC + the entry point. Not given the
  builder's conversation. Correlation broken: task context. Not broken:
  model.
- Rounds: 3 approved (the default cap is two; the maintainer approved a
  third on 2026-10-09). Round 1 (`d6e1168`): findings above, under
  _Independent review (round 1)_. Round 2 (`9570009`) verdict: `passed`.
  Round 3 (`0bbaf53`) verdict: `passed`.
- Attacked in round 2: the run (the entry point reproduced from
  `9570009`); spec vs contract; test-gaming (15 mutants of its own, and the
  10 Stryker survivors proved equivalent); checker coverage (N1, A1, A2 and
  R15 fed known-bad input, each failed); the mapping in both directions.
- Findings, graded by the maintainer:
  - **Description / mapping**, fixed and disclosed, no new round:
    1. E13 pinned 500 changes, not 501, so a `> PUSH_BATCH_MAX + 1` mutant
       survived; this report said the exact boundary was pinned. A 501-change
       case now pins it (`87ac95c`), and _Honest notes_ says what was
       claimed.
    2. _Known limits_ said a device lacking the firearm row fails the
       session's foreign key. The phone does not enforce foreign keys;
       reworded to what happens, unverified on a device.
    3. Text: the mutation line omitted `eligibility.ts` and
       `profile-registry.ts` (now a row with the reason); the approval line
       said R26/R27 awaited the maintainer while the spec header recorded
       approval (both now say approved 2026-10-08); the mapping lacked U9,
       U10 and U12 (added, with R20 and R22); the source state was named by
       a commit message (now by SHA).
  - **Change to make now** (the maintainer's grade): 2. the builder took
    `startedAt: ''`, which only the page kept out. Guard added in the
    builder (R28, E15, `395f80f`). A code change, so it needs round 3.
- Attacked in round 3: the run (reproduced from `0bbaf53`, every number
  identical); spec vs contract (R28's accepted form against every writer of
  `started_at`, 24 adversarial spellings and a 200 000-instant random sweep:
  the accepted set is exactly `toISOString`'s output for a four-digit year);
  test-gaming (9 mutants of its own: 6 killed, 2 proved equivalent, 1 not
  equivalent, below); checker coverage (N1 and the i18n gate fed known-bad
  input, both failed); the mapping in both directions.
- Round 3 findings, graded by the maintainer as **description / mapping**,
  fixed and disclosed, no new round:
  1. E15's refused spellings all differ before the seconds or in length, so a
     guard comparing only up to the seconds survived the suite while
     accepting `2026-10-09T08:15:00+0000`. The shipped guard refuses it; the
     case is now in E15, and that mutant, planted by hand, fails it alone.
  2. The comment above `isUtcIsoTimestamp` said "the phone" writes this
     shape; the phone's database also holds `…:ssZ` values from the ShotLog
     import. Reworded to the phone's session form, as R28 already said.
- Canary: not run.
- Fixed after the last verified state, therefore unverified: the E15 case
  and the comment above (a test and a comment; the guard's code is the one
  round 3 verified).
