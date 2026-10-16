# Refuse a refused row's whole family — evidence

Spec: `docs/specs/sync-family-refusal-spec.md` (issue #856, PR #857).

**Spec approval: obtained** for the spec as approved on 2026-10-16 ("Approve
all", Q1–Q4 as recommended). **Revision 2 is not approved**: it records five
places where the approved text was wrong or silent, found during
implementation. The one that changes a test assertion is item 1 (P8, below);
it is its own commit (`3557991`) so it can be reverted alone.

- **Source state:** the head of `feature/856-sync-family-refusal` that this
  report is committed in; code last changed at `278dac3` (the commits after
  it touch docs only). Branched from `192ef38`, which has `main` at
  `e93d808` merged in.
- **Toolchain:** Node 24.21.0, pnpm 12.11.2, vitest 5.0.3,
  `@cloudflare/vitest-plugin` 1.4.0 (backend), Stryker 10.0.0 with the vitest
  runner, fast-check 4.10.2, jest-expo (app). No dependency added.
- **Entry point:** `pnpm check` from the repo root, then
  `cd backend && npx vitest run --testTimeout=60000` (and once more with
  `--sequence.shuffle`), then `node scripts/manual-mutation-sync-push.mjs`
  and
  `npx stryker run --mutate 'shared/src/sync/family.ts,shared/src/sync/merge.ts,shared/src/sync-client/engine.ts,shared/src/sync-client/status.ts'`,
  then the docs gates.
- **Tier 3** (the sync engine's push path). Isolation: the worktree
  `/home/claude/wt856`, its dependencies reinstalled there with
  `pnpm i --frozen-lockfile` (the worktree's `shared/node_modules` lacked
  `drizzle-orm` until then, so the backend could not load `shared/src/sync`).

## Spec → tests

| Scenario                                        | Test                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 a refused session refuses its push family    | `backend/test/sync-family-refusal.spec.ts` "F1 …" (acks, no row stored, `last_seq` 0, idempotency record `rejected`/`family_refused`/no seq)                                                                                                                                                                         |
| F2 a refused shot refuses its session's family  | backend "F2 …"; `family.test.ts` "refuses a session family up, across and down from a refused series"                                                                                                                                                                                                                |
| F3 siblings through a bare parent id            | backend "F3 …"; `family.test.ts` "links siblings through a parent that is not in the push"                                                                                                                                                                                                                           |
| F4 unlinked rows are not refused (C4)           | backend "F4 …"                                                                                                                                                                                                                                                                                                       |
| F5 other families untouched                     | backend "F5 …"; `family.test.ts` "keeps two sessions apart"                                                                                                                                                                                                                                                          |
| F6 firearm down only                            | backend "F6 …" (both halves); `family.test.ts` "refuses only below a refused firearm, never a sibling firearm row"                                                                                                                                                                                                   |
| F7 references are not families                  | backend "F7 …" (a firearm refused earlier; and in the same push, with a refused tag and a link to it)                                                                                                                                                                                                                |
| F8 tombstones never family-refused              | backend "F8 …"; `family.test.ts` "never returns a tombstone, and a tombstone links nothing" and "… even when it carries a payload"; property "tombstones are never refused"                                                                                                                                          |
| F9 replay as duplicate with its reason          | backend "F9 …"                                                                                                                                                                                                                                                                                                       |
| F10 a tombstoned row still reports tombstoned   | backend "F10 …"                                                                                                                                                                                                                                                                                                      |
| F11 the ownership map covers every foreign key  | backend "F11 …" (reads `getTableConfig(table).foreignKeys` of every `SYNC_TABLES` table); `family.test.ts` "the edge lists" pins both lists by value                                                                                                                                                                 |
| H1 rows after a refused session row are held    | `backend/test/sync-client.spec.ts` "H1 …" (real engine, real Worker); `engine.test.ts` "holds every live row of a refused session's family and sends the rest (step 2, H1)"; the line: `app/src/features/account/account-screen.test.tsx` "the held-changes line"; the running app, screenshot below                 |
| H2 fixing the refused row sends the family      | backend "H2 …" (one push of R1, T1, T2, s1, all applied; device B receives them); `engine.test.ts` "releases the family when the refused row is queued again (step 1, H2)"                                                                                                                                           |
| H3 family-refused rows are held, not lost       | backend "H3 …" (held, `clientChangeId` null, then new ids and applied); `engine.test.ts` "holds a family_refused (rejected/duplicate) entry …" and "leaves an entry rewritten mid-push unheld … (rev-matched)"                                                                                                       |
| H4 a refused shot freezes the session           | backend "H4 …" (device B keeps the old name and has no T3); `engine.test.ts` "a refused shot holds its siblings, its series and its session (H4)"                                                                                                                                                                    |
| H5 refused firearm holds its rows only          | backend "H5 …"; `engine.test.ts` "(H5)", "only a refused firearm blocks a firearm's rows, not another row with its id", "holds a refused firearm's own entry written after step 1"                                                                                                                                   |
| H6 a refused license holds only itself          | backend "H6 …"; `engine.test.ts` "(H6)"                                                                                                                                                                                                                                                                              |
| H7 deleting the refused row releases the family | backend "H7 …"                                                                                                                                                                                                                                                                                                       |
| H8 a pull replacing the refused row releases    | backend "H8 …" (device B's valid T2 pulled; T3 pushed in the same cycle); `engine.test.ts` "releases the family when a pull replaces the refused row (H8)" and "a pull of an unrelated row releases nothing"                                                                                                         |
| H9 held entries never stall the outbox          | backend "H9 …" (600 held, 10 tags: one push of 10, `status: ok`); `engine.test.ts` "(H9)"                                                                                                                                                                                                                            |
| H10 tombstones are never held                   | backend "H10 …"; `engine.test.ts` "never holds a tombstone (H10)" (the hold check reads the local row's payload, which a tombstone keeps, so only the `deletedAt` guard lets it through)                                                                                                                             |
| H11 the held count survives a restart           | `app/src/db/queries/sync-store.test.ts` "H11 the held count survives a restart" (held entries copied to a file with `VACUUM INTO`, reopened, counted by a fresh store); `sync-controller.test.ts` "is read from the store on a refresh, with no cycle (H11)"; `account-screen.test.tsx` "shows it after a restart …" |
| H12 the web reports a family refusal            | backend "H12 …" (`pushChanges` against the real Worker: `partlyRejected` with `invalid_payload` and `family_refused`; a replay too). **The page half is not met**: see Revision 2 item 4                                                                                                                             |
| §2.3 the SQLite adapter                         | `sync-store.test.ts` "held entries and the refused set": `readOutbox` skips held, `heldCount`/`pendingCount`, hold resets the id, rev-matched hold, an edit keeps `held`, `releaseHeld`, the refused set, sign-out and backup reset empty it                                                                         |
| §6 property: the refused set is the family      | `shared/src/sync/family.property.test.ts`: random session and firearm trees, shuffled, with random invalid sets — the result equals an oracle written from §2.1; no invalid row → nothing refused; tombstones never refused                                                                                          |
| §9 an orphan forms its own family               | `engine.test.ts` "an orphan whose parent is missing locally forms its own family (§9)", "a refused row that is gone locally blocks only its own id"; `family.test.ts` "familyRoot"                                                                                                                                   |

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
as regression armour for mutants Stryker had shown alive).

## Must NOT

| Constraint                             | Evidence                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N1 protocol version and shapes         | `protocol.ts` untouched; the ack shape is unchanged; `REJECTED_FAMILY = 'family_refused'` joins `merge.ts`                                                                                                                                                                     |
| N2 pull path unchanged on the server   | no diff to `pullTablePage` or the pull route                                                                                                                                                                                                                                   |
| N3 atomicity and P1–P12 unchanged      | `sync-concurrency.spec.ts`, `sync.spec.ts` and every P test pass with unchanged assertions **except P8**, whose fixture is F2's shape (Revision 2 item 1, commit `3557991`). The manual mutation script's 19 older mutants are still killed                                    |
| N4 a valid family behaves as today     | property "a push with no invalid row is unaffected"; `engine.test.ts` "with nothing refused, reads no extra rows and releases nothing (N4)"; every pre-existing engine and sync-client test passes                                                                             |
| N5 no server-side foreign-key check    | none in the diff; F4 applies a shot whose series is absent                                                                                                                                                                                                                     |
| N6 no id or value in a log line or ack | backend "the route logs a family refusal without ids or values (N6)" (exact line `sync push: refused 2 with their family (series, shots)`, no id); manual mutant "the family log line names row ids" killed                                                                    |
| N7 no new dependency                   | `package.json` files and the lockfile untouched                                                                                                                                                                                                                                |
| N8 no test assertion weakened          | assertions changed: P8 (to the new outcome, stricter: two rejections and nothing stored); the `held: 0`/`heldCount: 0` fields added to existing `toEqual` expectations of the result and status shapes, and `held: 0` to B4's outbox row — each adds a field, none removes one |

## Gauntlet

All numbers from runs after the last code edit (`278dac3`) unless marked.

| Layer            | Command                                                                     | Result                                                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite       | `pnpm check`                                                                | exit 1 on one app jest test that fails on `main` too (below); every gate before it passes: typecheck (root, app, web), schema, i18n (1541 keys each), licenses, lint, format; vitest 250 files, 4506 tests, coverage thresholds met; app jest 1070 of 1071 pass |
| Backend          | `npx vitest run --testTimeout=60000`                                        | 30 files, 290 tests, exit 0                                                                                                                                                                                                                                     |
| Suite health     | the same with `--sequence.shuffle`                                          | 30 files, 290 tests, seed 1792173344448, exit 0                                                                                                                                                                                                                 |
| Manual mutation  | `node scripts/manual-mutation-sync-push.mjs`                                | baseline passes; 26/26 mutants killed (12 atomicity, 7 payload validation, 7 for this change), exit 0                                                                                                                                                           |
| Stryker (scoped) | the command in the entry point                                              | 282 mutants: 276 killed, 4 timed out, 2 survived; score 99.29%. `family.ts` 98.81, `engine.ts` 99.34, `merge.ts` and `status.ts` 100. Both survivors are equivalent (below). The first run, before `278dac3`, was 97.16% with 8 survivors                       |
| Coverage         | inside `pnpm check` (`vitest run --coverage`)                               | 100% on the gauntlet modules, `family.ts` included through `shared/src/sync/*.ts` (no `stryker.config.json` change needed); exits nonzero below it                                                                                                              |
| Property         | fast-check in `family.property.test.ts`                                     | passes inside the suite. Not run as a mutation suite alone, so no claim that the properties by themselves kill a mutant                                                                                                                                         |
| Real execution   | H1–H10 in `sync-client.spec.ts`; F1–F11 and H12 in workerd; the running app | pass; and the web preview against a local `wrangler dev` (below)                                                                                                                                                                                                |
| Docs             | `mkdocs build --strict`, `docs-anchor-check`, `docs-translation-check`      | build passes; 29 translated pages current; no dangling anchors                                                                                                                                                                                                  |

**Equivalent mutants.** `family.ts:97` `edges.get(next) ?? []` →
`?? ["Stryker was here"]`: a leaf node gains a neighbour key no change has,
so nothing more is refused. `engine.ts:112` `firearmId ?? ''` →
`?? "Stryker was here!"`: neither string is a refused firearm's id. The four
timeouts are loop-bound mutants (counted as killed by Stryker).

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

**Not performed.** §7 asks for a separate verifier pass on the final state
(Tier 3). This run had no way to start a fresh-context agent, so the state
was verified by no one but its builder. The adversarial pass below is the
builder's own and shares its blind spots. Declared downgrade: the caller or
the maintainer should run `references/verifier.md` on this head before
merging.

**Builder's adversarial pass.** A hostile payload in the family walk: a
non-object, a numeric or null parent id, an index past the push, a
tombstone that carries a payload, the same row twice in one push (session:
refused with it; firearm: not below itself, so not refused). A held entry
rewritten mid-push (rev-matched hold misses, the write goes out as a new
change). A refused row written again after step 1 in the same cycle (held,
then released by the next cycle's step 1). A refused row gone locally, and
an orphan whose parent is missing. 600 held entries with a 500 batch.

## Known limits

- **Revision 2 is pending the maintainer**, P8 most of all.
- **The web entry page says "Saved" for a family refusal** that does not
  touch a firearm row (Revision 2 item 4); the web is unchanged as the spec
  says.
- **Within the first push, rows linked only through an absent row are not
  seen** (C4, F4); the phone's hold covers later pushes.
- **A refusal no edit can fix holds its session** until an app update
  fixes the writer (Q3); the held count is the signal.
- **`pnpm check` has one failure that predates this change:** `app/src/features/compliance/license-check-screens.test.tsx` "lists every firearm …" expects the literal "Can be met from Oct 15, 2027" for a firearm created at test time, so it fails from 2026-10-16 on. It fails the same way on `main` at `e93d808` (run in a scratch worktree of that commit), and this change touches nothing it reads. Not fixed here: it is outside #856, and fixing it means editing an assertion
- **The web preview cannot sign in** without binding `fetch` (above).
- **The manual mutation script counts a timeout as a kill**, as before.
