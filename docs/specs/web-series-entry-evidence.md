# Evidence report — web series entry and the web write client (Tier 3)

Spec: [`web-series-entry-spec.md`](web-series-entry-spec.md), including its
§7 Revisions R1–R25.

- **Spec approval:** relayed, not first-hand. An orchestrator session relayed
  "approved your spec as is, C1–C9 unchanged" on 2026-10-06. Revisions R1–R25
  were added by the session that took the work over and have **not** been
  approved; the PR lists them for the maintainer.
- **Source state:** commit `5368276` (the code after both review rounds; this
  report is committed on top of it). Branch `feat/web-series-entry-impl`, from `origin/main` at
  `5edc3cf`.
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, fast-check 4.10.2, TypeScript 6.0.2 / native 7.0.2;
  backend vitest 4.1.11 with `@cloudflare/vitest-plugin` 1.3.6).
- **Entry point:** `pnpm check` (types, i18n, licenses, lint, format, vitest
  with the 100% coverage gate, jest); `cd backend && npx vitest run`;
  `pnpm mutation` (or the `--mutate` subset below).
- **Independent verification:** one round, on the state before the review
  fixes (`d6e1168`): findings below. The fixed state (`73aecb6`) has **not**
  been re-verified, so it is a declared downgrade for that state.

## Failure model (Tier 3)

| Way this can hurt                                                 | Layer that catches it                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A `NOT NULL` column pushed as `null` wedges every phone's sync    | A1 (column parity), A2 (apply on the real schema; mutant `kind: null` → `NOT NULL constraint failed`) |
| A typed token stored as a different value than the keypad stores  | T1–T7; parse goes through `pressKey`; T7 against an independent oracle                                |
| Half an entry lands (session without shots, shots without series) | One push = one D1 batch (C2); W1; D5 refuses a mismatched ack set                                     |
| A lost response, retried, saves the session twice                 | W2 (replay → all `duplicate`, no new rows); U2; U7 (R13); browser check 3                             |
| The firearm counter drifts from what the phone would have written | E11, R4/R5, A2 (100 → 110), W1 (+12 incl. sighters), browser check 6                                  |
| A foreign key the phone does not have (firearm, ammo lot)         | E14 (both refused before sending)                                                                     |
| A request the server refuses for size                             | E13 (≤ `PUSH_BATCH_MAX`, every payload ≤ `MAX_PAYLOAD_BYTES`)                                         |
| Shooting data left in the browser                                 | N1 grep gate (negative control below)                                                                 |
| An automatic retry loop                                           | U2 "nothing retries on its own"; no timer in `save.ts`                                                |
| The phone's new-session form changes behaviour                    | H1–H3 pin the moved helpers; app typecheck; jest suite                                                |

## Spec → test mapping

| Scenario                                   | Test                                                                                   | Status |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ------ |
| T1–T5                                      | `shared/src/scoring/series-text.test.ts` › T1…T5                                       | pass   |
| T6 format∘parse identity (fast-check, 500) | `series-text.test.ts` › T6                                                             | pass   |
| T7 parse ⇔ keypad (fast-check, 1000, R7)   | `series-text.test.ts` › T7                                                             | pass   |
| R1–R5                                      | `shared/src/sync-client/rows.test.ts`                                                  | pass   |
| A1–A3                                      | `app/src/db/queries/web-rows.test.ts`                                                  | pass   |
| E1–E14                                     | `shared/src/sync-client/session-entry.test.ts` (E2–E4, E9–E13 have several cases each) | pass   |
| H1–H3 (H3 per R3)                          | `shared/src/disciplines/session-defaults.test.ts`                                      | pass   |
| D1–D6 (D2 per R5)                          | `shared/src/sync-client/direct-push.test.ts`                                           | pass   |
| W1–W4                                      | `backend/test/web-write.spec.ts` (Workers pool, real D1 + better-auth)                 | pass   |
| U1–U4, U7 (R13), U8 (R14)                  | `web/src/entry/save.test.ts`                                                           | pass   |
| U5, U6; local time in a non-UTC zone (R15) | `web/src/entry/model.test.ts`, `web/src/entry/started-at.test.ts`                      | pass   |
| N1 no browser storage                      | `save.test.ts` › N1 grep gate                                                          | pass   |
| N2 no outbox, no auto retry                | U2 (push count stays 1), D6                                                            | pass   |
| N3 no new endpoint / protocol              | E13 (`PushRequestSchema`), W1 (real `/sync/push`)                                      | pass   |
| N4 no `NOT NULL` as `null`                 | A1, A2                                                                                 | pass   |
| N5 only session, series, shots, firearm    | E1, E11, W1 (exact table list)                                                         | pass   |
| N6 no `session_tags` / `settings`          | review: `web/src/entry/` and the builders read neither (grep)                          | pass   |
| N7 phone unchanged                         | H1–H3; `pnpm typecheck:app`; jest 698/698                                              | pass   |
| Browser checks                             | headless Chromium over CDP against `wrangler dev`; see below                           | pass   |

## Gauntlet (final fresh run, after the last code edit)

| Layer                                           | Command                                                                                                  | Result                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                                                             | exit 0; vitest 170 files, 2985 tests passed; jest 698 passed                                                                        |
| Coverage (gated)                                | `pnpm check` (`vitest run --coverage`, 100% threshold)                                                   | 100% statements 3473/3473, branches 2182/2182, functions 808/808, lines 2958/2958 (incl. `web/src/entry/*.ts`, `web/src/reauth.ts`) |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                       | 14 files, 153 tests passed (W1–W4 included)                                                                                         |
| Mutation                                        | `npx stryker run --mutate <the five shared modules + web/src/entry/{model,save}.ts + web/src/reauth.ts>` | 686 killed + 1 timeout, 5 survived, 0 no-coverage: 99.28% (all 5 equivalent, below)                                                 |
| Property-based                                  | T6 (500 runs × 2 modes), T7 (1000 runs × 2 modes)                                                        | pass                                                                                                                                |
| Property suite alone                            | 3 hand mutants of the token grammar, `-t property`                                                       | 3/3 killed (after R7's near-miss tokens were added; before that, accepting `11` survived)                                           |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=301 <new suites>`                                     | 24 files, 231 tests passed                                                                                                          |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check`                                   | built, 24 translated pages current, no dangling anchors                                                                             |
| Supply chain                                    | `pnpm licenses:check`                                                                                    | 97 packages, invariants hold; `uuidv7@1.2.1` was already in the lockfile (C7), no new package                                       |

**The five surviving mutants are equivalent.** Four in `web/src/entry/model.ts`:
`newRow`'s `lastKey += 1` → `-= 1` (keys stay unique, which is all a key
needs); `programOf`'s `programId === null ?` → `false ?` (`getProgram(null)`
is undefined, so null either way); the date regex losing `^` or `$` (every
string only the looser regex admits is one `new Date` rejects, probed:
`12026-10-07`, `x2026-10-07`, `2026-10-071`). The fifth, in the shared module:
`firstDisciplineFor`'s `(…)?.id` → `(…).id`. `disciplinesForRegulations`
never returns an empty list, because the generic disciplines survive every
filter (ADR 0011), so `available[0]` is always defined. The line moved
verbatim from the phone.

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

## Layers not run as specified

- **SUBSTITUTED:** mutation ran on the eight new modules (`--mutate`), not the
  whole `stryker.config.json` list; the other modules are unchanged.
  Cannot detect: a weakened test elsewhere, which this change does not touch.
- **SUBSTITUTED:** suite health is one shuffled run (seed 301) of the new
  suites, not every suite. Cannot detect order dependence elsewhere.
- **N-A:** the browser checks in §4 are manual by design; they ran headless
  rather than in a desktop browser.

## Structural blind spot

The phone's apply path is exercised on better-sqlite3, not expo-sqlite (A2,
R12). A difference in how expo-sqlite binds a value would not show here.

## Known limits

- A firearm row tombstoned on another device before the web's push is
  rejected (W3) while the session still names it. A device that never had
  that firearm row applies the tombstone as a no-op and then the session's
  foreign key fails. Two phones share this; it is not new with the web.
- The firearm counter can be overwritten by a phone that edited the same
  firearm offline (C1, ADR 0019 consequences).
- Edit and delete of a saved session stay on the phone (C5).

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

## Full PR review (round 2) and what changed

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
- **R24:** documented in ADR 0019. The finding's premise that a slow browser
  clock makes a phone discard the update is not how the protocol works: the
  winner is decided by server order (R3), so the clock only shows as an edit
  time. The overwrite race is the real cost, and is what the ADR records.
- **R25:** `submitRequest` kept as the tested seam; findings 9 and 10 not done,
  with reasons.

## Honest notes

- While fixing R13 a `git checkout` used to restore a throwaway mutant reverted
  the uncommitted rewrite of `save.ts`; it was rewritten and committed before
  any further mutant runs, and the mutants were then re-run on the committed
  file.

- First browser run found a real bug: the inline sign-in form was nested in
  the entry form, so Enter in it submitted the wrong form. Fixed (R10).
- Lint found an effect that set state (focus handling); rewritten without it.
- Mutation found redundant branches in the builder and push reader; they
  were simplified rather than tested around, and four assertions were added
  (error messages, the exact `PUSH_BATCH_MAX` boundary, a blank name, a
  one-shot series length).
