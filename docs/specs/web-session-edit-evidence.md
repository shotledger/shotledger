# Evidence report — editing and deleting a session on the web (Tier 3)

Spec: [`web-session-edit-spec.md`](web-session-edit-spec.md), including its
§9 revisions R1–R9.

- **Spec approval: approved first-hand by the maintainer on 2026-10-12**
  (PR #710: "the maintainer approved the spec (key choices E1–E12) for
  merge"), taking the recommended option on that PR's four questions. The
  spec was approved before any code was written. R1–R9 were made during the build and the verification and are recorded in §9. R1–R3 and R5–R8 refine or correct the spec's own wording; R9 asks whether Delete needs a stale check; **R4 narrows E2** (a training session's
  weapon group, class and event are not offered on the web, where the phone
  offers a stored one) and needs the maintainer's ruling.
- **Independent verification:** see [the section below](#independent-verification).
- **Source state:** branch `feat/692-web-session-edit` on `origin/main`
  `41b1b7fe`; the code and tests this report describes are at `17055c28`
  (this report is committed on top).
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
| E9 strings              | `web.edit.*` in `app/src/i18n/{en,sv}.json` (20 keys each; existing keys reused where they fit)      |
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

## Spec → test mapping

| Scenario                                  | Test                                                                                                                                                                        | Status |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| K1–K9, K11–K17                            | `shared/src/sync-client/session-edit.test.ts` › edit builder (several cases per id; K6 and K9 also pin the refusals)                                                        | pass   |
| K10 property (fast-check, 300 runs)       | `session-edit.test.ts` › K10                                                                                                                                                | pass   |
| K18 property (fast-check, 400 runs)       | `session-edit.test.ts` › K18 (an oracle written apart from the builder)                                                                                                     | pass   |
| K20–K23                                   | `session-edit.test.ts` › delete builder                                                                                                                                     | pass   |
| K11 counter move                          | also `rows.test.ts` › withRoundsMoved                                                                                                                                       | pass   |
| P1–P7                                     | `app/src/db/queries/web-edit.test.ts` (two phone databases; P2+P3 is the firearm change and re-entry in one Save)                                                           | pass   |
| W1–W4                                     | `backend/test/web-edit.spec.ts` (Workers pool, real D1 + better-auth)                                                                                                       | pass   |
| U1                                        | `web/src/edit/model.test.ts`                                                                                                                                                | pass   |
| U2–U9                                     | `web/src/edit/save.test.ts`; U7 also `messages.test.ts`                                                                                                                     | pass   |
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
| N9 the phone unchanged                    | no `app/src` source change (a test and i18n only); `pnpm typecheck:app`; jest 726/726                                                                                       | pass   |
| Browser checks                            | headless Chromium against `wrangler dev`; below                                                                                                                             | pass   |

## Gauntlet (final fresh run, after the last code edit)

| Layer                                           | Command                                                                                                                                                                                                  | Result                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Tests + types + lint + format + i18n + licenses | `pnpm check`                                                                                                                                                                                             | exit 0; vitest 207 files, 3387 tests passed; jest 66 suites, 726 passed; i18n 1303 keys, 0 issues |
| Coverage (gated, 100%)                          | `pnpm check` (`vitest run --coverage`; `web/src/edit/*.ts` joined the list)                                                                                                                              | statements 4453/4453, branches 2882/2882, functions 1061/1061, lines 3767/3767                    |
| Backend                                         | `cd backend && npx vitest run --testTimeout=60000`                                                                                                                                                       | 23 files, 208 tests passed (W1–W4 included)                                                       |
| Mutation (tool)                                 | Stryker on the eight changed modules (entry point above)                                                                                                                                                 | 1232 killed, 6 survived, 0 no coverage: 99.52% (all 6 equivalent, below)                          |
| Mutation (hand, fails closed)                   | `node scripts/manual-mutation-web-edit.mjs`                                                                                                                                                              | 17/17 killed: 2 against K10 alone, 4 against K18 alone, 3 against the phone twin, 8 others        |
| Property-based                                  | K10 (300 runs), K18 (400 runs)                                                                                                                                                                           | pass                                                                                              |
| Suite health                                    | `npx vitest run --sequence.shuffle --sequence.seed=692 shared/src/sync-client/{session-edit,rows,bulk-edit}.test.ts app/src/db/queries/web-{edit,bulk}.test.ts web/src/edit web/src/shell/route.test.ts` | 10 files, 160 tests passed                                                                        |
| Docs gates                                      | `mkdocs build --strict`; `docs-translation-check`; `docs-anchor-check`                                                                                                                                   | built; 27 translated pages current; no dangling anchors                                           |
| Supply chain                                    | `pnpm licenses:check`; the diff of `package.json` files and the lockfile                                                                                                                                 | 98 packages, invariants hold; no dependency change                                                |

**Equivalent survivors.** `session-edit.ts:388` and `bulk-edit.ts:152`
(`firearmId !== null &&` → `true &&`): `Map.get(null)` is `undefined`, so the
live check fails the same way. `session-edit.ts:257` (a junk entry in the plan
list): it has no kind, so every step skips it. `session-edit.ts:321`
(`kind: 'keep'` → `""`): the build loop branches on `'new'` and `'delete'`
only. `model.ts:96` (`lastKey -= 1`): the row keys stay unique either way.
`save.ts:150` (`some` → `every`): the builder reports `stale` and `gone`
alone. The other survivors of earlier runs were real and are now tested (an
opened series with a bad token, a free-format match format, whole-ring
scoring in a decimal discipline, a championship flag a field edit must keep,
a series with no live shots) or removed from the code (a guard that could
never fire in a fixed format, a branch on the same firearm that the summed
move already covers).

**Negative controls.** The N1 grep gate is the #669 gate pointed at
`web/src/edit`; it requires at least six sources so an empty directory cannot
pass it. Throwaway mutants before the hand-mutation script existed: the twin
test first let "delete leaves fält stations live" and "delete leaves shots
live" pass, because its snapshot read nothing of a deleted session; the
snapshot now reads a deleted session's series, stations and live shots, and
both are killed. The first hand-mutation run left "a deleted series keeps its
shots live" alive against K18 alone; K18 now also holds that no live shot
outlives its series, and it is killed.

**RED.** The builder tests were run against a stub that throws before the
builder was filled in: 49/49 failed. The phone twin, backend and page-module
tests were written after their code; each was shown able to fail by the
throwaway and hand mutants above and by Stryker.

## Real execution (browser checks)

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
- **Independent verification: not performed against the final source state
  `17055c28`.** Two rounds were run (the default cap); the last verified state,
  `c76e13c1`, returned `failed`, and the R8 fix since is unverified. A third
  round needs the maintainer's approval. This is a declared downgrade.
