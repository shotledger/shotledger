# Evidence report — editing and deleting a session on the web (Tier 3)

Spec: [`web-session-edit-spec.md`](web-session-edit-spec.md), including its
§9 revisions R1–R12.

- **Spec approval: approved first-hand by the maintainer on 2026-10-12**
  (PR #710: "the maintainer approved the spec (key choices E1–E12) for
  merge"), taking the recommended option on that PR's four questions. The
  spec was approved before any code was written. R1–R9 were made during the
  build and the first two verification rounds; R1–R3 and R5–R8 refine or
  correct the spec's own wording. **R9 was decided by the maintainer on
  2026-10-13 as R10** (Delete gets Save's stale check), a spec change the
  maintainer approved first-hand; R10 extends the maintainer's wording to
  fält stations, by the same reason (put to the maintainer in the PR).
  **R11 and R12 were made by the builder after the rebase onto main and are
  not separately approved**: R11 holds an edited date to the entry's range
  (#747), R12 records how fält sessions entered on the web (#713) and photos
  attached on web entry (#714) are handled. **R4 narrows E2** (a training
  session's weapon group, class and event are not offered on the web, where
  the phone offers a stored one) and still needs the maintainer's ruling.
- **Independent verification:** see [the section below](#independent-verification).
- **Source state:** branch `feat/692-web-session-edit`, squashed to one
  commit and rebased onto `origin/main` `12f781c9` on 2026-10-13 (the first
  two rounds ran on the earlier base `41b1b7fe`); R10–R12 are the commits on
  top. The code and tests this report describes are at `0514736e` (this
  report is committed on top).
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker 10.0.0, fast-check 4.10.2, TypeScript 6.0.2 / native 7.0.2; backend
  vitest with the Workers pool). No dependency changed.
- **Entry point:** `pnpm check`; `cd backend && npx vitest run
--testTimeout=60000`; `npx stryker run --mutate
'shared/src/sync-client/session-edit.ts,shared/src/sync-client/volume-rows.ts,shared/src/sync-client/rows.ts,shared/src/sync-client/bulk-edit.ts,web/src/edit/*.ts,!web/src/edit/*.test.ts'`;
  `node scripts/manual-mutation-web-edit.mjs`; the three docs gates.

## What was built

| Spec part               | Where                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| §3.1 builders           | `shared/src/sync-client/session-edit.ts` (`openedSession`, `buildSessionEdit`, `buildSessionDelete`) |
| §3.1 shared volume (R3) | `shared/src/sync-client/volume-rows.ts`, `withRoundsMoved` in `rows.ts`; `bulk-edit.ts` imports both |
| §3.2 page               | `web/src/edit/` (`model.ts`, `save.ts`, `request.ts`, `messages.ts`, `edit.tsx`, `delete.tsx`)       |
| §3.2 route              | `#sessions/<id>/edit` in `web/src/shell/route.ts`; Edit and Delete Session on the session detail     |
| E9 strings              | `web.edit.*` in `app/src/i18n/{en,sv}.json` (21 keys each; existing keys reused where they fit)      |
| R10 Delete stale check  | `isDeleteStale` in `session-edit.ts`; `deleteDeps` takes the shown snapshot; Reload in `delete.tsx`  |
| R11 date range          | `sessionColumns` calls the entry's `startedAtError` for an edited date                               |
| Manual                  | `docs/manual/guides/editing-a-session-on-the-web{,.sv}.md`; the "use the phone" line now links it    |

## Failure model (Tier 3)

| Way it can hurt                                               | Layer that catches it                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Rewrite from a stale view doubles a series' shots             | K14 (session row, touched series rows and their live shot ids); browser check 4; known limit below                              |
| Counter moved twice by a Retry after a lost response          | W3 (replay → all `duplicate`, no new seq); U3; browser check 5 (response dropped after it landed)                               |
| Counter moved the wrong way or by the wrong amount            | K10, K18 (properties); K11, K12, K21; P2, P2+P3, P3, P5 against the phone's own functions; W1, W2                               |
| A dropped or `null` column wedges a phone's apply             | K1 (pulled payload spread, `future_column` survives), K17 (`ClientChangeSchema`); P1–P7 apply on the real schema                |
| A tombstone for a row outside the session (irreversible)      | K18 (the other session's rows are untouched, identity), K20 (exact table and row list), N5                                      |
| A push split mid-action leaves half an edit                   | K16, K23: one push, `tooManyChanges` over 500, exactly 500 allowed                                                              |
| An edit lands in another account after a sign-in switch       | U4; #669 R14/R22 (the page remounts on another account)                                                                         |
| Refused session row with its counter move applied             | W4 (the server refuses the session, the counters land); U7 names the firearm; message test                                      |
| Photo lost by an edit or delete                               | K5 (series row not rewritten by a re-entry), K7 (photo columns spread), K22, P7, W1                                             |
| A page stuck on "Saving…"                                     | U9; `edit.tsx`/`delete.tsx` end every run with a `.catch` that sets `failed`                                                    |
| A second sighter set on another device while the form is open | K7 (counted over the fresh pull, the draft's flag only for a series the save writes; R5, R8), in the draft shape the page sends |
| A live shot left under a deleted series                       | K8, K18 (no live shot outlives its series), P4/P5 (live shots counted under deleted series), K20                                |
| Delete from a stale view (series never shown, wrong count)    | K24 (session row, every series row and its live shot ids, one added, removed or swapped, every station); U10; browser 12–16     |
| An implausible edited date reaches every phone                | K25 (R11), browser check 13                                                                                                     |

## Spec → test mapping

| Scenario                                  | Test                                                                                                                                                                        | Status |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| K1–K9, K11–K17                            | `shared/src/sync-client/session-edit.test.ts` › edit builder (several cases per id; K6 and K9 also pin the refusals)                                                        | pass   |
| K10 property (fast-check, 300 runs)       | `session-edit.test.ts` › K10                                                                                                                                                | pass   |
| K18 property (fast-check, 400 runs)       | `session-edit.test.ts` › K18 (an oracle written apart from the builder)                                                                                                     | pass   |
| K20–K23                                   | `session-edit.test.ts` › delete builder                                                                                                                                     | pass   |
| K24 (R10)                                 | `session-edit.test.ts` › K24 delete refuses what changed since the page opened; `openedSession` › R10 stations                                                              | pass   |
| K25 (R11)                                 | `session-edit.test.ts` › edit builder › K25 (two cases)                                                                                                                     | pass   |
| K11 counter move                          | also `rows.test.ts` › withRoundsMoved                                                                                                                                       | pass   |
| P1–P7                                     | `app/src/db/queries/web-edit.test.ts` (two phone databases; P2+P3 is the firearm change and re-entry in one Save)                                                           | pass   |
| W1–W4                                     | `backend/test/web-edit.spec.ts` (Workers pool, real D1 + better-auth)                                                                                                       | pass   |
| U1                                        | `web/src/edit/model.test.ts`                                                                                                                                                | pass   |
| U2–U9                                     | `web/src/edit/save.test.ts`; U7 also `messages.test.ts`                                                                                                                     | pass   |
| U10 (R10)                                 | `save.test.ts` › U10 and `deleteClick and reload`; `messages.test.ts` (staleDelete); `request.test.ts` › U10 and `deleteDeps with nothing to show`                          | pass   |
| Delete preview (§3.2)                     | `web/src/edit/request.test.ts`                                                                                                                                              | pass   |
| Route                                     | `web/src/shell/route.test.ts`                                                                                                                                               | pass   |
| N1 no browser storage                     | `save.test.ts` › N1 grep gate over every `web/src/edit` source (one spelling: it would miss an alias, cookies, the Cache API or storage in an imported module)              | pass   |
| N2 no outbox, no automatic retry          | U3 (Retry resends the held request; push count), `save.test.ts` › N2 (no timer in `web/src/edit`; it would miss a retry chained through promises)                           | pass   |
| N3 no endpoint, protocol or schema change | K17 (`ClientChangeSchema`), W1–W4 over the real `/sync/push`; no migration in the diff                                                                                      | pass   |
| N4 no dropped column, no `null` NOT NULL  | K1, K7, P1–P5                                                                                                                                                               | pass   |
| N5 only the one session's rows            | K18, K20, K8                                                                                                                                                                | pass   |
| N6 never written: tags, settings, photos… | K4 (whole-row equality), K22, K17 (table list); review: the builders write only `firearms`, `sessions`, `series`, `shots`, `falt_stations`; no photo call in `web/src/edit` | pass   |
| N7 no write from a stale form             | K14                                                                                                                                                                         | pass   |
| N8 no shot under a final or total-only    | K9                                                                                                                                                                          | pass   |
| N9 the phone unchanged                    | no `app/src` source change (a test and i18n only); `pnpm typecheck:app`; jest 785/785                                                                                       | pass   |
| Browser checks                            | headless Chromium against `wrangler dev`; below                                                                                                                             | pass   |

## Gauntlet (final fresh run, after the last code edit)

| Layer                                           | Command                                                                                                                                                                                                  | Result                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                                                                                                                                                             | exit 0; vitest 217 files, 3519 tests passed; jest 69 suites, 785 passed; i18n 1339 keys, 0 issues |
| Coverage (gated, 100%)                          | `pnpm check` (`vitest run --coverage`; `web/src/edit/*.ts` joined the list)                                                                                                                              | statements 4749/4749, branches 3152/3152, functions 1133/1133, lines 4018/4018                    |
| Backend                                         | `cd backend && pnpm test`                                                                                                                                                                                | 27 files, 223 tests passed (W1–W4 included)                                                       |
| Mutation (tool)                                 | Stryker on the eight changed modules (entry point above)                                                                                                                                                 | 1306 killed, 6 survived, 0 no coverage: 99.54% (all 6 equivalent, below)                          |
| Mutation (hand, fails closed)                   | `node scripts/manual-mutation-web-edit.mjs`                                                                                                                                                              | 31/31 killed: 2 against K10 alone, 4 against K18 alone, 3 against the phone twin, 22 others       |
| Property-based                                  | K10 (300 runs), K18 (400 runs)                                                                                                                                                                           | pass                                                                                              |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=692 shared/src/sync-client/{session-edit,rows,bulk-edit}.test.ts app/src/db/queries/web-{edit,bulk}.test.ts web/src/edit web/src/shell/route.test.ts` | 10 files, 177 tests passed                                                                        |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check`                                                                                                                                   | built; 27 translated pages current; no dangling anchors                                           |
| Supply chain                                    | `pnpm licenses:check`; the diff of `package.json` files and the lockfile                                                                                                                                 | 98 packages, invariants hold; no dependency change                                                |

**Equivalent survivors** (line numbers at `0514736e`). `session-edit.ts:396` and `bulk-edit.ts:152`
(`firearmId !== null &&` → `true &&`): `Map.get(null)` is `undefined`, so the
live check fails the same way. `session-edit.ts:265` (a junk entry in the plan
list): it has no kind, so every step skips it. `session-edit.ts:329`
(`kind: 'keep'` → `""`): the build loop branches on `'new'` and `'delete'`
only. `model.ts:96` (`lastKey -= 1`): the row keys stay unique either way.
`save.ts:150` (`some` → `every`): the builder reports `stale` and `gone`
alone, for Delete too. The first run after R10 had a seventh survivor,
`session-edit.ts:554` (`other !== undefined &&` → `true &&` in `sameRows`):
real, since a series or station removed and another added at the same count
would make Delete throw instead of answering stale; a K24 case for that swap
now kills it. The other survivors of earlier runs were real and are now tested (an
opened series with a bad token, a free-format match format, whole-ring
scoring in a decimal discipline, a championship flag a field edit must keep,
a series with no live shots) or removed from the code (a guard that could
never fire in a fixed format, a branch on the same firearm that the summed
move already covers).

**Negative controls.** The N1 grep gate is a narrower cousin of #669's: it
looks for the literal names `localStorage`, `sessionStorage` and `indexedDB`
in `web/src/edit` (not #669's `BROWSER_STORAGE` pattern with its planted
control), and it requires at least six sources so an empty directory cannot
pass it. Round 3 showed it misses a built-up name, `caches` and
`document.cookie`, and N2's timer gate misses `queueMicrotask`; the mapping
rows say each guards one spelling. Throwaway mutants before the hand-mutation script existed: the twin
test first let "delete leaves fält stations live" and "delete leaves shots
live" pass, because its snapshot read nothing of a deleted session; the
snapshot now reads a deleted session's series, stations and live shots, and
both are killed. The first hand-mutation run left "a deleted series keeps its
shots live" alive against K18 alone; K18 now also holds that no live shot
outlives its series, and it is killed.

**RED.** The builder tests were run against a stub that throws before the
builder was filled in: 49/49 failed. For R10 and R11 the new and changed
builder tests were run against the old builder first: 14 of 66 failed; two
passed at once and were proven by hand mutants instead (K24 "gone wins over
stale", killed by checking stale first; K25 "a stored date is not checked",
killed by checking it). The web's U10 tests failed 4 of 53 first; the
`request.test.ts` U10 case was written after the builder and was shown able
to fail by a throwaway mutant (Delete opening from the fresh pull). The phone twin, backend and page-module
tests were written after their code; each was shown able to fail by the
throwaway and hand mutants above and by Stryker.

## Real execution (browser checks)

**At `8ec76b6c` (after the rebase, R10 and R11), and again at `0514736e` after round 3's fixes, 17/17 both times:** `wrangler dev` on
127.0.0.1:8792, a fresh synthetic account (`edit-692-r3@example.test`, the
QA seed: precision with photos, milsnabb competition, fält, rounds-only,
decimal), the built web app, headless Chromium; "the phone" is a second
token pushing through `/sync/push`. 17/17 checks passed, numbered here on
from the earlier list:

12. Edit a field and retype a photo series → saved, one push, the series
    keeps `photo_uri`.
13. A date in 1899 → "between 1900 and today", nothing sent.
14. A fält session's edit has fields and no series rows.
15. The phone changes the session's notes after the detail loaded → Delete
    says nothing was deleted, nothing sent, the session still live;
    **Reload** clears it, and Delete then goes through with the counter back
    by 20 (500 → 480).
16. A series added by the phone, and a fält station deleted by the phone,
    each make Delete refuse with nothing sent.
17. The Swedish message. Console: two 404s for the seed's deliberately
    missing photo, no CSP error.

**Earlier, at `c76e13c1`:**

`wrangler dev` on 127.0.0.1:8792 with a fresh synthetic account per run
(`edit-692-<run>@example.test`; two firearms, a competition with a sighter,
two series, a final and a total-only series, a training session, a fält
session and a rounds-only session), seeded through `/sync/push`; the built web
app served by the Worker; headless Chromium. The same token acted as "the
phone". 24/24 checks passed, last at `c76e13c1` (the R8 fix after it is in the builder only); screenshots stay outside the
repository.

1. The detail shows **Edit** and **Delete Session**.
2. Edit shows one row per qualification series (`8 7`, `10 9 9 8 7`,
   `X 10 9 9 8`); the final and the total-only series are listed read-only.
3. Location, competition name, a re-entered series (`10 10 10`), a new series
   and a firearm change in one Save → back on the detail with "Saved."; the
   server holds the edited row, the new shots, and the counters moved
   1000/100 → 978/78 and 500/50 → 525/75 (22 rounds off, 25 on).
4. The phone changes the session's notes while the form is open; Save →
   "changed on another device", nothing sent, the typed location still on the
   form; **Reload** refills it with the phone's notes.
5. The push's response is dropped after it reached the server → "Could not
   reach the server" and **Retry**; Retry → saved; the counter moved once
   (−3) and the series has its two shots once.
6. Save with nothing changed → "No changes to save."
7. Offline → Save disabled with the offline notice.
8. Delete Session on the fält session → the confirmation names it, its date
   and "goes down by 18"; Cancel sends nothing; Delete → the list with
   "Deleted.", the session and its stations tombstoned, the counter back by 18.
9. A rounds-only session's edit shows fields only.
10. No console error but the one deliberately dropped response (no CSP error).
11. Swedish UI (`Spara ändringar`, `Ta bort pass` confirmation) and 390 px
    width without horizontal page scroll.

## Layers not run as specified

- **N-A:** the browser checks are manual by design (spec §4); they ran
  headless. Reading the result back **on a phone** (the spec's "read them back
  on the phone") was not done: no device or emulator was used for this
  change. The phone's side is covered by P1–P7, which apply the web's changes
  through the phone's real apply path on its real schema.

## Structural blind spot

The phone's apply path runs on better-sqlite3, not expo-sqlite (P1–P7,
`asBound`). A difference in how expo-sqlite binds a value would not show here;
#669's and #674's reports have the same limit.

## After the rebase onto main (R12)

- Main's #754 removed the app's `formatSessionDate`; the delete confirmation
  now formats its date through `web/src/dates.ts`.
- Fält sessions created on the web (#713) open with fields only and are
  deleted with their stations (K20, browser 14–16).
- A web-attached photo (#714) on a series with no shots (#747 allows it)
  opens as an empty row; left empty it writes nothing (`session-edit.test.ts`
  › R12, which passed at once and was shown able to fail by a throwaway
  mutant that always rewrites the series row); its photo columns carry over
  as E10 says (browser 12).
- #747's `nothingEntered` is not applied to an edit: an edit may empty a
  session, as the phone allows, and the web can now delete one.

## Known limits

- The pull-to-push window (E6): a phone that edits the same series in the
  seconds between Save's fresh pull and the push, or before a Retry, can leave
  that series with both sets of shots, as two phones can today. Stated in the
  manual.
- With the same firearm, several series edited in one Save are one net move
  floored once; the phone floors per save. They differ only on a counter
  already lower than the rounds being removed (E4). Stated in the manual.
- Shot marks on a re-entered photo-scored series stop drawing, as after a
  keypad re-entry on the phone (E10, P7).
- `docs/implementation-plan.md` has no checkbox for the web writers; none
  was ticked.
- The page components (`edit.tsx`, `delete.tsx`) have no automated test and
  are outside the coverage list. After round 3, what they decide is in tested
  modules (`deleteClick`, `reload`, `deleteDeps` opening from the page's
  tables); the bindings themselves (which button calls which) rest on the
  browser checks (4, 7, 15, 16).
- A series that holds a photo and no shots (#714, #747) shows on the edit
  form as an empty row with Delete Series, and nothing on the row says it has
  a photo. Deleting it leaves the photo in the account with no live series,
  as the phone's delete does, but the phone shows the photo first (round 3,
  F4; for the maintainer).
- The edit page does not say that fält stations or a rounds-only session's
  rounds are changed on the phone; the manual and the spec (E11) do (round 3,
  F5; for the maintainer).

## Honest notes

- Two builder test cases were wrong as first written (a 6-shot row in a
  5-shot session; a "nothing changes" case that did change a column); both
  were corrected to say what the spec says, no assertion weakened.
- A throwaway-mutant run used `git checkout` on a file with uncommitted
  work and reverted it; the work was re-applied and committed before any
  further mutant, and every later mutant run starts from a committed state
  (the hand-mutation script refuses otherwise).
- The browser check found three layout faults (the shot inputs and the notes
  box unstyled, the back link in browser blue, the read-only list crowded),
  fixed in `5ec75697`.

## Independent verification

- Verifier: Claude Code subagent (Opus); fresh context; given the repo at
  `731b5c13` in its own worktree, the task contract, the spec and the entry
  point; not given this conversation. Blind record first, then the draft of
  this report. Correlation broken: task context. Not broken: model.
- **Round 1 at `731b5c13`: `failed`.** It reproduced every number of the
  draft (pnpm check, coverage, backend 208, Stryker 1231/6, hand mutants
  16/16, docs gates) and judged the six Stryker survivors equivalent before
  reading this report's reasons. Attacked: the run; spec vs the phone's own
  functions and edit screen; 18 mutants of its own and 4 probe tests; the hand
  mutation runner with a survivor, a build-breaking mutant and a pattern that
  matches nothing (fails closed each time); N1 and N2; the mapping both ways.
  It did not rerun the browser checks, the RED run or the shuffled run.
- Findings, with the grade the builder proposes (the maintainer grades):
  - **B1, behavioural:** the one-sighter rule counted the series as opened, so
    a sighter set on another device meanwhile on an untouched series let a
    second one through. Fixed (R5), K7 case added, seen failing first.
  - **B2, behavioural:** a new row deleted again on the form was still
    parsed, so bad text in it blocked the save. Fixed, K6 case added, seen
    failing first.
  - **B3, behavioural (a test):** the `gone` test did not pin the refresh;
    `refreshed: true` survived. Pinned, with a failed-refresh case.
  - **D1:** the guide said a save is made "completely or not at all"; E8 and
    W4 show a partial save. Corrected in EN and SV.
  - **D2, D4:** E8 and E3 described the code more narrowly or loosely than it
    is. Recorded as R6, R7.
  - **D3 / C3:** N1 and N2 guard one spelling each. Stated in the mapping.
  - **D5:** U5's refill and U2's disabled buttons run only in the page
    components, which have no automated test (browser checks 4 and 7 cover
    them). Disclosed.
  - **D6:** R4 is narrower than the phone. Put to the maintainer above and in
    the PR.
  - **C5:** the suite-health command lacked its file list. Fixed.
- **Round 2 at `c76e13c1`: `failed`.** It reproduced every number again
  (pnpm check 3386, backend 208, Stryker 1231/6, hand mutants 16/16), found
  B2, B3 and D1 fixed, and found **B1 not fixed**: the page sends every opened
  series, so a series the user left alone still carried the flag the form
  opened with and overrode the one another device had set. Its K7 case had
  drafted only the marked series, a shape the page never sends. Further
  findings: Delete has no stale check and its confirmation counts rounds from
  the page's last pull (put to the maintainer as R9); the guide said any
  change elsewhere blocks a save, where only the session row or a series the
  save writes does (corrected, EN and SV).
- **After round 2:** B1 fixed again (R8): an untouched series is counted with
  its fresh flag; a K7 case in the page's draft shape was seen failing first,
  and a hand mutant restoring the round-2 code is killed.
- **Third round approved by the maintainer on 2026-10-13**, together with
  the decision on R9 (R10). The approval is for one more round; a fourth
  is not run whatever round 3 finds.
- **Round 3 at `ee59581f`: `failed`** (the verifier's proposed grade; the
  maintainer grades). Verifier: Claude Code subagent (Opus), fresh context,
  its own detached worktree; given the task contract (the issue plus the
  maintainer's approvals of E1–E12, round 3 and R10, and the rebase
  instruction), the spec, the SHA and the entry point; this report only after
  its blind record. It reproduced every number of the draft (pnpm check 3516,
  coverage 4745/3148/1131/4013, jest 785, backend 27/223, Stryker 1291/6
  with the six survivors judged equivalent blind, hand mutants 27/27, docs
  gates, the shuffled run 174). Attacked: the run; spec vs contract (R10 as
  worded, gone before stale, fält, rounds-only, unknown disciplines,
  photo-only series, R11, main's later limits, the shot-text round trip in
  both modes, payload comparison); 17 mutants of its own (13 killed, one
  equivalent); the hand-mutation runner (fails closed on a survivor and on a
  broken mutant); N1 and N2; the mapping both ways. It found no wrong
  behaviour in the code; it failed the round on two gates that could not
  fail:
  - **F1 (behavioural if "a gate cannot fail"; else mapping):** Delete's
    page wiring in `delete.tsx` was untested: asking first, the snapshot
    passed to the builder, and Reload pulling again could each be broken
    with every test green. Fixed: the three decisions moved into tested
    modules (`deleteClick`, `reload` in `save.ts`; `deleteDeps` now opens the
    snapshot from the page's tables itself), tests seen failing first (5),
    and three hand mutants of the verifier's kind are killed. The component's
    bindings remain untested (known limits).
  - **F2 (behavioural, a gate):** K24 did not pin a shot replaced at the same
    count (the phone's re-entry), so comparing counts instead of ids
    survived. A K24 case for it now kills that mutant (the case passed at
    once against the correct code; the hand mutant shows it can fail).
  - **F3 (description):** this report called N1 "the #669 gate"; corrected
    above. N1/N2's one-spelling limits stand as disclosed.
  - **F4, F5 (SPEC gaps, for the maintainer):** a photo-only series looks
    like an empty row; the edit page does not say what it leaves to the
    phone. Not changed; listed in the known limits and the PR.
  - **F6 (description):** the manual said Delete refuses when "a shot"
    changed; only shot ids are compared. Reworded, EN and SV ("or a series
    was retyped there").
  - **Report defect:** N9's jest count was stale (726); now 785.
  - Observation, not a defect: after a lost response that landed, editing
    and saving again reports the user's own write as "changed on another
    device"; it fails closed.
- **Independent verification: not performed against the final source state
  `0514736e`.** Three rounds were run (the default cap of two plus the one the
  maintainer approved); the last verified state, `ee59581f`, returned
  `failed`, and the fixes for F1, F2, F3, F6 and the report defect since are
  not independently verified. No fourth round was run, as instructed. This
  is a declared downgrade.

## Revision 2 — fält stations and Rounds Fired (§10, #769)

- **Spec approval:** §10 approved first-hand by the maintainer on
  2026-10-13 ("do as the phone. we want parity between the two as much as
  possible"; "go with recommended answers"), before any code. §10.10
  records the answers and the notes made while implementing; those notes
  are the builder's and not separately approved.
- **Tier 3**, as §10 states. **Isolation:** branch
  `claude/769-web-edit-parity-1gj050` (the designated branch for this work,
  instead of §10.9's `feat/769-web-edit-parity`), in a fresh cloud clone;
  no worktree, because the clone is used by nothing else.
- **No dependency, endpoint, protocol or schema change** (E22).

### What was built

| Spec part        | Where                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E13–E21 builder  | `shared/src/sync-client/session-edit.ts`: `StationEditDraft`, `planStations`, `areStationsStale`, Rounds Fired in `sessionColumns`, station writes in `buildSessionEdit` |
| E13–E18 page     | `web/src/edit/model.ts` (`openForm` stations and `roundsFired`, `toDraft`, `removeStation`, `stationPositions`), `web/src/edit/edit.tsx`, `web/src/edit/messages.ts`     |
| #713 rows reused | `web/src/entry/falt-model.ts` (optional `id`, `position`, `deleted`; a stored row's shoot-off is fixed), `web/src/entry/falt-stations.tsx` (labels, Delete / Undo)       |
| Docs             | `docs/manual/guides/editing-a-session-on-the-web{,.sv}.md`; parity rule in `app/PRODUCT.md` (principle 5), root `CLAUDE.md` (rule 11), `web/CLAUDE.md`                   |

### Spec → test mapping

| Scenario | Test (file: title prefix)                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| K26      | `shared/src/sync-client/session-edit.test.ts`: three `K26` tests                                                         |
| K27      | same file: three `K27` tests                                                                                             |
| K28      | same file: `K28`                                                                                                         |
| K29      | same file: three `K29` tests                                                                                             |
| K30      | same file: three `K30` tests                                                                                             |
| K31      | same file: three `K31` tests                                                                                             |
| K32      | same file: two `K32` tests                                                                                               |
| K33      | same file: `K33`                                                                                                         |
| K34      | same file: two `K34` tests                                                                                               |
| K35–K37  | same file: `K35` (2), `K36` (2), `K37`; E18 both at once: `E18`                                                          |
| K38      | same file: `K38 property` (fast-check, 400 runs)                                                                         |
| P8–P13   | `app/src/db/queries/web-edit.test.ts`: `P8`…`P13` (two twin databases, the phone's real apply path)                      |
| W5–W6    | `backend/test/web-edit.spec.ts`: `W5`, `W6` (real Worker, D1, better-auth, in process)                                   |
| U11–U15  | `web/src/edit/stations.test.ts`: `U11` (2), `U12` (3), `U13` (2), `U14`, `U15`                                           |
| U16      | no code: #768 removed the hints before this revision (§10.10)                                                            |
| U17      | `web/src/entry/falt-model.test.ts` passes unedited (`git diff origin/main -- web/src/entry/falt-model.test.ts` is empty) |
| N10–N13  | K27/K28/K38 (positions), K26/K30 (shoot-off, photo, note), K37 (extra_rounds), K29/P13 (impossible station)              |
| N14      | U17; no `app/src` source file changed (`git diff --stat origin/main -- app/src ':!*.test.ts' ':!app/src/i18n'` is empty) |

### Gauntlet

Numbers below are from runs after the last code edit (`55a9a28`…`dbdcbfb`;
the last commit changed tests only).

- `pnpm check`: typecheck (root, app, web), schema, i18n, licenses, lint,
  format green; vitest **3640 passed, 3 failed** of 3643 with coverage
  thresholds met (100%). The 3 failures are `web/src/fields/date-time-text.test.ts`'s
  sv-FI cases and fail identically on `origin/main` in this sandbox: its
  Node (ICU 77.1) formats `sv-FI` dates as `2026-09-02`, not `02.09.2026`.
  Not this change; CI's Node is the reference. Jest (app): **785 passed**, 69
  suites.
- Coverage on the changed modules: `session-edit.ts`, `web/src/edit/model.ts`,
  `messages.ts`, `web/src/entry/falt-model.ts`: **100%** lines, branches,
  functions, statements.
- Backend: `cd backend && npx vitest run test/web-edit.spec.ts
--testTimeout=60000`: **6 passed** (W1–W6).
- Stryker, `--mutate shared/src/sync-client/session-edit.ts,web/src/entry/falt-model.ts,web/src/edit/model.ts,web/src/edit/messages.ts`:
  first run **1248 killed / 21 survived** (98.35%); five tests added for the
  real gaps (`dbdcbfb`: trimmed stored rounds, an opened station emptied,
  the discipline error text, a stored scratched flag, a stored shoot-off
  before a plain station); second run **1256 killed / 13 survived**
  (98.98%), break threshold 95. The 13:
  - **Pre-existing, unchanged lines** (5): `session-edit.ts:303`, `:367`,
    `:545`; `falt-model.ts:63`, `:239` (blame `f625c73` / `40b30b9`).
  - **Equivalent** (8):
    - `session-edit.ts:262` (2 mutants, stored-null branch of the
      unchanged-text check): a blank text always parses to null, which
      equals a null stored value, so the column filter drops it either way.
    - `:434` (`get(null)` is undefined), `:465` (the position only names the
      station in `stationProblem`'s message, which is compared to null), and
      `:486` (the `'new'` kind is reached by the loop's `else`).
    - `web/src/edit/model.ts:112` (`nextKey` decrementing still gives unique
      keys).
    - `falt-model.ts:80`: a stored row without hits cannot reach it, since
      the page offers no unchosen Hits on one.
    - `falt-model.ts:133`: `?.` is guarded by `lastKept !== undefined`.
- Docs gates: `mkdocs build --strict` green; `docs-translation-check`: 27
  pages current; `docs-anchor-check`: no dangling anchors.

### Real execution (browser checks)

The web app was built and served by `wrangler dev` against local D1, seeded
through `/sync/push` with synthetic data (a fält session with stations at 1,
2 and a scratched 4, a rounds-only session of 40 on one firearm at 500), and
driven with Playwright:

- Opened the fält edit page: stations labelled 1, 2, 4; Result Mode shown
  read-only; stored rows offer no "–" for Hits.
- Deleted station 1, changed station 2's hits, added a station (labelled 5),
  saved: the detail shows stations 2, 4, 5; reopening shows the same.
- Rounds Fired `2.5` refused under the field, nothing sent; `55` saved. The
  firearm's pulled counter: **515** (500 + 6 − 6 + 15).
- Swedish UI: all labels translated. A station note changed through
  `/sync/push` while the page was open, then a station edit saved: refused
  as stale, Ladda om offered.
- No console errors. Not run: a phone reading the result back (no device in
  this environment); P8–P13 carry that on the phone's schema.

### Known limits

- As E19 says: the one net counter move differs from the phone's
  per-station moves only when a floor bites.
- New station labels assume every new row is entered; a blank new row in
  the middle shifts the label of the rows after it by one at save time
  (the builder numbers only entered rows).
- The pull→push window of E6 applies to stations as it does to series.

### Independent verification (revision 2)

Pending.
