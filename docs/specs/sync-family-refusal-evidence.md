# Refuse a refused row's whole family — evidence

Spec: `docs/specs/sync-family-refusal-spec.md` (issue #856, PR #857).

**Spec approval: obtained** for the spec as approved on 2026-10-16 ("Approve
all", Q1–Q4 as recommended). **Revision 2: items 1–5, 7 and 8 approved**
by the maintainer on 2026-10-16 (item 4's web message tracked in #863), and
with items 7 and 8 a third verification round. **Item 6 is pending**, and
so are items 9 and 10, the fixes for round 3's findings. The one item that
changes a test assertion is item 1 (P8, below). Each item that changes
behaviour is its own commit so it can be reverted alone: item 1
`3557991`; item 6 (round 1's B1, a deletion of a held row releases it)
`8136c19`; item 7 (round 2's B-1, every held entry is judged again each
push) `2a55186`, with `d179178` dropping two guards Stryker showed
equivalent (revert the two together); item 8 (round 2's B-2, a held edit
does not shadow a pull) `0f35dee`; item 9 (round 3's B-1, a held edit is
dropped only for a later pulled change) `c4499fe`; item 10 (round 3's B-2,
step 1 releases only what nothing blocks) `3282cb8`, with its tests
completed in `97c2ccb` (revert the two together). Round 2's T-1 test is
`215f44b`; round 3's Swedish wording is `3ec10d5`.

- **Source state:** the head of `feature/856-sync-family-refusal` that this
  report is committed in; code last changed at `97c2ccb` (the commit after
  it touches docs only). `main` at `0e01849` (with the #862 clock fix) is
  merged in at `a4ab9ee`. Independent verification saw `6263df3` (round
  1), `aa4827d` (round 2) and `b399be4` (round 3).
- **Independent verification: failed** at `6263df3` (round 1, on B1), at
  `aa4827d` (round 2, on B-1) and at `b399be4` (round 3, on B-1); **not
  performed** against the final state (round 4 needs the maintainer's
  approval). Below.
- **Toolchain:** Node 24.21.0, pnpm 12.11.2, vitest 5.0.3,
  `@cloudflare/vitest-plugin` 1.4.0 (backend), Stryker 10.0.0 with the vitest
  runner, fast-check 4.10.2, jest-expo (app). No dependency added.
- **Entry point:** `pnpm check` from the repo root, then
  `cd backend && npx vitest run --testTimeout=60000` (and once more with
  `--sequence.shuffle`), then `node scripts/manual-mutation-sync-push.mjs`
  and
  `npx stryker run --mutate 'shared/src/sync/family.ts,shared/src/sync/merge.ts,shared/src/sync-client/engine.ts,shared/src/sync-client/status.ts,shared/src/sync-client/shadow.ts'`,
  then the docs gates.
- **Environment, round 2:** the worktree's `node_modules/.bin` shims pointed
  into a deleted scratch tree, so app jest could not resolve
  `@babel/runtime`; `pnpm install --frozen-lockfile --force` relinked them
  (no lockfile or `package.json` change).
- **Tier 3** (the sync engine's push path). Isolation: the worktree
  `/home/claude/wt856`, its dependencies reinstalled there with
  `pnpm i --frozen-lockfile` (the worktree's `shared/node_modules` lacked
  `drizzle-orm` until then, so the backend could not load `shared/src/sync`).

## Spec → tests

| Scenario                                                                      | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 a refused session refuses its push family                                  | `backend/test/sync-family-refusal.spec.ts` "F1 …" (acks, no row stored, `last_seq` 0, idempotency record `rejected`/`family_refused`/no seq)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F2 a refused shot refuses its session's family                                | backend "F2 …"; `family.test.ts` "refuses a session family up, across and down from a refused series"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F3 siblings through a bare parent id                                          | backend "F3 …"; `family.test.ts` "links siblings through a parent that is not in the push"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| F4 unlinked rows are not refused (C4)                                         | backend "F4 …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F5 other families untouched                                                   | backend "F5 …"; `family.test.ts` "keeps two sessions apart"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| F6 firearm down only                                                          | backend "F6 …" (both halves); `family.test.ts` "refuses only below a refused firearm, never a sibling firearm row"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| F7 references are not families                                                | backend "F7 …" (a firearm refused earlier; and in the same push, with a refused tag and a link to it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F8 tombstones never family-refused                                            | backend "F8 …"; `family.test.ts` "never returns a tombstone, and a tombstone links nothing" and "… even when it carries a payload"; property "tombstones are never refused"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| F9 replay as duplicate with its reason                                        | backend "F9 …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F10 a tombstoned row still reports tombstoned                                 | backend "F10 …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| F11 the ownership map covers every foreign key                                | backend "F11 …" (reads `getTableConfig(table).foreignKeys` of every `SYNC_TABLES` table); `family.test.ts` "the edge lists" pins both lists by value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| H1 rows after a refused session row are held                                  | `backend/test/sync-client.spec.ts` "H1 …" (real engine, real Worker); `engine.test.ts` "holds every live row of a refused session's family and sends the rest (step 2, H1)"; the line: `app/src/features/account/account-screen.test.tsx` "the held-changes line"; the running app, screenshot below; `account-screen.test.tsx` "shows a single held change" (round 2, T-1: the line at a count of one)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| H2 fixing the refused row sends the family                                    | backend "H2 …" (one push of R1, T1, T2, s1, all applied; device B receives them); `engine.test.ts` "releases the family when the refused row is queued again (step 1, H2)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| H3 family-refused rows are held, not lost                                     | backend "H3 …" (held, `clientChangeId` null, then new ids and applied); `engine.test.ts` "holds a family_refused (rejected/duplicate) entry …" and "leaves an entry rewritten mid-push unheld … (rev-matched)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| H4 a refused shot freezes the session                                         | backend "H4 …" (device B keeps the old name and has no T3); `engine.test.ts` "a refused shot holds its siblings, its series and its session (H4)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| H5 refused firearm holds its rows only                                        | backend "H5 …"; `engine.test.ts` "(H5)", "only a refused firearm blocks a firearm's rows, not another row with its id", "holds a refused firearm's own entry written after step 1"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| H6 a refused license holds only itself                                        | backend "H6 …"; `engine.test.ts` "(H6)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| H7 deleting the refused row releases the family                               | backend "H7 …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| H8 a pull replacing the refused row releases                                  | backend "H8 …" (device B's valid T2 pulled; T3 pushed in the same cycle); `engine.test.ts` "releases the family when a pull replaces the refused row (H8)" and "a pull of an unrelated row releases nothing"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| H9 held entries never stall the outbox                                        | backend "H9 …" (600 held, 10 tags: one push of 10, `status: ok`); `engine.test.ts` "(H9)": 600 held shots of a refused session, each released and held again at step 1, then 10 tags in one push                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| H10 tombstones are never held                                                 | backend "H10 tombstones are never held" and "H10 a tombstone of an already-held row is pushed"; `engine.test.ts` "never holds a tombstone (H10)" (the hold check reads the local row's payload, which a tombstone keeps, so only the `deletedAt` guard lets it through); for a row already held when it is deleted, the real triggers: `sync-store.test.ts` "a deletion of a held row is never held (C3)", one case per synced table (an edit keeps `held`, a soft delete clears it and `readOutbox` returns it), and "V1 a held shot deleted after its session was refused is pushed (real store and engine)" (the verifier's repro, against a fake server that judges with the real `familyRefusals`: one push of the tombstone, `held: 0`, an empty outbox). The backend test's `Device` double mirrors the trigger, so the real-SQLite tests are the evidence for the trigger itself |
| H11 the held count survives a restart                                         | `app/src/db/queries/sync-store.test.ts` "H11 the held count survives a restart" (held entries copied to a file with `VACUUM INTO`, reopened, counted by a fresh store); `sync-controller.test.ts` "is read from the store on a refresh, with no cycle (H11)"; `account-screen.test.tsx` "shows it after a restart …"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| H12 the web reports a family refusal                                          | backend "H12 …" (`pushChanges` against the real Worker: `partlyRejected` with `invalid_payload` and `family_refused`; a replay too). **The page half is not met**: see Revision 2 item 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| H13 a held row nothing blocks is released (Revision 2 item 7)                 | backend "H13 a held row whose blocker was acked tombstoned is released and sent" (the verifier's V-D: one later push of R1 and T1, nothing held, B has them under the deleted s1) and "H13 a refused row whose session another device deleted holds nothing"; `engine.test.ts` "releases a held entry whose family no refused row blocks any more", "judges a held entry again each cycle: still blocked, it stays held and unsent", "a refused row whose session is deleted here blocks nothing", "a refused session deleted here blocks nothing either"                                                                                                                                                                                                                                                                                                                                |
| H14, H15 a held edit does not shadow a pull (Revision 2 item 8)               | backend "H14 another device’s later rename of a held row wins on both devices" (the verifier's V-A: B-name on both, then only T2 pushed) and "H15 another device’s deletion of a held row arrives at once" (V-C); `engine.test.ts` "a pulled change for a held row is applied and drops its entry", "a pulled tombstone of a held row is applied and drops its entry", "an unheld queued edit still shadows a pull of its row, held rows beside it or not", "a held entry rewritten after it was read shadows the pull (rev-matched drop)"; `sync-store.test.ts` "readHeld returns the held entries only"                                                                                                                                                                                                                                                                                |
| H16 a held edit is dropped only for a later pulled change (Revision 2 item 9) | backend "H16 this device’s own older push, pulled back, does not drop its held edit" (the verifier's ECHO: the rerun shadows A1, A2 stays held, then A2 and T2 go out and both devices show A2) and "H16 control: without the refusal the later rename wins as well"; `engine.test.ts` "this device’s own older push, pulled back, does not drop the held edit after it"; `shadow.test.ts` "replacesHeldEdit": later, older, equal, instants not strings, an unparsable time, a tombstone, no local row. H14 and H15 still pass: another device's later edit or deletion still wins                                                                                                                                                                                                                                                                                                      |
| H17 a held edit stays held through failed pushes (Revision 2 item 10)         | backend "H17 a held edit stays held through failed pushes, so a later edit elsewhere still wins" (the verifier's RELEASEFAIL, batches of 2 and 1); `engine.test.ts` "a push that fails before a held entry is read leaves it held", "a failure while judging the held entries releases none of them", "counts the entries still held after step 1 as held this cycle", "releases a held entry whose row is gone, and step 2 clears it", "… whose row is deleted, and step 2 sends the tombstone", "with nothing held, step 1 reads no rows"; `sync-store.test.ts` "releaseHeld un-holds the named entries only, whatever their rev"                                                                                                                                                                                                                                                      |
| §2.3 the SQLite adapter                                                       | `sync-store.test.ts` "held entries and the refused set": `readOutbox` skips held, `heldCount`/`pendingCount`, hold resets the id, rev-matched hold, an edit keeps `held`, `releaseHeld`, the refused set, sign-out and backup reset empty it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| §6 property: the refused set is the family                                    | `shared/src/sync/family.property.test.ts`: random session and firearm trees, shuffled, with random invalid sets — the result equals an oracle written from §2.1; no invalid row → nothing refused; tombstones never refused                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| §9 an orphan forms its own family                                             | `engine.test.ts` "an orphan whose parent is missing locally forms its own family (§9)", "a refused row that is gone locally blocks only its own id"; `family.test.ts` "familyRoot"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**RED.** The server scenarios were RED with the route wired and
`familyRefusals` stubbed to return nothing: 7 of 15 backend tests failed
(F1, F2, F3, F5, F6's first half, F9, the log line). F4, F6's second half,
F7, F8, F10, F11 and the no-log case passed: they pin behaviour that must
not change, and Stryker and the manual mutants below prove each can fail.
The engine tests were RED against `main`'s `engine.ts`: 12 of 41 failed;
the rest pin existing or guard behaviour. All ten H1–H10 end-to-end tests
failed against `main`'s `engine.ts`. The `family.test.ts` and property tests
were written after `family.ts` (the server RED came through the backend
suite); Stryker's kills are their evidence. The Stryker survivors of the
first run became RED-first tests in `278dac3` (all four passed on the code,
as regression armour for mutants Stryker had shown alive). The B1 tests
were RED on the old triggers: 15 of 15 failed, the 14 per-table cases and V1 (the
soft delete left `held: 1`, and V1's push carried nothing), then passed
with `8136c19`. Round 2's tests were RED against the engine before each
fix: for item 7, 4 of the 4 new engine tests and both H13 tests; for item
8, 3 of the 4 new engine tests (the unheld-shadow one is a guard and
passes on both; the rev-matched one fails on the old engine only because
it never reads the held entries) and both H14 and H15. The T-1 test passes
on the code and fails with `heldCount > 1` in `account.tsx`. Round 3's
tests were RED before each fix: for item 9, the new engine test and H16
(its control passes on both, a guard); for item 10, run against the new
code with only step 1 put back to release everything, the two failure
tests and H17. The rest of item 10's tests pin cases Stryker found
unpinned (`97c2ccb`).

## Must NOT

| Constraint                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 protocol version and shapes         | `protocol.ts` untouched; the ack shape is unchanged; `REJECTED_FAMILY = 'family_refused'` joins `merge.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| N2 pull path unchanged on the server   | no diff to `pullTablePage` or the pull route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| N3 atomicity and P1–P12 unchanged      | `sync-concurrency.spec.ts`, `sync.spec.ts` and every P test pass with unchanged assertions **except P8**, whose fixture is F2's shape (Revision 2 item 1, commit `3557991`). The manual mutation script's 19 older mutants are still killed                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N4 a valid family behaves as today     | property "a push with no invalid row is unaffected"; `engine.test.ts` "with nothing refused, reads no extra rows and releases nothing (N4)"; every pre-existing engine and sync-client test passes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| N5 no server-side foreign-key check    | none in the diff; F4 applies a shot whose series is absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| N6 no id or value in a log line or ack | backend "the route logs a family refusal without ids or values (N6)" (exact line `sync push: refused 2 with their family (series, shots)`, no id); manual mutant "the family log line names row ids" killed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N7 no new dependency                   | `package.json` files and the lockfile untouched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| N8 no test assertion weakened          | assertions changed: P8 (to the new outcome, stricter: two rejections and nothing stored); the `held: 0`/`heldCount: 0` fields added to existing `toEqual` expectations of the result and status shapes, and `held: 0` to B4's outbox row — each adds a field, none removes one. Round 3 replaced the store test "releaseHeld un-holds every entry" with one that releases one of two held entries and checks the other stays held (the port now names what to release); stricter, nothing dropped. Round 2 changed one fixture, no assertion: the H9 unit test's 600 held tags had nothing blocking them, which is B-1's own state, so they became 600 held shots of a refused session with the same assertions |

## Gauntlet

All numbers from runs after the last code edit (`97c2ccb`, with `main` at
`0e01849` merged in) unless marked.

| Layer            | Command                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite       | `pnpm check`                                                                | exit 0: typecheck (root, app, web), schema, i18n (1541 keys each), licenses, lint, format; vitest 250 files, 4544 tests, coverage thresholds met; app jest 112 suites, 1072 tests. Round 1 (`6263df3`) had exit 1 on a date-dependent jest test, fixed on `main` by #862                                                                                                                                                                                                                                                                                                              |
| Backend          | `npx vitest run --testTimeout=60000`                                        | 30 files, 298 tests, exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Suite health     | the same with `--sequence.shuffle`                                          | 30 files, 298 tests, seed 1792193202033, exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Manual mutation  | `node scripts/manual-mutation-sync-push.mjs`                                | baseline passes; 26/26 mutants killed (12 atomicity, 7 payload validation, 7 for this change), exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Stryker (scoped) | the command in the entry point (`shadow.ts` added in round 2)               | 336 mutants: 329 killed, 5 timed out, 2 survived; score 99.40%. `family.ts` 98.81, `engine.ts` 99.46, `merge.ts`, `shadow.ts` and `status.ts` 100; both survivors are equivalent (below). The first run after round 3's fixes had 8 more survivors and 1 uncovered mutant in item 10's step 1, cases no test pinned; `97c2ccb` pins each. After round 2's fixes, 7 equivalent survivors were removed in `d179178`. The store is not in scope: its changes are SQL triggers and queries, covered by `sync-store.test.ts`. The first run, before `278dac3`, was 97.16% with 8 survivors |
| Coverage         | inside `pnpm check` (`vitest run --coverage`)                               | 100% on the gauntlet modules, `family.ts` included through `shared/src/sync/*.ts` (no `stryker.config.json` change needed); exits nonzero below it                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Property         | fast-check in `family.property.test.ts`                                     | passes inside the suite. Not run as a mutation suite alone, so no claim that the properties by themselves kill a mutant                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Real execution   | H1–H17 in `sync-client.spec.ts`; F1–F11 and H12 in workerd; the running app | pass; and the web preview against a local `wrangler dev` (below), at `6263df3`: the later fixes change no screen; the one string changed (the Swedish refused line) is checked by the i18n gate                                                                                                                                                                                                                                                                                                                                                                                       |
| Docs             | `mkdocs build --strict`, `docs-anchor-check`, `docs-translation-check`      | build passes; 29 translated pages current; no dangling anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Equivalent mutants.** `family.ts:97` `edges.get(next) ?? []` →
`?? ["Stryker was here"]`: a leaf node gains a neighbour key no change has,
so nothing more is refused. `engine.ts:115` `firearmId ?? ''` →
`?? "Stryker was here!"`: neither string is a refused firearm's id. The five
timeouts are loop-bound mutants (counted as killed by Stryker); one of them
sits at the timeout bound, which is why runs report 4 or 5.

**Manual mutants added** (`scripts/manual-mutation-sync-push.mjs`, which
Stryker cannot replace because the route and the batch run only in workerd):
the route ignores the family verdict; reports it as `invalid_payload`;
reports an invalid change as `family_refused`; computes no family; logs row
ids; does not log; the batch records every refusal as `invalid_payload`.
Five of the older mutants were re-pointed at the new code (`valid` became
`reason`, `invalid` became `refusals`), each still the same bug.

## Real execution in the running app

The web preview (`expo start --web` behind `coi-proxy.mjs`) against a local
`wrangler dev` with local D1, driven by a headless Chromium. `/dev` demo
data, then a new account `demo-856@example.invalid` on the local server.
**Fault injection, disclosed:** the harness sets `name: null` on the first
session row of the first push as it leaves the page, standing in for a
writer bug; the real server judged it. Its acks: 1 `invalid_payload`, 37
`family_refused`, 462 applied, then 1078 more applied over three pushes.
Account & Sync then read "1 change(s) refused by the server and not synced"
and "37 change(s) waiting on a refused change", with 37 waiting to upload.

Screenshot: `/mnt/project-files/screenshots/856-held-count/account-sync-held-en.png`
(a shared folder, outside the repository).

Two harness shims, neither in the repo: Chromium came from the
`@sparticuz/chromium` npm package in a scratch directory (the Playwright
CDN is blocked here), and the harness bound `window.fetch`. The app hands
the bare global `fetch` to the shared HTTP client, which calls it unbound;
a browser refuses that ("Illegal invocation"), so the web preview cannot
sign in or sync at all without the shim. A phone does not care. That is a
web-preview limitation older than this change, reported, not fixed here.
The harness also dropped the browser's `Origin` header on the way to the
local server, as a phone sends none.

## Independent verification

**Failed** at `6263df3` (round 1, on B1), at `aa4827d` (round 2, on B-1)
and at `b399be4` (round 3, on B-1). **Not performed** against the final
state: round 3's fixes came after the last verified state, and a fourth
round needs the maintainer's approval.

- **Verifier:** a fresh-context Claude agent (the same model family as the
  builder), run to `references/verifier.md`. Blind first, on four inputs:
  the task contract, the approved spec, the source state `6263df3` (a
  detached worktree, `/home/claude/wtverify`), and the entry point. It read
  the draft of this report only after writing its blind record. This breaks
  task-context correlation (it did not see the builder's reasoning or
  conversation); it does not break model correlation.
- **Rounds:** 3; the cap of 2 was raised to 3 by the maintainer's
  approval of a third round. Each is a new fresh-context verifier in its
  own detached worktree, installed fresh. Round 1, at `6263df3`:
  **failed** on B1. Round 2, at `aa4827d` (`/home/claude/wtverify2`):
  **failed** on B-1. Round 3, at `b399be4` (`/home/claude/wtverify3`):
  **failed** on B-1. Round 4: pending the maintainer's approval.
- **Grading:** the verifiers proposed the grades below. The coordinator
  relayed each round's findings to the builder to fix. The maintainer
  approved round 2's fixes (items 7 and 8) and a third round; round 3's
  grades and fixes, item 6, and stopping are the maintainer's to decide.
- **Attacked:** reran the gauntlet at `6263df3`; `pnpm check` (every gate
  through vitest green, 250 files, 4506 tests; jest 1070 of 1071, the date
  test that #862 later fixed), the backend (30 files, 290 tests), the scoped
  Stryker run and the manual mutation script (26/26). Planted its own
  mutants: ten in the SQLite store (S1–S9 killed; S10, `releaseHeld` also
  clearing change ids, survived as near-equivalent), fifteen in the engine
  (E1–E15: a refused row's own key in place of its root, a refused
  firearm's own later entry, step 1's release, release without un-hold, a
  replayed `invalid_payload` and more), and two against the F11 checker (an
  edge dropped, a reference listed as an edge). Reproduced a held deletion
  in the real SQLite store and engine. Read the web entry page against H12,
  and the spec text against the code.
- **Stryker timing.** The verifier's run counted 275 killed and 5 timed out
  where the builder's had 276 and 4. One mutant sits at the timeout bound
  and lands on either side by machine load; Stryker counts a timeout as a
  kill, so the score (99.29%) and the two survivors are the same.

### Round 1, at `6263df3`

- **Findings, behavioural:**
  - **B1, fixed in `8136c19`, not re-verified.** A deletion of a row whose
    outbox entry was already held stayed held. The triggers kept `held` on
    every upsert, so `readOutbox` skipped the tombstone and it never reached
    the engine's `deletedAt` guard, against C3 and H10. Repro: s1 synced, s1
    refused, t1 edited (held), t1 soft-deleted: the outbox kept
    `{shots:t1, held: 1}`, and the push carried nothing. Fix: the triggers
    clear `held` when the written row is a tombstone (spec Revision 2
    item 6, which records the conflict with §2.3's "an edit keeps it held").
    Tests: H10 in the mapping above.
  - **B2 = Revision 2 item 4, not fixed.** The web entry page shows "Saved."
    on `partlyRejected`, so a new session refused whole with its family
    reads as saved. The spec keeps the web unchanged; H12 pins only
    `pushChanges`. For the maintainer.
- **Findings, description and mapping** (disclosed, no new round):
  - **D1 = Revision 2 item 3:** §2.3 and §8 say "a new migration"; the
    baseline is edited in place, per hard rule 8.
  - **D2 = Revision 2 item 1:** N3 says P1–P12 pass with unchanged
    assertions; P8's changed (F2 against N3).
  - **D3 = Revision 2 item 2:** §4's invalid shot is `value: -1`; the tests
    use `value_tenths: null`, because the schema does not range-check.
  - **O1 (low, open):** F11 checks both edge lists against the Drizzle
    foreign keys, but nothing checks `FAMILY_KIND` against
    `OWNERSHIP_EDGES` for a new table; that is pinned by value only.
  - **O2 (no finding):** a fix written while the refused row's push is in
    flight is held for one cycle; the controller's rerun picks it up.
- Round 2 saw the B1 fix (`8136c19`) and found nothing wrong with it.

### Round 2, at `aa4827d`

- **Attacked:** a fresh install with a link check and a canary (an empty
  `familyRefusals` in the tree under test failed F1, F2, F3, F5 and F6);
  the gauntlet again (`pnpm check` exit 0, 4521 and 1071 tests; backend
  291, shuffled too; the root sync suites shuffled, 668 tests; manual
  mutation 26/26; Stryker without `merge.ts`, 257 mutants: 250 killed, 5
  timed out, the same two equivalent survivors, 99.22%). The approved spec
  against the diff line by line. A scratch end-to-end suite on the real
  Worker: pulls against held entries (V-A, V-C), an invalid row acked
  `tombstoned` with its family `family_refused` (V-D), and a control
  without the refusal (V-B). Its own mutants: `readBlocked` hoisted out of
  the loop, step 1 releasing from `readOutbox` instead of `pendingRowKeys`
  (killed by one unit test only; the backend suite does not kill it), four
  in the SQLite store, the controller's held count, the account screen's
  `heldCount > 0`, and `falt_stations` moved from ownership to reference
  (killed by the pins and the property test; F11 checks coverage, not
  classification). Every `_id` column of the synced tables checked by hand
  for a missing foreign key. The web page on a family refusal, the round
  count of a held session's firearm.
- **Findings, behavioural:**
  - **B-1, fixed in `2a55186`, not re-verified.** A `family_refused` entry
    could stay held forever with nothing refused: B deletes s1; A, unsynced,
    writes s1 with `name: null` and adds R1 and T1; A's push is acked s1
    `tombstoned` (C11 precedence) and R1, T1 `family_refused`, so s1 never
    entered the refused set and nothing released R1 and T1. Fix (Revision 2
    item 7): step 1 releases every held entry each push and step 2 judges
    each again; a refused row whose session is deleted locally blocks
    nothing. R1 and T1 go out, as before family refusal (N5). Tests: H13
    in the mapping, now named by the failure model's "a held row is never
    released" row.
  - **B-2, fixed in `0f35dee` as proposed, the resolution pending the
    maintainer; not re-verified.** A held entry shadowed a pulled change,
    and the cursor moved past it, so on release the older held edit
    overwrote another device's later edit everywhere (A-name over B-name),
    and another device's deletion was delayed. Fix (Revision 2 item 8): a
    pulled change for a held row is applied and the held entry dropped; an
    unheld entry still shadows. Tests: H14 and H15 in the mapping.
  - **B-3 = round 1's B2 = Revision 2 item 4, not fixed.** For the
    maintainer, as before.
- **Findings, description and mapping:**
  - **S-1 = D1** (item 3), **S-2 = D2** (item 1), **S-4 = D3** (item 2):
    disclosed as before.
  - **S-3 = Revision 2 item 6:** the soft-delete release contradicts §2.3's
    approved text; disclosed as unapproved.
  - **T-1, fixed in `215f44b`:** `heldCount > 0` mutated to `> 1` in
    `account.tsx` survived; a test at a count of one now kills it.
  - **O-1, not fixed (observation):** a held session's shots still move
    `firearms.round_count`, and the firearm row is a reference, never held.
    Recorded under Known limits for the maintainer.
  - The round-1 report's failure model claimed H2, H3, H7 and H8 covered
    "a held row is never released"; B-1 was such a row. The row now names
    H13.
  - The verifier first misread its own Stryker table (killed and timed-out
    columns) and corrected it after comparing; the figures above are the
    corrected ones.
- Round 3 saw these fixes (`2a55186`, `d179178`, `0f35dee`, `215f44b`) at
  `b399be4`; its B-1 and B-2 are in item 8's and item 7's code.

### Round 3, at `b399be4`

- **Attacked:** an environment check first (the store, the shared link and
  the workerd sourcemaps all inside its own worktree; no `.bin` shim
  pointing elsewhere); the gauntlet again (`pnpm check` exit 0, 4530 and
  1072 tests; backend 295; Stryker 300 mutants, 293 killed, 5 timed out,
  the two equivalent survivors; manual mutation 26/26). The spec against
  the issue's examples, C4's gap, an invalid ownership column, item 6's
  triggers per table, item 8 against the protocol's echo of a device's
  own pushes. Its own engine mutants (M1–M11: the held drop removed, no
  step-1 release, no deleted-root skip, no id reset, the pending keys read
  before the drop, no step-1 forget: all killed; M7, forgetting refusals
  for shadowed changes too, survived as equivalent). F11 fed known-bad
  edge lists, and a server mutant returning tombstones from
  `familyRefusals` (killed by the shared tests, not the backend family
  spec). A scratch end-to-end suite on the real Worker: ECHO and CONTROL
  (B-1), FIXMIDPUSH (L-1), RELEASEFAIL (B-2). Failed pushes between
  release and re-hold, partial cycles, undelete, a hard delete of a held
  row, a mid-cycle rerun.
- **Findings, behavioural:**
  - **B-1, fixed in `c4499fe` as proposed, the resolution pending the
    maintainer; not re-verified.** A pull returns this device's own pushes.
    When A1 of s1 landed in a push and A2 was written mid-push and held,
    the rerun pulled A1 back and item 8 dropped A2 for it: A2 was lost on
    every device. Fix (Revision 2 item 9): a pulled change drops a held
    edit only when it is a tombstone (the server's R2) or its `updatedAt`
    is strictly later than the local row's; otherwise it is shadowed. The
    proposal was to mirror the server's last-write-wins exactly; the
    server compares no timestamps at all (`merge.ts` R3 orders by arrival,
    `seq`), and a held edit has not arrived, so only R2 is mirrored
    exactly and the rest is a clock comparison, which item 9 says. Equal
    times keep the held edit; nothing is applied or advanced for a
    shadowed change beyond the page's cursor, as for any shadowed change.
    Tests: H16 in the mapping.
  - **B-2, fixed in `3282cb8` (tests completed in `97c2ccb`) as proposed,
    pending the maintainer; not re-verified.** Step 1 released every held
    entry, so a push that failed before step 2 read them all left
    still-blocked entries unheld to shadow the next pull. Fix (Revision 2
    item 10): step 1 judges each held entry where it lies and releases, in
    one call, only the ones nothing blocks; a failure anywhere leaves every
    still-blocked entry held. Tests: H17 in the mapping.
  - **L-1 = round 1's O2, not fixed (low).** A fix of the refused row
    written mid-push is held for one cycle; the controller's rerun sends
    it. Nothing is lost.
- **Findings, description and mapping:**
  - **Item 6** (the soft-delete release) reported for the human, as
    before; still pending.
  - **D-1, fixed in `c4499fe` and `3282cb8`:** §6's rows "A held row is
    lost" and "A held edit overwrites another device's later change" now
    name H16 and H17, with a new row for an older pulled change; the
    manual (en and sv) no longer says a dropped held change fares "as it
    would have been had it synced in time", and says the two devices'
    clocks decide.
  - **The Swedish term, fixed in `3ec10d5`:** the refused line said
    "avvisades" and the held line "nekad"; both say "nekad", as §2.4, and
    so does the manual's section. The i18n gate passes.
  - **This report was stale at `b399be4`:** the approval state, "round 3:
    pending", the Known limits and the 4-against-5 timeouts. Refreshed.
  - Coverage notes, no finding: the property test generates complete
    pushes only; F8's route case does not pin a tombstone linked to a
    refused row; F11 checks coverage, not `FAMILY_KIND` (round 1's O1).
- **Fixed after the last verified state, therefore unverified:**
  `c4499fe` (item 9), `3282cb8` and `97c2ccb` (item 10), `3ec10d5` (the
  Swedish wording). Round 4 is pending the maintainer.

**Builder's adversarial pass.** A hostile payload in the family walk: a
non-object, a numeric or null parent id, an index past the push, a
tombstone that carries a payload, the same row twice in one push (session:
refused with it; firearm: not below itself, so not refused). A held entry
rewritten mid-push (rev-matched hold misses, the write goes out as a new
change). A refused row written again after step 1 in the same cycle (held,
then released by the next cycle's step 1). A refused row gone locally, and
an orphan whose parent is missing. 600 held entries with a 500 batch.

## Known limits

- **Revision 2 items 6, 9 and 10 are pending the maintainer**; items 1–5,
  7 and 8 are approved.
- **The web entry page says "Saved" for a family refusal** (B2) that does not
  touch a firearm row (Revision 2 item 4); the web is unchanged as the spec
  says.
- **Within the first push, rows linked only through an absent row are not
  seen** (C4, F4); the phone's hold covers later pushes.
- **A refusal no edit can fix holds its session** until an app update
  fixes the writer (Q3); the held count is the signal.
- **Items 9 and 10 are unverified:** they came after round 3's state
  (`b399be4`), and round 4 needs the maintainer's approval.
- **The phone's clock decides between a held edit and a pulled change**
  (item 9), where the server decides by arrival: a later write from a
  device whose clock is behind loses to the held edit, and one from a
  device whose clock is ahead wins over it. A pulled tombstone always
  wins, as on the server.
- **A fix of the refused row written mid-push is held for one cycle**
  (round 1's O2, round 3's L-1); the controller's rerun sends it.
- **A held session's firearm counts its rounds anyway** (round 2, O-1):
  the phone's session and shot writers move `firearms.round_count`
  (`app/src/db/queries/firearm-counters.ts`); the firearm row is a
  reference, never held, so other devices count rounds from a session they
  do not have. Within the approved design (C1), but not discussed there.
  For the maintainer.
- **The web preview cannot sign in** without binding `fetch` (above).
- **The manual mutation script counts a timeout as a kill**, as before.
